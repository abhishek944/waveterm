// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmdrunner

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/abhishek944/waveterm/waveshell/pkg/packet"
	"github.com/abhishek944/waveterm/waveshell/pkg/shellutil"
	"github.com/abhishek944/waveterm/wavesrv/pkg/remote"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbase"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

func ThreadCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	// Resolve UI IDs
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_RemoteConnected)
	if err != nil {
		return nil, fmt.Errorf("/thread error: %w", err)
	}

	// Get the prompt from command arguments - join all args together
	cmdStr := strings.Join(pk.Args, " ")
	if cmdStr == "" {
		return nil, fmt.Errorf("/thread error: no prompt provided")
	}

	// Extract AI provider from kwargs if specified
	provider := ""
	if providerArg, ok := pk.Kwargs["provider"]; ok {
		provider = providerArg
	}

	// Get client data
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("/thread error: cannot retrieve client data: %w", err)
	}

	// Create term options for the command
	termOpts := sstore.TermOpts{
		Rows:       shellutil.DefaultTermRows,
		Cols:       shellutil.DefaultTermCols,
		FlexRows:   true,
		MaxPtySize: remote.DefaultMaxPtySize,
	}

	// Create command for thread mode
	cmd := &sstore.CmdType{
		ScreenId:  ids.ScreenId,
		LineId:    scbase.GenWaveUUID(),
		CmdStr:    pk.GetRawStr(),
		RawCmdStr: pk.GetRawStr(),
		Remote:    ids.Remote.RemotePtr,
		TermOpts:  termOpts,
		Status:    sstore.CmdStatusDone, // Set as done, not running
		RunOut:    nil,
	}
	// Copy FeState from remote if available
	if ids.Remote != nil && ids.Remote.FeState != nil {
		cmd.FeState = ids.Remote.FeState
	}

	// Add thread mode line
	line, err := sstore.AddThreadModeLine(ctx, ids.ScreenId, DefaultUserId, cmd)
	if err != nil {
		return nil, fmt.Errorf("/thread error: cannot add line: %w", err)
	}

	// Create PTY file for output
	err = sstore.CreateCmdPtyFile(ctx, cmd.ScreenId, cmd.LineId, cmd.TermOpts.MaxPtySize)
	if err != nil {
		return nil, fmt.Errorf("/thread error: cannot create ptyout file: %w", err)
	}

	// Resolve thread id from kwargs (thread selection from UI). If absent, create a new thread.
	threadId := pk.Kwargs["threadid"]
	if threadId == "" {
		thr, terr := sstore.CreateThread(ctx, ids.SessionId, ids.ScreenId, "Thread")
		if terr != nil {
			return nil, fmt.Errorf("/thread error: cannot create thread: %w", terr)
		}
		threadId = thr.ThreadId
	}
	// Associate the line with the thread
	if err := sstore.AddThreadLine(ctx, threadId, ids.ScreenId, line); err != nil {
		return nil, fmt.Errorf("/thread error: cannot add thread line: %w", err)
	}
	// Push updated thread list for this screen to FE
	if threads, lerr := sstore.ListThreads(ctx, ids.ScreenId); lerr == nil {
		items := make([]map[string]string, 0, len(threads))
		for _, t := range threads {
			items = append(items, map[string]string{"threadid": t.ThreadId, "name": t.Name})
		}
		update := scbus.MakeUpdatePacket()
		update.AddUpdate(sstore.ThreadsUpdateType{ScreenId: ids.ScreenId, Items: items})
		scbus.MainUpdateBus.DoUpdate(update)
	}

	// Get all thread lines for this thread to build conversation
	threadLines, err := sstore.GetThreadLinesByThread(ctx, threadId)
	if err != nil {
		return nil, fmt.Errorf("/thread error: cannot get thread lines: %w", err)
	}

	// Build conversation from thread lines
	conversation := []packet.OpenAIPromptMessageType{}
	for _, tline := range threadLines {
		// Add user messages
		if tline.UserQuery != "" {
			conversation = append(conversation, packet.OpenAIPromptMessageType{
				Role:    "user",
				Content: tline.UserQuery,
			})
		}
		// Add assistant responses
		if tline.AssistantResponse != "" {
			conversation = append(conversation, packet.OpenAIPromptMessageType{
				Role:    "assistant",
				Content: tline.AssistantResponse,
			})
		}
	}

	// Add current user query
	conversation = append(conversation, packet.OpenAIPromptMessageType{
		Role:    "user",
		Content: cmdStr,
	})

	// Save user query to thread line
	err = sstore.UpdateThreadLineUserQuery(ctx, threadId, ids.ScreenId, line.LineId, cmdStr)
	if err != nil {
		log.Printf("thread error updating user query: %v\n", err)
	}

	// Run thread mode in goroutine
	go func() {
		// Create a new context that won't be canceled when the parent function returns
		bgCtx := context.Background()
		originalPk := pk  // Save original command packet for later use
		originalIds := ids  // Save original ids for later use
		response, err := RunThreadMode(bgCtx, pk, clientData, conversation, provider)
		if err != nil {
			writeErrorToPty(cmd, fmt.Sprintf("thread error: %v", err), 0)
			return
		}

		// Handle streaming response
		if response.Stream != nil {
			var outputPos int64
			var fullResponse strings.Builder
			packetTimeout := OpenAIPacketTimeout

			for {
				select {
				case <-time.After(packetTimeout):
					writeErrorToPty(cmd, "timeout waiting for response", outputPos)
					return
				case pk, ok := <-response.Stream:
					if !ok {
						// Channel closed, parse the response
						responseText := fullResponse.String()
						log.Printf("[ThreadCommand] Stream closed, final response: %s", responseText)

						// Try to parse as JSON for structured output
						threadResp, err := ParseThreadModeResponse(responseText)
						if err != nil {
							// Fallback: treat as plain text if not valid JSON
							log.Printf("thread mode: could not parse structured response, treating as plain text: %v", err)
							// Write the explanation part
							err = writeTextToPty(bgCtx, cmd, responseText+"\n", &outputPos)
							if err != nil {
								log.Printf("error writing response to ptybuffer: %v", err)
							}
							// Save response
							err = sstore.UpdateThreadLineAssistantResponse(bgCtx, threadId, ids.ScreenId, line.LineId, responseText)
							if err != nil {
								log.Printf("thread error updating assistant response: %v\n", err)
							}
						} else {
							// Save structured response to database
							err = sstore.UpdateThreadLineAssistantResponse(bgCtx, threadId, ids.ScreenId, line.LineId, responseText)
							if err != nil {
								log.Printf("thread error updating assistant response: %v\n", err)
							}
							
							// For thread mode, write the JSON to PTY for the frontend to parse
							// The ThreadModeRenderer expects this format
							err = writeTextToPty(bgCtx, cmd, responseText, &outputPos)
							if err != nil {
								log.Printf("error writing response to ptybuffer: %v", err)
							}

							// Save command and execute it within thread context
							if threadResp.Command != "" {
								err = sstore.UpdateThreadLineCommand(bgCtx, threadId, ids.ScreenId, line.LineId, threadResp.Command)
								if err != nil {
									log.Printf("thread error updating command: %v\n", err)
								}
								
								// Execute command within the same thread line
								cmdExecLineId, err := ExecuteCommandInThread(bgCtx, ids.SessionId, threadId, ids.ScreenId, line.LineId, threadResp.Command, &ids.Remote.RemotePtr)
								if err != nil {
									log.Printf("thread error executing command: %v\n", err)
									// Don't write error to PTY since it would interfere with the JSON response
									// The error is already logged
								} else {
									// Store command execution lineId in thread_line table for persistence
									err = sstore.UpdateThreadLineCmdLineId(bgCtx, threadId, ids.ScreenId, line.LineId, cmdExecLineId)
									if err != nil {
										log.Printf("thread error updating thread line with cmdlineid: %v\n", err)
									}
									
									// Also store in line state for immediate frontend access
									lineState := make(map[string]interface{})
									lineState["cmdexeclineid"] = cmdExecLineId
									err = sstore.UpdateLineState(bgCtx, ids.ScreenId, line.LineId, lineState)
									if err != nil {
										log.Printf("thread error updating line state with cmdexeclineid: %v\n", err)
									} else {
										// Send line update to frontend so it knows about the cmdexeclineid
										updatedLine, err := sstore.GetLineById(bgCtx, ids.ScreenId, line.LineId)
										if err == nil && updatedLine != nil {
											update := scbus.MakeUpdatePacket()
											sstore.AddLineUpdate(update, updatedLine, nil)
											scbus.MainUpdateBus.DoUpdate(update)
											log.Printf("thread sent line update with cmdexeclineid: %s\n", cmdExecLineId)
										}
									}
									
									// Start multi-turn execution loop
									go startMultiTurnExecution(bgCtx, originalPk, clientData, &originalIds, threadId, cmdExecLineId, threadResp.Command)
								}
							}
						}

						// Thread mode stays active after response (similar to agent mode)
						// Users can manually toggle it off with /thread or switch modes
						return
					}

					// Extract and accumulate text content
					if pk.Error != "" {
						writeErrorToPty(cmd, pk.Error, outputPos)
						return
					}
					if pk.Text != "" {
						fullResponse.WriteString(pk.Text)
					}
				}
			}
		}
	}()

	// Update screen
	updateHistoryContext(ctx, line, cmd, nil)
	updateMap := make(map[string]interface{})
	updateMap[sstore.ScreenField_SelectedLine] = line.LineNum
	updateMap[sstore.ScreenField_Focus] = sstore.ScreenFocusInput
	screen, err := sstore.UpdateScreen(ctx, ids.ScreenId, updateMap)
	if err != nil {
		log.Printf("thread error updating screen selected line: %v\n", err)
	}

	update := scbus.MakeUpdatePacket()
	sstore.AddLineUpdate(update, line, cmd)
	update.AddUpdate(*screen)
	return update, nil
}

