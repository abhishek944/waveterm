package cmdrunner

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"strconv"

	"github.com/abhishek944/waveterm/waveshell/pkg/base"
	"github.com/abhishek944/waveterm/waveshell/pkg/shexec"
	"github.com/abhishek944/waveterm/wavesrv/pkg/remote"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

func ScreenSetCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}
	var varsUpdated []string
	var setNonAnchor bool // anchor does not receive an update
	updateMap := make(map[string]interface{})
	if pk.Kwargs["name"] != "" {
		newName := pk.Kwargs["name"]
		err = validateName(newName, "screen")
		if err != nil {
			return nil, err
		}
		updateMap[sstore.ScreenField_Name] = newName
		varsUpdated = append(varsUpdated, "name")
		setNonAnchor = true
	}
	if pk.Kwargs["sharename"] != "" {
		shareName := pk.Kwargs["sharename"]
		err = validateShareName(shareName)
		if err != nil {
			return nil, err
		}
		updateMap[sstore.ScreenField_ShareName] = shareName
		varsUpdated = append(varsUpdated, "sharename")
		setNonAnchor = true
	}
	if pk.Kwargs["tabcolor"] != "" {
		color := pk.Kwargs["tabcolor"]
		err = validateColor(color, "screen tabcolor")
		if err != nil {
			return nil, err
		}
		updateMap[sstore.ScreenField_TabColor] = color
		varsUpdated = append(varsUpdated, "tabcolor")
		setNonAnchor = true
	}
	if pk.Kwargs["tabicon"] != "" {
		icon := pk.Kwargs["tabicon"]
		updateMap[sstore.ScreenField_TabIcon] = icon
		varsUpdated = append(varsUpdated, "tabicon")
		setNonAnchor = true
	}
	if pk.Kwargs["pos"] != "" {
		varsUpdated = append(varsUpdated, "pos")
		setNonAnchor = true
	}
	if pk.Kwargs["focus"] != "" {
		focusVal := pk.Kwargs["focus"]
		if focusVal != sstore.ScreenFocusInput && focusVal != sstore.ScreenFocusCmd {
			return nil, fmt.Errorf("/screen:set invalid focus argument %q, must be %s", focusVal, formatStrs([]string{sstore.ScreenFocusInput, sstore.ScreenFocusCmd}, "or", false))
		}
		varsUpdated = append(varsUpdated, "focus")
		updateMap[sstore.ScreenField_Focus] = focusVal
		setNonAnchor = true
	}
	if pk.Kwargs["line"] != "" {
		screen, err := sstore.GetScreenById(ctx, ids.ScreenId)
		if err != nil {
			return nil, fmt.Errorf("/screen:set cannot get screen: %v", err)
		}
		var selectedLineStr string
		if screen.SelectedLine > 0 {
			selectedLineStr = strconv.Itoa(int(screen.SelectedLine))
		}
		ritem, err := resolveLine(ctx, screen.SessionId, screen.ScreenId, pk.Kwargs["line"], selectedLineStr)
		if err != nil {
			return nil, fmt.Errorf("/screen:set error resolving line: %v", err)
		}
		if ritem == nil {
			return nil, fmt.Errorf("/screen:set could not resolve line %q", pk.Kwargs["line"])
		}
		varsUpdated = append(varsUpdated, "line")
		setNonAnchor = true
		updateMap[sstore.ScreenField_SelectedLine] = ritem.Num
	}
	if pk.Kwargs["anchor"] != "" {
		m := screenAnchorRe.FindStringSubmatch(pk.Kwargs["anchor"])
		if m == nil {
			return nil, fmt.Errorf("/screen:set invalid anchor argument (must be [line] or [line]:[offset])")
		}
		anchorLine, _ := strconv.Atoi(m[1])
		varsUpdated = append(varsUpdated, "anchor")
		updateMap[sstore.ScreenField_AnchorLine] = anchorLine
		if m[2] != "" {
			anchorOffset, _ := strconv.Atoi(m[2])
			updateMap[sstore.ScreenField_AnchorOffset] = anchorOffset
		} else {
			updateMap[sstore.ScreenField_AnchorOffset] = 0
		}
	}
	if len(varsUpdated) == 0 {
		return nil, fmt.Errorf("/screen:set no updates, can set %s", formatStrs([]string{"name", "pos", "tabcolor", "tabicon", "focus", "anchor", "line", "sharename"}, "or", false))
	}
	screen, err := sstore.UpdateScreen(ctx, ids.ScreenId, updateMap)
	if err != nil {
		return nil, fmt.Errorf("error updating screen: %v", err)
	}
	if !setNonAnchor {
		return nil, nil
	}

	update := scbus.MakeUpdatePacket()
	update.AddUpdate(*screen, sstore.InfoMsgType{
		InfoMsg:   fmt.Sprintf("screen updated %s", formatStrs(varsUpdated, "and", false)),
		TimeoutMs: 2000,
	})
	return update, nil
}

func ScreenCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session)
	if err != nil {
		return nil, fmt.Errorf("/screen cannot switch to screen: %w", err)
	}
	firstArg := firstArg(pk)
	if firstArg == "" {
		return nil, fmt.Errorf("usage /screen [screen-name|screen-index|screen-id], no param specified")
	}
	ritem, err := resolveSessionScreen(ctx, ids.SessionId, firstArg, ids.ScreenId)
	if err != nil {
		return nil, err
	}
	update, err := sstore.SwitchScreenById(ctx, ids.SessionId, ritem.Id)
	if err != nil {
		return nil, err
	}
	return update, nil
}

func ScreenWebShareCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	return nil, fmt.Errorf("websharing is no longer available")
}

func ScreenReorderCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	// Resolve the UI IDs for the session and screen
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}

	// Extract the screen ID and the new index from the packet
	screenId := ids.ScreenId
	newScreenIdxStr := pk.Kwargs["index"]
	newScreenIdx, err := resolvePosInt(newScreenIdxStr, 1)
	if err != nil {
		return nil, fmt.Errorf("invalid new screen index: %v", err)
	}

	// Call SetScreenIdx to update the screen's index in the database
	err = sstore.SetScreenIdx(ctx, ids.SessionId, screenId, newScreenIdx)
	if err != nil {
		return nil, fmt.Errorf("error updating screen index: %v", err)
	}

	// Retrieve all session screens
	screens, err := sstore.GetSessionScreens(ctx, ids.SessionId)
	if err != nil {
		return nil, fmt.Errorf("error retrieving updated screen: %v", err)
	}

	// Prepare the update packet to send back to the client
	update := scbus.MakeUpdatePacket()
	for _, screen := range screens {
		update.AddUpdate(*screen)
	}
	update.AddUpdate(sstore.InfoMsgType{
		InfoMsg:   "screen indices updated successfully",
		TimeoutMs: 2000,
	})

	return update, nil
}

func ScreenOpenCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	log.Printf("[DEBUG ScreenOpenCommand] Called with kwargs: %v", pk.Kwargs)
	ids, err := resolveUiIds(ctx, pk, R_Session)
	if err != nil {
		return nil, err
	}
	
	// Check if we already have 9 tabs
	screens, err := sstore.GetSessionScreens(ctx, ids.SessionId)
	if err != nil {
		return nil, fmt.Errorf("error getting session screens: %v", err)
	}
	
	// Count non-archived screens
	activeScreenCount := 0
	for _, screen := range screens {
		if !screen.Archived {
			activeScreenCount++
		}
	}
	
	if activeScreenCount >= 9 {
		return nil, fmt.Errorf("maximum number of tabs (9) reached")
	}
	
	activate := resolveBool(pk.Kwargs["activate"], true)
	newName := pk.Kwargs["name"]
	if newName != "" {
		err := validateName(newName, "screen")
		if err != nil {
			return nil, err
		}
	}
	// Get the current cwd from the remote instance's state
	cwdVal := sstore.DefaultCwd
	
	// Try to get the current remote instance state
	localRemote := remote.GetLocalRemote()
	remotePtr := sstore.RemotePtrType{RemoteId: localRemote.RemoteId}
	ri, err := sstore.GetRemoteInstance(ctx, ids.SessionId, ids.ScreenId, remotePtr)
	if err == nil && ri != nil && ri.FeState != nil {
		if cwd, ok := ri.FeState["cwd"]; ok && cwd != "" {
			cwdVal = cwd
			log.Printf("[DEBUG ScreenOpenCommand] Got cwdVal=%s from current remote instance festate", cwdVal)
		}
	} else {
		log.Printf("[DEBUG ScreenOpenCommand] Could not get remote instance or festate: err=%v, ri=%v", err, ri)
	}
	
	// If we couldn't get from remote instance, try last command
	if cwdVal == sstore.DefaultCwd {
		cwdVal, err = sstore.GetLastCmdCwd(ctx, ids.ScreenId)
		if err != nil {
			log.Printf("[DEBUG ScreenOpenCommand] Error getting cwd from last cmd: %v", err)
			cwdVal = sstore.DefaultCwd
		} else {
			log.Printf("[DEBUG ScreenOpenCommand] Got cwdVal=%s from GetLastCmdCwd", cwdVal)
		}
	}
	sco := sstore.ScreenCreateOpts{
	  Cwd:         cwdVal,
	  RtnScreenId: new(string),
	}
	update, err := sstore.InsertScreen(ctx, ids.SessionId, newName, sco, activate)
	if err != nil {
		return nil, err
	}
	if sco.RtnScreenId == nil {
		return nil, fmt.Errorf("error creating tab, no tab id returned")
	}
	uiContextCopy := *pk.UIContext
	uiContextCopy.ScreenId = *sco.RtnScreenId
	log.Printf("[DEBUG ScreenOpenCommand] Calling doNewTabConnectLocal with screenId=%s, cwdVal=%s", *sco.RtnScreenId, cwdVal)
	crUpdate, err := doNewTabConnectLocal(ctx, *sco.RtnScreenId, &uiContextCopy, cwdVal)
	if err != nil {
		return nil, err
	}
	update.Merge(crUpdate)
	// telemetry.GoUpdateActivityWrap(telemetry.ActivityUpdate{NewTab: 1}, "screen:open")
	return update, nil
}

func ScreenArchiveCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session) // don't force R_Screen
	if err != nil {
		return nil, fmt.Errorf("/screen:archive cannot archive screen: %w", err)
	}
	screenId := ids.ScreenId
	if len(pk.Args) > 0 {
		ri, err := resolveSessionScreen(ctx, ids.SessionId, pk.Args[0], ids.ScreenId)
		if err != nil {
			return nil, fmt.Errorf("/screen:archive cannot resolve screen arg: %v", err)
		}
		screenId = ri.Id
	}
	if screenId == "" {
		return nil, fmt.Errorf("/screen:archive no active screen or screen arg passed")
	}
	archiveVal := true
	if len(pk.Args) > 1 {
		archiveVal = resolveBool(pk.Args[1], true)
	}
	var update scbus.UpdatePacket
	if archiveVal {
		update, err = sstore.ArchiveScreen(ctx, ids.SessionId, screenId)
		if err != nil {
			return nil, err
		}
		return update, nil
	} else {
		log.Printf("unarchive screen %s\n", screenId)
		err = sstore.UnArchiveScreen(ctx, ids.SessionId, screenId)
		if err != nil {
			return nil, fmt.Errorf("/screen:archive cannot un-archive screen: %v", err)
		}
		screen, err := sstore.GetScreenById(ctx, screenId)
		if err != nil {
			return nil, fmt.Errorf("/screen:archive cannot get updated screen obj: %v", err)
		}
		update := scbus.MakeUpdatePacket()
		update.AddUpdate(*screen)
		return update, nil
	}
}

func ScreenDeleteCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session) // don't force R_Screen
	if err != nil {
		return nil, fmt.Errorf("/screen:delete cannot delete screen: %w", err)
	}
	screenId := ids.ScreenId
	if len(pk.Args) > 0 {
		ri, err := resolveSessionScreen(ctx, ids.SessionId, pk.Args[0], ids.ScreenId)
		if err != nil {
			return nil, fmt.Errorf("/screen:delete cannot resolve screen arg: %v", err)
		}
		screenId = ri.Id
	}
	if screenId == "" {
		return nil, fmt.Errorf("/screen:delete no active screen or screen arg passed")
	}
	runningCmds, err := sstore.GetRunningScreenCmds(ctx, screenId)
	if err != nil {
		return nil, fmt.Errorf("/screen:delete cannot get running cmds: %v", err)
	}
	for _, runningCmd := range runningCmds {
		// send SIGHUP to all running commands in this screen
		remote.SendSignalToCmd(ctx, runningCmd, "SIGHUP")
	}
	update, err := sstore.DeleteScreen(ctx, screenId, false, nil)
	if err != nil {
		return nil, err
	}
	return update, nil
}

func ScreenShowAllCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session)
	screenArr, err := sstore.GetSessionScreens(ctx, ids.SessionId)
	if err != nil {
		return nil, fmt.Errorf("/screen:showall error getting screen list: %v", err)
	}
	var buf bytes.Buffer
	for _, screen := range screenArr {
		var archivedStr string
		if screen.Archived {
			archivedStr = " (archived)"
		}
		screenIdxStr := "-"
		if screen.ScreenIdx != 0 {
			screenIdxStr = strconv.Itoa(int(screen.ScreenIdx))
		}
		outStr := fmt.Sprintf("%-30s %s  %s\n", screen.Name+archivedStr, screen.ScreenId, screenIdxStr)
		buf.WriteString(outStr)
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.InfoMsgType{
		InfoTitle: fmt.Sprintf("all screens for session"),
		InfoLines: splitLinesForInfo(buf.String()),
	})
	return update, nil
}

func ScreenResetCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}
	localRemote := remote.GetLocalRemote()
	if localRemote == nil {
		return nil, fmt.Errorf("error getting local remote (not found)")
	}
	rptr := sstore.RemotePtrType{RemoteId: localRemote.RemoteId}
	sessionUpdate := &sstore.SessionType{SessionId: ids.SessionId}
	ris, err := sstore.ScreenReset(ctx, ids.ScreenId)
	if err != nil {
		return nil, fmt.Errorf("error resetting screen: %v", err)
	}
	sessionUpdate.Remotes = append(sessionUpdate.Remotes, ris...)
	err = sstore.UpdateCurRemote(ctx, ids.ScreenId, rptr)
	if err != nil {
		return nil, fmt.Errorf("cannot reset screen remote back to local: %w", err)
	}
	outputStr := "reset screen state (all remote state reset)"
	cmd, err := makeStaticCmd(ctx, "screen:reset", ids, pk.GetRawStr(), []byte(outputStr))
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, err
	}
	update, err := addLineForCmd(ctx, "/screen:reset", false, ids, cmd, "", nil)
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, err
	}
	update.AddUpdate(sstore.InteractiveUpdate(pk.Interactive), sessionUpdate)
	return update, nil
}

func ScreenResizeCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}
	colsStr := pk.Kwargs["cols"]
	if colsStr == "" {
		return nil, fmt.Errorf("/screen:resize requires a numeric 'cols' argument")
	}
	cols, err := strconv.Atoi(colsStr)
	if err != nil {
		return nil, fmt.Errorf("/screen:resize requires a numeric 'cols' argument: %v", err)
	}
	if cols <= 0 {
		return nil, fmt.Errorf("/screen:resize invalid zero/negative 'cols' argument")
	}
	cols = base.BoundInt(cols, shexec.MinTermCols, shexec.MaxTermCols)
	runningCmds, err := sstore.GetRunningScreenCmds(ctx, ids.ScreenId)
	if err != nil {
		return nil, fmt.Errorf("/screen:resize cannot get running commands: %v", err)
	}
	if len(runningCmds) == 0 {
		return nil, nil
	}
	includeMap := resolveCommaSepListToMap(pk.Kwargs["include"])
	excludeMap := resolveCommaSepListToMap(pk.Kwargs["exclude"])
	for _, cmd := range runningCmds {
		if excludeMap[cmd.LineId] {
			continue
		}
		if len(includeMap) > 0 && !includeMap[cmd.LineId] {
			continue
		}
		if int(cmd.TermOpts.Cols) != cols {
			resizeRunningCommand(ctx, cmd, cols)
		}
	}
	return nil, nil
}
