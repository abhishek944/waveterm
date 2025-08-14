// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmdrunner

import (
	"context"
	"fmt"
	"log"
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