// startMultiTurnExecution handles the continuous execution loop for thread mode
// It waits for command output, sends it to AI, and executes the next command
func startMultiTurnExecution(ctx context.Context, pk *scpacket.FeCommandPacketType, 
	clientData *sstore.ClientData, ids *resolvedIds, threadId string, 
	prevCmdLineId string, prevCommand string) {
	
	maxIterations := 10
	iteration := 0
	provider := ""
	if providerArg, ok := pk.Kwargs["provider"]; ok {
		provider = providerArg
	}
	
	for iteration < maxIterations {
		// Step 1: Wait for previous command to complete and get output
		output, exitCode := waitForCommandOutput(ctx, ids.ScreenId, prevCmdLineId)
		if output == "" && exitCode == -1 {
			log.Printf("Failed to get command output for %s\n", prevCmdLineId)
			break
		}
		
		// Step 2: Format command output as user input
		commandOutput := fmt.Sprintf("Command: %s\nExit Code: %d\nOutput:\n%s", 
			prevCommand, exitCode, output)
		
		// Truncate if too long
		if len(commandOutput) > 10000 {
			commandOutput = commandOutput[:10000] + "\n... (output truncated)"
		}
		
		// Step 3: Create NEW thread line
		newLineId := scbase.GenWaveUUID()
		
		// Create term options
		termOpts := sstore.TermOpts{
			Rows:       shellutil.DefaultTermRows,
			Cols:       shellutil.DefaultTermCols,
			FlexRows:   true,
			MaxPtySize: remote.DefaultMaxPtySize,
		}
		
		// Create a minimal cmd for AI analysis display
		newCmd := &sstore.CmdType{
			ScreenId:  ids.ScreenId,
			LineId:    newLineId,
			CmdStr:    "Analyzing...",
			RawCmdStr: "Analyzing...",
			Remote:    ids.Remote.RemotePtr,
			TermOpts:  termOpts,
			Status:    sstore.CmdStatusDone,
		}
		
		// Copy FeState from remote if available
		if ids.Remote != nil && ids.Remote.FeState != nil {
			newCmd.FeState = ids.Remote.FeState
		}
		
		// Step 4: Add thread mode line to database
		newLine, err := sstore.AddThreadModeLine(ctx, ids.ScreenId, DefaultUserId, newCmd)
		if err != nil {
			log.Printf("Error creating thread line: %v\n", err)
			break
		}
		
		// Step 5: Create PTY file for new line
		err = sstore.CreateCmdPtyFile(ctx, ids.ScreenId, newLineId, termOpts.MaxPtySize)
		if err != nil {
			log.Printf("Error creating PTY file: %v\n", err)
			break
		}
		
		// Step 6: Associate with thread
		err = sstore.AddThreadLine(ctx, threadId, ids.ScreenId, newLine)
		if err != nil {
			log.Printf("Error adding to thread: %v\n", err)
			break
		}
		
		// Step 7: Send line update to frontend immediately
		update := scbus.MakeUpdatePacket()
		sstore.AddLineUpdate(update, newLine, newCmd)
		scbus.MainUpdateBus.DoUpdate(update)
		
		// Step 8: Save command output as user query
		err = sstore.UpdateThreadLineUserQuery(ctx, threadId, ids.ScreenId, newLineId, commandOutput)
		if err != nil {
			log.Printf("Error updating user query: %v\n", err)
		}
		
		// Step 9: Build conversation including all thread history
		threadLines, err := sstore.GetThreadLinesByThread(ctx, threadId)
		if err != nil {
			log.Printf("Error getting thread lines: %v\n", err)
			break
		}
		
		// Build conversation from thread lines
		conversation := []packet.OpenAIPromptMessageType{}
		for _, tline := range threadLines {
			if tline.UserQuery != "" {
				conversation = append(conversation, packet.OpenAIPromptMessageType{
					Role:    "user",
					Content: tline.UserQuery,
				})
			}
			if tline.AssistantResponse != "" {
				conversation = append(conversation, packet.OpenAIPromptMessageType{
					Role:    "assistant",
					Content: tline.AssistantResponse,
				})
			}
		}
		
		// Add current command output as user message
		conversation = append(conversation, packet.OpenAIPromptMessageType{
			Role:    "user",
			Content: commandOutput,
		})
		
		// Step 10: Get AI response for this new line
		response, err := RunThreadMode(ctx, pk, clientData, conversation, provider)
		if err != nil {
			writeErrorToPty(newCmd, fmt.Sprintf("AI error: %v", err), 0)
			break
		}
		
		// Step 11: Handle streaming response
		var outputPos int64 = 0
		var fullResponse strings.Builder
		var nextCommand string
		packetTimeout := OpenAIPacketTimeout
		
		streamLoop:
		for {
			select {
			case <-time.After(packetTimeout):
				writeErrorToPty(newCmd, "timeout waiting for response", outputPos)
				break streamLoop
			case pk, ok := <-response.Stream:
				if !ok {
					// Stream closed, parse response
					responseText := fullResponse.String()
					log.Printf("[startMultiTurnExecution] AI response: %s", responseText)
					
					// Try to parse as JSON for structured output
					threadResp, err := ParseThreadModeResponse(responseText)
					if err != nil {
						// Fallback: treat as plain text if not valid JSON
						log.Printf("Could not parse structured response: %v", err)
						err = writeTextToPty(ctx, newCmd, responseText+"\n", &outputPos)
						if err != nil {
							log.Printf("Error writing response to PTY: %v", err)
						}
						// Save response
						err = sstore.UpdateThreadLineAssistantResponse(ctx, threadId, ids.ScreenId, newLineId, responseText)
						if err != nil {
							log.Printf("Error updating assistant response: %v\n", err)
						}
					} else {
						// Save structured response to database
						err = sstore.UpdateThreadLineAssistantResponse(ctx, threadId, ids.ScreenId, newLineId, responseText)
						if err != nil {
							log.Printf("Error updating assistant response: %v\n", err)
						}
						
						// Write JSON to PTY for frontend
						err = writeTextToPty(ctx, newCmd, responseText, &outputPos)
						if err != nil {
							log.Printf("Error writing response to PTY: %v", err)
						}
						
						// Check if there's a command
						if threadResp.Command != "" {
							nextCommand = threadResp.Command
							err = sstore.UpdateThreadLineCommand(ctx, threadId, ids.ScreenId, newLineId, threadResp.Command)
							if err != nil {
								log.Printf("Error updating command: %v\n", err)
							}
							
							// Step 12: Execute command for this new line
							cmdExecLineId, err := ExecuteCommandInThread(ctx, ids.SessionId, threadId, 
								ids.ScreenId, newLineId, nextCommand, &ids.Remote.RemotePtr)
							if err != nil {
								log.Printf("Error executing command: %v\n", err)
								break streamLoop
							}
							
							// Update thread line with cmdExecLineId
							err = sstore.UpdateThreadLineCmdLineId(ctx, threadId, ids.ScreenId, newLineId, cmdExecLineId)
							if err != nil {
								log.Printf("Error updating thread line with cmdlineid: %v\n", err)
							}
							
							// Update line state for frontend
							lineState := make(map[string]interface{})
							lineState["cmdexeclineid"] = cmdExecLineId
							err = sstore.UpdateLineState(ctx, ids.ScreenId, newLineId, lineState)
							if err != nil {
								log.Printf("Error updating line state: %v\n", err)
							} else {
								// Send line update with cmdexeclineid
								updatedLine, err := sstore.GetLineById(ctx, ids.ScreenId, newLineId)
								if err == nil && updatedLine != nil {
									update := scbus.MakeUpdatePacket()
									sstore.AddLineUpdate(update, updatedLine, nil)
									scbus.MainUpdateBus.DoUpdate(update)
									log.Printf("Sent line update with cmdexeclineid: %s\n", cmdExecLineId)
								}
							}
							
							// Update for next iteration
							prevCmdLineId = cmdExecLineId
							prevCommand = nextCommand
						}
					}
					break streamLoop
				}
				
				// Extract and accumulate text content
				if pk.Error != "" {
					log.Printf("[startMultiTurnExecution] Received error packet: %s", pk.Error)
					writeErrorToPty(newCmd, pk.Error, outputPos)
					break streamLoop
				}
				if pk.Text != "" {
					fullResponse.WriteString(pk.Text)
				}
			}
		}
		
		// Step 13: Check if we should continue
		if nextCommand == "" {
			log.Printf("Thread execution complete - no more commands")
			break
		}
		
		iteration++
		log.Printf("Thread execution iteration %d complete, moving to next command", iteration)
	}
	
	if iteration >= maxIterations {
		log.Printf("Thread execution stopped - max iterations reached")
	}
}

