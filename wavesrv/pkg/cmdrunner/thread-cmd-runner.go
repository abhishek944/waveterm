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

func ThreadInstructionCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	// Get instruction type and line ID from args
	if len(pk.Args) < 2 {
		return nil, fmt.Errorf("thread:instruction requires instruction_type and lineid arguments")
	}
	
	instructionType := pk.Args[0]
	lineId := pk.Args[1]
	
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}
	
	// Get the line to verify it's a thread line
	line, err := sstore.GetLineById(ctx, ids.ScreenId, lineId)
	if err != nil {
		return nil, fmt.Errorf("line not found: %v", err)
	}
	
	if line.LineType != sstore.LineTypeThreadMode {
		return nil, fmt.Errorf("not a thread mode line")
	}
	
	// Get thread ID from thread_line table
	var threadId string
	err = sstore.WithTx(ctx, func(tx *sstore.TxWrap) error {
		query := `SELECT threadid FROM thread_line WHERE lineid = ?`
		threadIds := tx.SelectStrings(query, lineId)
		if len(threadIds) == 0 {
			return fmt.Errorf("thread line not found")
		}
		threadId = threadIds[0]
		return nil
	})
	if err != nil {
		return nil, err
	}
	
	// Handle different instruction types
	switch instructionType {
	case "cmd_accept":
		// Get the command from thread line data
		threadLine, err := sstore.GetThreadLineByLineId(ctx, lineId)
		if err != nil || threadLine == nil {
			return nil, fmt.Errorf("thread line not found or error getting thread line: %v", err)
		}
		
		if threadLine.Command == "" {
			return nil, fmt.Errorf("no command found in thread line")
		}
		
		// Update status to accepted
		err = sstore.UpdateThreadLineCmdExecutionStatus(ctx, threadId, ids.ScreenId, lineId, "accepted")
		if err != nil {
			log.Printf("error updating cmd execution status: %v\n", err)
		}
		
		// Execute the command
		cmdExecLineId, err := ExecuteCommandInThread(
			ctx, ids.SessionId, threadId, ids.ScreenId,
			lineId, threadLine.Command, &ids.Remote.RemotePtr,
		)
		
		if err != nil {
			return nil, fmt.Errorf("failed to execute command: %v", err)
		}
		
		// Update thread line with command execution ID
		err = sstore.UpdateThreadLineCmdLineId(ctx, threadId, ids.ScreenId, lineId, cmdExecLineId)
		if err != nil {
			log.Printf("error updating thread line with cmdlineid: %v\n", err)
		}
		
		
		// Send update with cmd_execution_status and cmdexeclineid
		updatedLine, _ := sstore.GetLineById(ctx, ids.ScreenId, lineId)
		if updatedLine != nil {
			// Add cmd_execution_status to line state for frontend
			if updatedLine.LineState == nil {
				updatedLine.LineState = make(map[string]interface{})
			}
			updatedLine.LineState["cmdexecutionstatus"] = "accepted"
			
			// Get thread line data to include cmdlineid in linestate
			threadLineData, _ := sstore.GetThreadLineByLineId(ctx, lineId)
			if threadLineData != nil && threadLineData.CmdLineId != "" {
				updatedLine.LineState["cmdexeclineid"] = threadLineData.CmdLineId
			}
		}
		update := scbus.MakeUpdatePacket()
		sstore.AddLineUpdate(update, updatedLine, nil)
		
		// Continue multi-turn execution after user approval
		// Get client data for AI calls
		clientData, err := sstore.EnsureClientData(ctx)
		if err == nil {
			// Get the provider from client options
			provider := ""
			if clientData.AIOpts != nil && clientData.AIOpts.Default != "" {
				provider = clientData.AIOpts.Default
			}
			
			// Get execution mode from client AI options
			executionMode := "manual"
			if clientData.AIOpts != nil && clientData.AIOpts.ThreadExecutionMode != "" {
				executionMode = clientData.AIOpts.ThreadExecutionMode
			}
			
			// Create a minimal packet with necessary info for multi-turn execution
			multiTurnPk := &scpacket.FeCommandPacketType{
				Kwargs: make(map[string]string),
			}
			multiTurnPk.Kwargs["provider"] = provider
			multiTurnPk.Kwargs["threadexecutionmode"] = executionMode
			
			// Start multi-turn execution in background
			go func() {
				bgCtx := context.Background()
				startMultiTurnExecution(bgCtx, multiTurnPk, clientData, &ids, threadId, cmdExecLineId, threadLine.Command)
			}()
		}
		
		return update, nil
		
	case "cmd_reject":
		// Update status to rejected
		err = sstore.UpdateThreadLineCmdExecutionStatus(ctx, threadId, ids.ScreenId, lineId, "rejected")
		if err != nil {
			log.Printf("error updating cmd execution status: %v\n", err)
		}
		
		// Send update with cmd_execution_status
		updatedLine, _ := sstore.GetLineById(ctx, ids.ScreenId, lineId)
		if updatedLine != nil {
			// Add cmd_execution_status to line state for frontend
			if updatedLine.LineState == nil {
				updatedLine.LineState = make(map[string]interface{})
			}
			updatedLine.LineState["cmdexecutionstatus"] = "rejected"
		}
		update := scbus.MakeUpdatePacket()
		sstore.AddLineUpdate(update, updatedLine, nil)
		
		return update, nil
		
	case "force_stop":
		// TODO: Implement force stop logic
		// This should stop any ongoing multi-turn execution
		return nil, fmt.Errorf("force_stop not implemented yet")
		
	default:
		return nil, fmt.Errorf("unknown instruction type: %s", instructionType)
	}
}

func ThreadCreateCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	// Need screenId
	if len(pk.Args) < 1 {
		return nil, fmt.Errorf("/thread:create requires 1 argument (screenId)")
	}
	
	screenId := pk.Args[0]
	
	// Resolve UI IDs
	ids, err := resolveUiIds(ctx, pk, R_Session)
	if err != nil {
		return nil, fmt.Errorf("/thread:create error: %w", err)
	}
	
	// Create a new thread
	thread, err := sstore.CreateThread(ctx, ids.SessionId, screenId, "Thread")
	if err != nil {
		return nil, fmt.Errorf("/thread:create error: cannot create thread: %w", err)
	}
	
	log.Printf("[ThreadCreateCommand] Created new thread: %s", thread.ThreadId)
	
	// Push updated thread list
	if threads, lerr := sstore.ListThreads(ctx, screenId); lerr == nil {
		items := make([]map[string]string, 0, len(threads))
		for _, t := range threads {
			items = append(items, map[string]string{"threadid": t.ThreadId, "name": t.Name})
		}
		update := scbus.MakeUpdatePacket()
		update.AddUpdate(sstore.ThreadsUpdateType{ScreenId: screenId, Items: items})
		
		// Also set this as the active thread
		update.AddUpdate(sstore.ActiveThreadIdUpdateType{
			ScreenId: screenId,
			ThreadId: thread.ThreadId,
		})
		
		return update, nil
	}
	
	return nil, nil
}

func ThreadAddLineCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	log.Printf("[ThreadAddLineCommand] Called with args: %v", pk.Args)
	
	// Need lineId and threadId
	if len(pk.Args) < 2 {
		return nil, fmt.Errorf("/thread:addline requires 2 arguments (lineId and threadId)")
	}
	
	lineId := pk.Args[0]
	threadId := pk.Args[1]
	
	log.Printf("[ThreadAddLineCommand] lineId: %s, threadId: %s", lineId, threadId)
	
	// Resolve UI IDs
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, fmt.Errorf("/thread:addline error: %w", err)
	}
	
	// Get the line to verify it exists
	line, err := sstore.GetLineById(ctx, ids.ScreenId, lineId)
	if err != nil {
		return nil, fmt.Errorf("/thread:addline error: line not found: %v", err)
	}
	
	log.Printf("[ThreadAddLineCommand] Found line type: %s, existing linestate: %+v", line.LineType, line.LineState)
	
	// Call the AddExistingLineToThread function from sstore
	err = sstore.AddExistingLineToThread(ctx, threadId, ids.ScreenId, lineId)
	if err != nil {
		return nil, fmt.Errorf("/thread:addline error: %v", err)
	}
	
	// Get the updated line to send back
	line, err = sstore.GetLineById(ctx, ids.ScreenId, lineId)
	if err != nil {
		return nil, fmt.Errorf("/thread:addline error getting updated line: %v", err)
	}
	
	log.Printf("[ThreadAddLineCommand] Updated line linestate: %+v", line.LineState)
	
	// Send line update to frontend
	update := scbus.MakeUpdatePacket()
	sstore.AddLineUpdate(update, line, nil)
	
	return update, nil
}

func ThreadRemoveLineCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	log.Printf("[ThreadRemoveLineCommand] Called with args: %v", pk.Args)
	
	// Need lineId and threadId
	if len(pk.Args) < 2 {
		return nil, fmt.Errorf("/thread:removeline requires 2 arguments (lineId and threadId)")
	}
	
	lineId := pk.Args[0]
	threadId := pk.Args[1]
	
	log.Printf("[ThreadRemoveLineCommand] lineId: %s, threadId: %s", lineId, threadId)
	
	// Resolve UI IDs
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, fmt.Errorf("/thread:removeline error: %w", err)
	}
	
	// Get the line to verify it exists
	line, err := sstore.GetLineById(ctx, ids.ScreenId, lineId)
	if err != nil {
		return nil, fmt.Errorf("/thread:removeline error: line not found: %v", err)
	}
	
	log.Printf("[ThreadRemoveLineCommand] Found line type: %s, existing linestate: %+v", line.LineType, line.LineState)
	
	// Don't allow removing thread mode lines from their thread
	if line.LineType == sstore.LineTypeThreadMode {
		return nil, fmt.Errorf("/thread:removeline error: cannot remove thread mode lines from threads")
	}
	
	// Call the RemoveLineFromThread function from sstore
	err = sstore.RemoveLineFromThread(ctx, threadId, ids.ScreenId, lineId)
	if err != nil {
		return nil, fmt.Errorf("/thread:removeline error: %v", err)
	}
	
	// Get the updated line to send back
	line, err = sstore.GetLineById(ctx, ids.ScreenId, lineId)
	if err != nil {
		return nil, fmt.Errorf("/thread:removeline error getting updated line: %v", err)
	}
	
	log.Printf("[ThreadRemoveLineCommand] Updated line linestate: %+v", line.LineState)
	
	// Send line update to frontend
	update := scbus.MakeUpdatePacket()
	sstore.AddLineUpdate(update, line, nil)
	
	return update, nil
}

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
	// Copy StatePtr from remote if available (consistent with agent mode)
	if ids.Remote != nil && ids.Remote.StatePtr != nil {
		cmd.StatePtr = *ids.Remote.StatePtr
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
		
		// Push updated thread list immediately after creating new thread
		// This ensures the frontend knows about the new thread before we send the line update
		if threads, lerr := sstore.ListThreads(ctx, ids.ScreenId); lerr == nil {
			items := make([]map[string]string, 0, len(threads))
			for _, t := range threads {
				items = append(items, map[string]string{"threadid": t.ThreadId, "name": t.Name})
			}
			update := scbus.MakeUpdatePacket()
			update.AddUpdate(sstore.ThreadsUpdateType{ScreenId: ids.ScreenId, Items: items})
			scbus.MainUpdateBus.DoUpdate(update)
			
		}
	}

	// Associate the line with the thread
	if err := sstore.AddThreadLine(ctx, threadId, ids.ScreenId, line); err != nil {
		return nil, fmt.Errorf("/thread error: cannot add thread line: %w", err)
	}
	
	// Add threadid to line state so frontend knows which thread this line belongs to
	// AddThreadLine will also update this in the database, but we need it here for the immediate update
	if line.LineState == nil {
		line.LineState = make(map[string]interface{})
	}
	// Store as a list since a line can belong to multiple threads
	line.LineState["threadids"] = []string{threadId}

	// Get all thread lines for this thread to build conversation
	threadLines, err := sstore.GetThreadLinesByThread(ctx, threadId)
	if err != nil {
		return nil, fmt.Errorf("/thread error: cannot get thread lines: %w", err)
	}
	
	// Check if the last thread line has a pending command (status "waiting")
	// If so, mark it as rejected before proceeding with new request
	if len(threadLines) > 0 {
		lastLine := threadLines[len(threadLines)-1]
		if lastLine.CmdExecutionStatus == "waiting" {
			err = sstore.UpdateThreadLineCmdExecutionStatus(ctx, threadId, ids.ScreenId, lastLine.LineId, "rejected")
			if err != nil {
				log.Printf("thread error: failed to reject pending command: %v\n", err)
			}
			
			// Send update to frontend
			updatedLine, _ := sstore.GetLineById(ctx, ids.ScreenId, lastLine.LineId)
			if updatedLine != nil {
				// Add cmd_execution_status to line state for frontend
				if updatedLine.LineState == nil {
					updatedLine.LineState = make(map[string]interface{})
				}
				updatedLine.LineState["cmdexecutionstatus"] = "rejected"
				
				update := scbus.MakeUpdatePacket()
				sstore.AddLineUpdate(update, updatedLine, nil)
				scbus.MainUpdateBus.DoUpdate(update)
			}
		}
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
				case streamPk, ok := <-response.Stream:
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
								
								// Get execution mode from client AI options
								executionMode := "manual" // default to manual
								if clientData.AIOpts != nil && clientData.AIOpts.ThreadExecutionMode != "" {
									executionMode = clientData.AIOpts.ThreadExecutionMode
								}
								log.Printf("Thread execution mode: %s\n", executionMode)
								
								if executionMode == "manual" {
									// Don't execute immediately - mark as waiting
									err = sstore.UpdateThreadLineCmdExecutionStatus(bgCtx, threadId, ids.ScreenId, line.LineId, "waiting")
									if err != nil {
										log.Printf("thread error updating cmd execution status: %v\n", err)
									}
									
									// Send line update to frontend with cmd_execution_status
									updatedLine, err := sstore.GetLineById(bgCtx, ids.ScreenId, line.LineId)
									if err == nil && updatedLine != nil {
										// Add cmd_execution_status to line state for frontend
										if updatedLine.LineState == nil {
											updatedLine.LineState = make(map[string]interface{})
										}
										updatedLine.LineState["cmdexecutionstatus"] = "waiting"
										
										update := scbus.MakeUpdatePacket()
										sstore.AddLineUpdate(update, updatedLine, nil)
										scbus.MainUpdateBus.DoUpdate(update)
										log.Printf("thread sent line update with waiting status\n")
									}
								} else if executionMode == "full-auto" {
									// Execute command immediately (current behavior)
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
										
										// Send line update to frontend so it knows about the cmdexeclineid
										updatedLine, err := sstore.GetLineById(bgCtx, ids.ScreenId, line.LineId)
										if err == nil && updatedLine != nil {
											// Get thread line data to include cmdlineid in linestate
											threadLineData, _ := sstore.GetThreadLineByLineId(bgCtx, line.LineId)
											if threadLineData != nil && threadLineData.CmdLineId != "" {
												if updatedLine.LineState == nil {
													updatedLine.LineState = make(map[string]interface{})
												}
												updatedLine.LineState["cmdexeclineid"] = threadLineData.CmdLineId
											}
											
											update := scbus.MakeUpdatePacket()
											sstore.AddLineUpdate(update, updatedLine, nil)
											scbus.MainUpdateBus.DoUpdate(update)
											log.Printf("thread sent line update with cmdexeclineid: %s\n", cmdExecLineId)
										}
										
										// Start multi-turn execution loop
										go startMultiTurnExecution(bgCtx, originalPk, clientData, &originalIds, threadId, cmdExecLineId, threadResp.Command)
									}
								}
							}
						}

						// Thread mode stays active after response (similar to agent mode)
						// Users can manually toggle it off with /thread or switch modes
						return
					}

					// Extract and accumulate text content
					if streamPk.Error != "" {
						writeErrorToPty(cmd, streamPk.Error, outputPos)
						return
					}
					if streamPk.Text != "" {
						fullResponse.WriteString(streamPk.Text)
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

	// Make sure line state includes thread ID
	// This is important for the update packet sent to frontend
	if line.LineState == nil {
		line.LineState = make(map[string]interface{})
	}
	// Store as a list since a line can belong to multiple threads
	line.LineState["threadids"] = []string{threadId}
	
	log.Printf("[ThreadCommand] Sending line update with threadids: %v for line %s, activeThreadId should be: %s", line.LineState["threadids"], line.LineId, threadId)
	
	update := scbus.MakeUpdatePacket()
	sstore.AddLineUpdate(update, line, cmd)
	update.AddUpdate(*screen)
	
	// Also send the current thread ID so frontend can update activeThreadId if needed
	update.AddUpdate(sstore.ActiveThreadIdUpdateType{
		ScreenId: ids.ScreenId,
		ThreadId: threadId,
	})
	
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
		
		// Add thread ID to line state
		// AddThreadLine will also update this in the database, but we need it here for the immediate update
		if newLine.LineState == nil {
			newLine.LineState = make(map[string]interface{})
		}
		// Store as a list since a line can belong to multiple threads
		newLine.LineState["threadids"] = []string{threadId}
		
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
			case streamPk, ok := <-response.Stream:
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
							
							// Get execution mode from client AI options
							executionMode := "manual" // default to manual
							if clientData.AIOpts != nil && clientData.AIOpts.ThreadExecutionMode != "" {
								executionMode = clientData.AIOpts.ThreadExecutionMode
							}
							
							// For multi-turn, we only continue if in full-auto mode
							if executionMode == "full-auto" {
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
								
								// Send line update with cmdexeclineid
								updatedLine, err := sstore.GetLineById(ctx, ids.ScreenId, newLineId)
								if err == nil && updatedLine != nil {
									// Get thread line data to include cmdlineid in linestate
									threadLineData, _ := sstore.GetThreadLineByLineId(ctx, newLineId)
									if threadLineData != nil && threadLineData.CmdLineId != "" {
										if updatedLine.LineState == nil {
											updatedLine.LineState = make(map[string]interface{})
										}
										updatedLine.LineState["cmdexeclineid"] = threadLineData.CmdLineId
									}
									
									update := scbus.MakeUpdatePacket()
									sstore.AddLineUpdate(update, updatedLine, nil)
									scbus.MainUpdateBus.DoUpdate(update)
									log.Printf("Sent line update with cmdexeclineid: %s\n", cmdExecLineId)
								}
								
								// Update for next iteration
								prevCmdLineId = cmdExecLineId
								prevCommand = nextCommand
							} else {
								// Manual mode - mark as waiting and stop
								err = sstore.UpdateThreadLineCmdExecutionStatus(ctx, threadId, ids.ScreenId, newLineId, "waiting")
								if err != nil {
									log.Printf("Error updating cmd execution status: %v\n", err)
								}
								
								// Send line update to frontend with cmd_execution_status
								updatedLine, err := sstore.GetLineById(ctx, ids.ScreenId, newLineId)
								if err == nil && updatedLine != nil {
									// Add cmd_execution_status to line state for frontend
									if updatedLine.LineState == nil {
										updatedLine.LineState = make(map[string]interface{})
									}
									updatedLine.LineState["cmdexecutionstatus"] = "waiting"
									
									update := scbus.MakeUpdatePacket()
									sstore.AddLineUpdate(update, updatedLine, nil)
									scbus.MainUpdateBus.DoUpdate(update)
									log.Printf("Multi-turn: sent line update with waiting status\n")
								}
								// Stop multi-turn execution in manual mode
								nextCommand = ""
							}
						}
					}
					break streamLoop
				}
				
				// Extract and accumulate text content
				if streamPk.Error != "" {
					log.Printf("[startMultiTurnExecution] Received error packet: %s", streamPk.Error)
					writeErrorToPty(newCmd, streamPk.Error, outputPos)
					break streamLoop
				}
				if streamPk.Text != "" {
					fullResponse.WriteString(streamPk.Text)
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
