// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmdrunner

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/abhishek944/waveterm/wavesrv/pkg/scbase"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

func AgentCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, fmt.Errorf("/%s error: %w", GetCmdStr(pk), err)
	}
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
	}
	
	// Get the prompt from args
	promptStr := strings.Join(pk.Args, " ")
	if promptStr == "" {
		return nil, fmt.Errorf("agent error, prompt string is blank")
	}
	
	// Get provider from UI (defaults to empty string to use configured default)
	provider := pk.Kwargs["provider"]
	
	// Get terminal options
	ptermVal := defaultStr(pk.Kwargs["wterm"], DefaultPTERM)
	pkTermOpts, err := GetUITermOpts(pk.UIContext.WinSize, ptermVal)
	if err != nil {
		return nil, fmt.Errorf("agent error, invalid 'pterm' value %q: %v", ptermVal, err)
	}
	termOpts := convertTermOpts(pkTermOpts)
	
	// Create command for agent mode (not a running command)
	cmd := &sstore.CmdType{
		ScreenId:  ids.ScreenId,
		LineId:    scbase.GenWaveUUID(),
		CmdStr:    pk.GetRawStr(),
		RawCmdStr: pk.GetRawStr(),
		Remote:    ids.Remote.RemotePtr,
		TermOpts:  *termOpts,
		Status:    sstore.CmdStatusDone, // Set as done, not running
		RunOut:    nil,
	}
	if ids.Remote != nil && ids.Remote.StatePtr != nil {
		cmd.StatePtr = *ids.Remote.StatePtr
	}
	if ids.Remote != nil && ids.Remote.FeState != nil {
		cmd.FeState = ids.Remote.FeState
	}
	err = sstore.CreateCmdPtyFile(ctx, cmd.ScreenId, cmd.LineId, cmd.TermOpts.MaxPtySize)
	if err != nil {
		return nil, fmt.Errorf("cannot create ptyout file for agent command: %w", err)
	}
	
	// Add agent mode line
	line, err := sstore.AddAgentModeLine(ctx, ids.ScreenId, DefaultUserId, cmd)
	if err != nil {
		return nil, fmt.Errorf("cannot add new line: %v", err)
	}
	
	// sendRendererActivityUpdate("agent_mode")
	
	// Run agent mode
	go func() {
		// Create a new context that won't be canceled when the parent function returns
		bgCtx := context.Background()
		response, err := RunAgentMode(bgCtx, pk, clientData, promptStr, provider)
		if err != nil {
			writeErrorToPty(cmd, fmt.Sprintf("agent error: %v", err), 0)
			return
		}
		
		// Handle streaming response
		if response.Stream != nil {
			var outputPos int64
			packetTimeout := OpenAIPacketTimeout
			
			for {
				select {
				case <-time.After(packetTimeout):
					writeErrorToPty(cmd, "timeout waiting for response", outputPos)
					return
				case pk, ok := <-response.Stream:
					if !ok {
						// Channel closed, we're done
						// Add a newline at the end for proper formatting
						err = writeTextToPty(bgCtx, cmd, "\n", &outputPos)
						if err != nil {
							log.Printf("error writing newline to ptybuffer: %v", err)
						}
						// Send update to toggle off agent mode
						update := scbus.MakeUpdatePacket()
						update.AddUpdate(sstore.AgentModeToggleType{Enabled: false})
						scbus.MainUpdateBus.DoUpdate(update)
						return
					}
					
					// Extract and write only the text content to PTY
					if pk.Error != "" {
						writeErrorToPty(cmd, pk.Error, outputPos)
						return
					}
					if pk.Text != "" {
						// For agent mode, format the text to handle markdown better
						formattedText := formatMarkdownForTerminal(pk.Text)
						err = writeTextToPty(bgCtx, cmd, formattedText, &outputPos)
						if err != nil {
							log.Printf("error writing response to ptybuffer: %v", err)
							return
						}
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
		log.Printf("agent error updating screen selected line: %v\n", err)
	}
	
	update := scbus.MakeUpdatePacket()
	sstore.AddLineUpdate(update, line, cmd)
	update.AddUpdate(*screen)
	return update, nil
}