// waitForCommandOutput waits for a command to complete and returns its output
func waitForCommandOutput(ctx context.Context, screenId string, cmdLineId string) (string, int) {
	maxWaitTime := 5 * time.Minute
	startTime := time.Now()
	
	for {
		// Check if context is cancelled
		select {
		case <-ctx.Done():
			return "", -1
		default:
		}
		
		// Check timeout
		if time.Since(startTime) > maxWaitTime {
			log.Printf("Timeout waiting for command %s to complete", cmdLineId)
			return "Command execution timeout", -1
		}
		
		// Get command status
		cmd, err := sstore.GetCmdByScreenId(ctx, screenId, cmdLineId)
		if err != nil {
			log.Printf("Error getting command: %v", err)
			return "", -1
		}
		
		if cmd.Status == sstore.CmdStatusDone || cmd.Status == sstore.CmdStatusError {
			// Read PTY output
			ptyPath, err := scbase.PtyOutFile(screenId, cmdLineId)
			if err != nil {
				log.Printf("Error getting PTY path: %v", err)
				return "Error getting command output path", cmd.ExitCode
			}
			outputBytes, err := os.ReadFile(ptyPath)
			if err != nil {
				log.Printf("Error reading PTY output: %v", err)
				return "Error reading command output", cmd.ExitCode
			}
			
			return string(outputBytes), cmd.ExitCode
		}
		
		// Wait a bit before checking again
		time.Sleep(100 * time.Millisecond)
	}
}
