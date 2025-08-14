// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmdrunner

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/abhishek944/waveterm/waveshell/pkg/base"
	"github.com/abhishek944/waveterm/waveshell/pkg/packet"
	"github.com/abhishek944/waveterm/waveshell/pkg/shellutil"
	"github.com/abhishek944/waveterm/wavesrv/pkg/remote"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbase"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

// ExecuteCommandInThread executes a command within the thread context
// The command is associated with the existing thread line via the lineid
// Returns the command execution lineId
func ExecuteCommandInThread(
	ctx context.Context,
	sessionId string,
	threadId string, 
	screenId string, 
	lineId string, 
	commandStr string, 
	remotePtr *sstore.RemotePtrType) (string, error) {

	termOpts := sstore.TermOpts{
		Rows:       shellutil.DefaultTermRows,
		Cols:       shellutil.DefaultTermCols,
		FlexRows:   true,
		MaxPtySize: remote.DefaultMaxPtySize,
	}
	
	// Create a new UUID for command execution
	cmdExecLineId := scbase.GenWaveUUID()
	
	// Create command record with the new UUID
	cmd := &sstore.CmdType{
		ScreenId:     screenId,
		LineId:       cmdExecLineId, // Use a new UUID for command execution
		CmdStr:       commandStr,
		RawCmdStr:    commandStr,
		Remote:       *remotePtr,
		TermOpts:     termOpts,
		Status:       sstore.CmdStatusRunning,
		RunOut:       nil,
	}
	
	// Store the mapping between thread lineId and command execution lineId for frontend use
	// This will be used to find the command execution PTY when displaying in sidebar
	// For now, we'll store it in the thread line's metadata
	
	// Create a line record for the command execution (needed for sidebar to find it)
	// This line uses a special line type so it's not shown in main terminal view
	cmdLine := &sstore.LineType{
		ScreenId:  screenId,
		UserId:    DefaultUserId,
		LineId:    cmdExecLineId,
		Ts:        time.Now().UnixMilli(),
		LineNum:   0,  // Not displayed in main view
		LineLocal: true,
		LineType:  sstore.LineTypeThreadModeCmd,  // Special type for thread command execution
		Renderer:  "",  // Regular terminal renderer
		LineState: map[string]any{
			"threadlineid": lineId,  // Reference back to the thread line
			"iscmdexec": true,       // Mark as command execution line
		},
	}

	// Insert the line record first (this handles its own transaction)
	err := sstore.InsertLine(ctx, cmdLine, cmd)
	if err != nil {
		return "", fmt.Errorf("cannot insert command execution line: %w", err)
	}
	
	// Send line update to frontend so it knows about the new command execution line
	cmdExecLine, err := sstore.GetLineById(ctx, screenId, cmdExecLineId)
	if err == nil && cmdExecLine != nil {
		update := scbus.MakeUpdatePacket()
		sstore.AddLineUpdate(update, cmdExecLine, cmd)
		scbus.MainUpdateBus.DoUpdate(update)
		log.Printf("[ExecuteCommandInThread] Sent line update for command execution line: %s\n", cmdExecLineId)
	}

	// Create run packet
	runPacket := packet.MakeRunPacket()
	runPacket.ReqId = scbase.GenWaveUUID()
	runPacket.CK = base.MakeCommandKey(screenId, cmdExecLineId)  // Use cmdExecLineId for PTY output
	runPacket.UsePty = true
	runPacket.TermOpts = &packet.TermOpts{
		Rows: int(termOpts.Rows),
		Cols: int(termOpts.Cols),
	}
	runPacket.Command = commandStr
	runPacket.ReturnState = false

	// No need to write header - the command output will go directly to the PTY

	// Run command using remote.RunCommand
	rcOpts := remote.RunCommandOpts{
		SessionId: sessionId,
		ScreenId:  screenId,
		RemotePtr: *remotePtr,
	}
	
	// Execute command asynchronously
	go func() {
		// Create a background context for command execution
		bgCtx := context.Background()
		
		// Run the command using remote.RunCommand
		cmdResult, callback, err := remote.RunCommand(bgCtx, rcOpts, runPacket)
		if err != nil {
			log.Printf("[ExecuteCommandInThread] Error running command: %v", err)
			// The error will be handled by remote.RunCommand and written to PTY
			return
		}
		if callback != nil {
			defer callback()
		}

		// Wait for command to complete (command output goes directly to cmdExec PTY)
		// The remote.RunCommand will handle writing to the PTY file
		log.Printf("[ExecuteCommandInThread] Command execution started for lineId: %s", cmdExecLineId)
		
		if cmdResult != nil {
			log.Printf("[ExecuteCommandInThread] Command completed with status: %s", cmdResult.Status)
		}
	}()

	return cmdExecLineId, nil
}