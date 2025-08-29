package cmdrunner

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/abhishek944/waveterm/waveshell/pkg/base"
	"github.com/abhishek944/waveterm/waveshell/pkg/packet"
	"github.com/abhishek944/waveterm/wavesrv/pkg/bookmarks"
	"github.com/abhishek944/waveterm/wavesrv/pkg/dbutil"
	"github.com/abhishek944/waveterm/wavesrv/pkg/remote"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbase"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
	"github.com/google/uuid"
)

func LineCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	return nil, fmt.Errorf("/line requires a subcommand: %s", formatStrs([]string{"show", "star", "hide", "delete", "setheight", "set"}, "or", false))
}

func LineSetHeightCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}
	if len(pk.Args) != 2 {
		return nil, fmt.Errorf("/line:setheight requires 2 arguments (linearg and height)")
	}
	lineArg := pk.Args[0]
	lineId, err := sstore.FindLineIdByArg(ctx, ids.ScreenId, lineArg)
	if err != nil {
		return nil, fmt.Errorf("error looking up lineid: %v", err)
	}
	heightVal, err := resolveNonNegInt(pk.Args[1], 0)
	if err != nil {
		return nil, fmt.Errorf("/line:setheight invalid height val: %v", err)
	}
	if heightVal > 10000 {
		return nil, fmt.Errorf("/line:setheight invalid height val (too large): %d", heightVal)
	}
	err = sstore.UpdateLineHeight(ctx, ids.ScreenId, lineId, heightVal)
	if err != nil {
		return nil, fmt.Errorf("/line:setheight error updating height: %v", err)
	}
	// we don't need to pass the updated line height (it is "write only")
	return nil, nil
}

func LineRestartCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_RemoteConnected)
	if err != nil {
		return nil, err
	}
	var lineId string
	if len(pk.Args) >= 1 {
		lineArg := pk.Args[0]
		resolvedLineId, err := sstore.FindLineIdByArg(ctx, ids.ScreenId, lineArg)
		if err != nil {
			return nil, fmt.Errorf("error looking up lineid: %v", err)
		}
		lineId = resolvedLineId
	} else {
		selectedLineId, err := sstore.GetScreenSelectedLineId(ctx, ids.ScreenId)
		if err != nil {
			return nil, fmt.Errorf("error getting selected lineid: %v", err)
		}
		lineId = selectedLineId
	}
	if lineId == "" {
		return nil, fmt.Errorf("%s requires a lineid to operate on", GetCmdStr(pk))
	}
	line, cmd, err := sstore.GetLineCmdByLineId(ctx, ids.ScreenId, lineId)
	if err != nil {
		return nil, fmt.Errorf("error getting line: %v", err)
	}
	if line == nil {
		return nil, fmt.Errorf("line not found")
	}

	log.Printf("[DEBUG] LineRestartCommand: Attempting to restart lineId=%s, lineType=%s\n", lineId, line.LineType)

	// Check if this is a thread mode or agent mode line that shouldn't be restarted
	if line.LineType == sstore.LineTypeThreadMode || line.LineType == sstore.LineTypeAgentMode {
		log.Printf("[DEBUG] LineRestartCommand: Silently skipping restart for %s line lineId=%s\n", line.LineType, lineId)
		// Return empty update packet - no error, just skip the operation
		return scbus.MakeUpdatePacket(), nil
	}

	if cmd == nil {
		log.Printf("[DEBUG] LineRestartCommand: No cmd found for lineId=%s, lineType=%s\n", lineId, line.LineType)
		return nil, fmt.Errorf("cannot restart line (no cmd found)")
	}
	if cmd.Status == sstore.CmdStatusRunning || cmd.Status == sstore.CmdStatusDetached {
		killCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		err = ids.Remote.Waveshell.KillRunningCommandAndWait(killCtx, base.MakeCommandKey(ids.ScreenId, lineId))
		if err != nil {
			return nil, err
		}
	}
	ids.Remote.Waveshell.ResetDataPos(base.MakeCommandKey(ids.ScreenId, lineId))
	err = sstore.ClearCmdPtyFile(ctx, ids.ScreenId, lineId)
	if err != nil {
		return nil, fmt.Errorf("error clearing existing pty file: %v", err)
	}
	runPacket := packet.MakeRunPacket()
	runPacket.ReqId = uuid.New().String()
	runPacket.CK = base.MakeCommandKey(ids.ScreenId, lineId)
	runPacket.UsePty = true
	// TODO how can we preseve the original termopts?
	runPacket.TermOpts, err = GetUITermOpts(pk.UIContext.WinSize, DefaultPTERM)
	if err != nil {
		return nil, fmt.Errorf("error getting creating termopts for command: %w", err)
	}
	runPacket.Command = cmd.CmdStr
	runPacket.ReturnState = false
	log.Printf("[DEBUG] LineRestartCommand: Restarting command with StatePtr=%+v for lineId=%s\n", cmd.StatePtr, lineId)
	rcOpts := remote.RunCommandOpts{
		SessionId:          ids.SessionId,
		ScreenId:           ids.ScreenId,
		RemotePtr:          ids.Remote.RemotePtr,
		NoCreateCmdPtyFile: true,
	}
	// Only use the stored StatePtr if it has a valid BaseHash
	if cmd.StatePtr.BaseHash != "" {
		rcOpts.StatePtr = &cmd.StatePtr
	} else {
		log.Printf("[DEBUG] LineRestartCommand: Stored StatePtr has empty BaseHash, will get fresh state from remote\n")
	}
	cmd, callback, err := remote.RunCommand(ctx, rcOpts, runPacket)
	if callback != nil {
		defer callback()
	}
	if err != nil {
		return nil, err
	}
	sstore.IncrementNumRunningCmds(cmd.ScreenId, 1)
	newTs := time.Now().UnixMilli()
	err = sstore.UpdateCmdForRestart(ctx, runPacket.CK, newTs, cmd.CmdPid, cmd.RemotePid, convertTermOpts(runPacket.TermOpts))
	if err != nil {
		return nil, fmt.Errorf("error updating cmd for restart: %w", err)
	}
	line, cmd, err = sstore.GetLineCmdByLineId(ctx, ids.ScreenId, lineId)
	if err != nil {
		return nil, fmt.Errorf("error getting updated line/cmd: %w", err)
	}
	cmd.Restarted = true
	update := scbus.MakeUpdatePacket()
	sstore.AddLineUpdate(update, line, cmd)
	update.AddUpdate(sstore.InteractiveUpdate(pk.Interactive))
	screen, focusErr := focusScreenLine(ctx, ids.ScreenId, line.LineNum)
	if focusErr != nil {
		// not a fatal error, so just log
		log.Printf("error focusing screen line: %v\n", focusErr)
	}
	if screen != nil {
		update.AddUpdate(*screen)
	}
	return update, nil
}

func LineShowCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("/line:show requires an argument (line number or id)")
	}
	lineArg := pk.Args[0]
	lineId, err := sstore.FindLineIdByArg(ctx, ids.ScreenId, lineArg)
	if err != nil {
		return nil, fmt.Errorf("error looking up lineid: %v", err)
	}
	if lineId == "" {
		return nil, fmt.Errorf("line %q not found", lineArg)
	}
	line, cmd, err := sstore.GetLineCmdByLineId(ctx, ids.ScreenId, lineId)
	if err != nil {
		return nil, fmt.Errorf("error getting line: %v", err)
	}
	if line == nil {
		return nil, fmt.Errorf("line %q not found", lineArg)
	}
	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "screenid", line.ScreenId))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "lineid", line.LineId))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "type", line.LineType))
	lineNumStr := strconv.FormatInt(line.LineNum, 10)
	if line.LineNumTemp {
		lineNumStr = "~" + lineNumStr
	}
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "linenum", lineNumStr))
	ts := time.UnixMilli(line.Ts)
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "ts", ts.Format(TsFormatStr)))
	if line.Ephemeral {
		buf.WriteString(fmt.Sprintf("  %-15s %v\n", "ephemeral", true))
	}
	if line.Renderer != "" {
		buf.WriteString(fmt.Sprintf("  %-15s %s\n", "renderer", line.Renderer))
	} else {
		buf.WriteString(fmt.Sprintf("  %-15s %s\n", "renderer", "terminal"))
	}
	if cmd != nil {
		buf.WriteString(fmt.Sprintf("  %-15s %s\n", "remote", cmd.Remote.MakeFullRemoteRef()))
		buf.WriteString(fmt.Sprintf("  %-15s %s\n", "status", cmd.Status))
		if cmd.FeState["cwd"] != "" {
			buf.WriteString(fmt.Sprintf("  %-15s %s\n", "cwd", cmd.FeState["cwd"]))
		}
		buf.WriteString(fmt.Sprintf("  %-15s %s\n", "termopts", formatTermOpts(cmd.TermOpts)))
		if cmd.TermOpts != cmd.OrigTermOpts {
			buf.WriteString(fmt.Sprintf("  %-15s %s\n", "orig-termopts", formatTermOpts(cmd.OrigTermOpts)))
		}
		if cmd.RtnState {
			buf.WriteString(fmt.Sprintf("  %-15s %s\n", "rtnstate", "true"))
		}
		stat, _ := sstore.StatCmdPtyFile(ctx, cmd.ScreenId, cmd.LineId)
		if stat == nil {
			buf.WriteString(fmt.Sprintf("  %-15s %s\n", "file", "-"))
		} else {
			fileDataStr := fmt.Sprintf("v%d data=%d offset=%d max=%s", stat.Version, stat.DataSize, stat.FileOffset, scbase.NumFormatB2(stat.MaxSize))
			buf.WriteString(fmt.Sprintf("  %-15s %s\n", "file", stat.Location))
			buf.WriteString(fmt.Sprintf("  %-15s %s\n", "file-data", fileDataStr))
		}
		if cmd.RestartTs > 0 {
			restartTs := time.UnixMilli(cmd.RestartTs)
			buf.WriteString(fmt.Sprintf("  %-15s %s\n", "restartts", restartTs.Format(TsFormatStr)))
		}
		if cmd.DoneTs != 0 {
			doneTs := time.UnixMilli(cmd.DoneTs)
			buf.WriteString(fmt.Sprintf("  %-15s %s\n", "donets", doneTs.Format(TsFormatStr)))
			buf.WriteString(fmt.Sprintf("  %-15s %d\n", "exitcode", cmd.ExitCode))
			buf.WriteString(fmt.Sprintf("  %-15s %dms\n", "duration", cmd.DurationMs))
		}
	}
	stateStr := dbutil.QuickJson(line.LineState)
	if len(stateStr) > 80 {
		stateStr = stateStr[0:77] + "..."
	}
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "state", stateStr))
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.InfoMsgType{
		InfoTitle: fmt.Sprintf("line %d info", line.LineNum),
		InfoLines: splitLinesForInfo(buf.String()),
	})
	return update, nil
}

func LineBookmarkCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("/line:bookmark requires an argument (line number or id)")
	}
	lineArg := pk.Args[0]
	lineId, err := sstore.FindLineIdByArg(ctx, ids.ScreenId, lineArg)
	if err != nil {
		return nil, fmt.Errorf("error looking up lineid: %v", err)
	}
	if lineId == "" {
		return nil, fmt.Errorf("line %q not found", lineArg)
	}
	_, cmdObj, err := sstore.GetLineCmdByLineId(ctx, ids.ScreenId, lineId)
	if err != nil {
		return nil, fmt.Errorf("/line:bookmark error getting line: %v", err)
	}
	if cmdObj == nil {
		return nil, fmt.Errorf("cannot bookmark non-cmd line")
	}
	existingBmIds, err := bookmarks.GetBookmarkIdsByCmdStr(ctx, cmdObj.CmdStr)
	if err != nil {
		return nil, fmt.Errorf("error trying to retrieve current boookmarks: %v", err)
	}
	var newBmId string
	if len(existingBmIds) > 0 {
		newBmId = existingBmIds[0]
	} else {
		newBm := &bookmarks.BookmarkType{
			BookmarkId:  uuid.New().String(),
			CreatedTs:   time.Now().UnixMilli(),
			CmdStr:      cmdObj.CmdStr,
			Alias:       "",
			Tags:        nil,
			Description: "",
		}
		err = bookmarks.InsertBookmark(ctx, newBm)
		if err != nil {
			return nil, fmt.Errorf("cannot insert bookmark: %v", err)
		}
		newBmId = newBm.BookmarkId
	}
	bms, err := bookmarks.GetBookmarks(ctx, "")
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(&MainViewUpdate{
		MainView:      sstore.MainViewBookmarks,
		BookmarksView: &bookmarks.BookmarksUpdate{Bookmarks: bms, SelectedBookmark: newBmId},
	})
	return update, nil
}

func LinePinCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	return nil, nil
}

func LineStarCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("/line:star requires an argument (line number or id)")
	}
	if len(pk.Args) > 2 {
		return nil, fmt.Errorf("/line:star only takes up to 2 arguments (line-number and star-value)")
	}
	lineArg := pk.Args[0]
	lineId, err := sstore.FindLineIdByArg(ctx, ids.ScreenId, lineArg)
	if err != nil {
		return nil, fmt.Errorf("error looking up lineid: %v", err)
	}
	if lineId == "" {
		return nil, fmt.Errorf("line %q not found", lineArg)
	}
	starVal, err := resolveNonNegInt(pk.Args[1], 1)
	if err != nil {
		return nil, fmt.Errorf("/line:star invalid star-value (not integer): %v", err)
	}
	if starVal > 5 {
		return nil, fmt.Errorf("/line:star invalid star-value must be in the range of 0-5")
	}
	err = sstore.UpdateLineStar(ctx, ids.ScreenId, lineId, starVal)
	if err != nil {
		return nil, fmt.Errorf("/line:star error updating star value: %v", err)
	}
	lineObj, err := sstore.GetLineById(ctx, ids.ScreenId, lineId)
	if err != nil {
		return nil, fmt.Errorf("/line:star error getting line: %v", err)
	}
	if lineObj == nil {
		// no line (which is strange given we checked for it above).  just return a nop.
		return nil, nil
	}
	update := scbus.MakeUpdatePacket()
	sstore.AddLineUpdate(update, lineObj, nil)
	return update, nil
}

func LineArchiveCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("/line:archive requires an argument (line number or id)")
	}
	lineArg := pk.Args[0]
	lineId, err := sstore.FindLineIdByArg(ctx, ids.ScreenId, lineArg)
	if err != nil {
		return nil, fmt.Errorf("error looking up lineid: %v", err)
	}
	if lineId == "" {
		return nil, fmt.Errorf("line %q not found", lineArg)
	}
	shouldArchive := true
	if len(pk.Args) >= 2 {
		shouldArchive = resolveBool(pk.Args[1], true)
	}
	err = sstore.SetLineArchivedById(ctx, ids.ScreenId, lineId, shouldArchive)
	if err != nil {
		return nil, fmt.Errorf("/line:archive error updating hidden status: %v", err)
	}
	lineObj, err := sstore.GetLineById(ctx, ids.ScreenId, lineId)
	if err != nil {
		return nil, fmt.Errorf("/line:archive error getting line: %v", err)
	}
	if lineObj == nil {
		// no line (which is strange given we checked for it above).  just return a nop.
		return nil, nil
	}
	update := scbus.MakeUpdatePacket()
	sstore.AddLineUpdate(update, lineObj, nil)
	return update, nil
}

func LineMinimizeCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("/line:minimize requires arguments (line number or id and min value)")
	}
	if len(pk.Args) > 2 {
		return nil, fmt.Errorf("/line:minimize only takes up to 2 argument (line number or id and min value)")
	}
	lineArg1 := pk.Args[0]
	lineId, err := sstore.FindLineIdByArg(ctx, ids.ScreenId, lineArg1)
	if err != nil {
		return nil, fmt.Errorf("error looking up lineid: %v", err)
	}
	if lineId == "" {
		return nil, fmt.Errorf("line %q not found", lineArg1)
	}
	lineArg2 := pk.Args[1]
	minVal := resolveBool(lineArg2, true)
	lineState := make(map[string]any)
	if minVal {
		lineState[sstore.LineState_Min] = minVal
	} else {
		// Remove sstore.LineState_Min from lineState if it exists
		delete(lineState, sstore.LineState_Min)
	}
	err = sstore.UpdateLineState(ctx, ids.ScreenId, lineId, lineState)
	if err != nil {
		return nil, fmt.Errorf("cannot update linestate: %v", err)
	}
	// Do not return an update; frontend will optimistically update UI
	return nil, nil
}

func LineDeleteCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("/line:delete requires at least one argument (line number or id)")
	}
	var lineIds []string
	for _, lineArg := range pk.Args {
		lineId, err := sstore.FindLineIdByArg(ctx, ids.ScreenId, lineArg)
		if err != nil {
			return nil, fmt.Errorf("error looking up lineid: %v", err)
		}
		if lineId == "" {
			return nil, fmt.Errorf("line %q not found", lineArg)
		}
		lineIds = append(lineIds, lineId)
	}
	err = sstore.DeleteLinesByIds(ctx, ids.ScreenId, lineIds)
	if err != nil {
		return nil, fmt.Errorf("/line:delete error deleting lines: %v", err)
	}
	update := scbus.MakeUpdatePacket()
	for _, lineId := range lineIds {
		line := &sstore.LineType{ScreenId: ids.ScreenId, LineId: lineId, Remove: true}
		sstore.AddLineUpdate(update, line, nil)
	}
	screen, err := sstore.FixupScreenSelectedLine(ctx, ids.ScreenId)
	if err != nil {
		return nil, fmt.Errorf("/line:delete error fixing up screen: %v", err)
	}
	if screen != nil {
		update.AddUpdate(*screen)
	}
	return update, nil
}

func LineSetCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}
	if len(pk.Args) != 1 {
		return nil, fmt.Errorf("/line:set requires 1 argument (linearg)")
	}
	lineArg := pk.Args[0]
	lineId, err := sstore.FindLineIdByArg(ctx, ids.ScreenId, lineArg)
	if err != nil {
		return nil, fmt.Errorf("error looking up lineid: %v", err)
	}
	var varsUpdated []string
	if renderer, found := pk.Kwargs[KwArgRenderer]; found {
		if err = validateRenderer(renderer); err != nil {
			return nil, fmt.Errorf("invalid renderer value: %w", err)
		}
		err = sstore.UpdateLineRenderer(ctx, ids.ScreenId, lineId, renderer)
		if err != nil {
			return nil, fmt.Errorf("error changing line renderer: %v", err)
		}
		// sendRendererActivityUpdate(renderer)
		varsUpdated = append(varsUpdated, KwArgRenderer)
	}
	if view, found := pk.Kwargs[KwArgView]; found {
		if err = validateRenderer(view); err != nil {
			return nil, fmt.Errorf("invalid view value: %w", err)
		}
		err = sstore.UpdateLineRenderer(ctx, ids.ScreenId, lineId, view)
		if err != nil {
			return nil, fmt.Errorf("error changing line view: %v", err)
		}
		// sendRendererActivityUpdate(view)
		varsUpdated = append(varsUpdated, KwArgView)
	}
	if stateJson, found := pk.Kwargs[KwArgState]; found {
		if len(stateJson) > sstore.MaxLineStateSize {
			return nil, fmt.Errorf("invalid state value (too large), size[%d], max[%d]", len(stateJson), sstore.MaxLineStateSize)
		}
		var stateMap map[string]any
		err = json.Unmarshal([]byte(stateJson), &stateMap)
		if err != nil {
			return nil, fmt.Errorf("invalid state value, cannot parse json: %v", err)
		}
		err = sstore.UpdateLineState(ctx, ids.ScreenId, lineId, stateMap)
		if err != nil {
			return nil, fmt.Errorf("cannot update linestate: %v", err)
		}
		varsUpdated = append(varsUpdated, KwArgState)
	}
	if len(varsUpdated) == 0 {
		return nil, fmt.Errorf("/line:set requires a value to set: %s", formatStrs([]string{KwArgView, KwArgState}, "or", false))
	}
	updatedLine, err := sstore.GetLineById(ctx, ids.ScreenId, lineId)
	if err != nil {
		return nil, fmt.Errorf("/line:set cannot retrieve updated line: %v", err)
	}
	update := scbus.MakeUpdatePacket()
	sstore.AddLineUpdate(update, updatedLine, nil)
	// Only show info message for renderer/view updates, not state updates
	showInfoMsg := false
	for _, varName := range varsUpdated {
		if varName != KwArgState {
			showInfoMsg = true
			break
		}
	}
	if showInfoMsg {
		update.AddUpdate(sstore.InfoMsgType{
			InfoMsg:   fmt.Sprintf("line updated %s", formatStrs(varsUpdated, "and", false)),
			TimeoutMs: 2000,
		})
	}
	return update, nil
}

func LineViewCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	if len(pk.Args) != 3 {
		return nil, fmt.Errorf("usage /line:view [session] [screen] [line]")
	}
	sessionArg := pk.Args[0]
	screenArg := pk.Args[1]
	lineArg := pk.Args[2]
	sessionId, err := resolveSessionArg(sessionArg)
	if err != nil {
		return nil, fmt.Errorf("/line:view invalid session arg: %v", err)
	}
	if sessionId == "" {
		return nil, fmt.Errorf("/line:view no session found")
	}
	screenRItem, err := resolveSessionScreen(ctx, sessionId, screenArg, "")
	if err != nil {
		return nil, fmt.Errorf("/line:view invalid screen arg: %v", err)
	}
	if screenRItem == nil {
		return nil, fmt.Errorf("/line:view no screen found")
	}
	screen, err := sstore.GetScreenById(ctx, screenRItem.Id)
	if err != nil {
		return nil, fmt.Errorf("/line:view could not get screen: %v", err)
	}
	lineRItem, err := resolveLine(ctx, sessionId, screen.ScreenId, lineArg, "")
	if err != nil {
		return nil, fmt.Errorf("/line:view invalid line arg: %v", err)
	}
	update, err := sstore.SwitchScreenById(ctx, sessionId, screenRItem.Id)
	if err != nil {
		return nil, err
	}
	if lineRItem != nil {
		updateMap := make(map[string]interface{})
		updateMap[sstore.ScreenField_SelectedLine] = lineRItem.Num
		updateMap[sstore.ScreenField_AnchorLine] = lineRItem.Num
		updateMap[sstore.ScreenField_AnchorOffset] = 0
		screen, err = sstore.UpdateScreen(ctx, screenRItem.Id, updateMap)
		if err != nil {
			return nil, err
		}
		update.AddUpdate(*screen)
	}
	return update, nil
}
