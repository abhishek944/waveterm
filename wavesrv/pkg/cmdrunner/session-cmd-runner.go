package cmdrunner

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/abhishek944/waveterm/wavesrv/pkg/remote"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

func SessionCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, 0)
	if err != nil {
		return nil, err
	}
	firstArg := firstArg(pk)
	if firstArg == "" {
		return nil, fmt.Errorf("usage /session [name|id|pos], no param specified")
	}
	ritem, err := resolveSession(ctx, firstArg, ids.SessionId)
	if err != nil {
		return nil, err
	}
	err = sstore.SetActiveSessionId(ctx, ritem.Id)
	if err != nil {
		return nil, err
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.ActiveSessionIdUpdate(ritem.Id))
	update.AddUpdate(sstore.InfoMsgType{
		InfoMsg:   fmt.Sprintf("switched to session %q", ritem.Name),
		TimeoutMs: 2000,
	})

	// Reset the status indicator for the new active screen
	session, err := sstore.GetSessionById(ctx, ritem.Id)
	if err != nil {
		return nil, fmt.Errorf("cannot get session: %w", err)
	}
	if session == nil {
		return nil, fmt.Errorf("session not found")
	}
	err = sstore.ResetStatusIndicator_Update(update, session.ActiveScreenId)
	if err != nil {
		// this is not a fatal error, just log it
		log.Printf("error resetting status indicator after session command: %v\n", err)
	}

	return update, nil
}

func SessionOpenSharedCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	// activity := telemetry.ActivityUpdate{ClickShared: 1}
	// telemetry.GoUpdateActivityWrap(activity, "click-shared")
	return nil, fmt.Errorf("shared sessions are not available in this version of prompt (stay tuned)")
}

func SessionOpenCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	activate := resolveBool(pk.Kwargs["activate"], true)
	newName := pk.Kwargs["name"]
	if newName != "" {
		err := validateName(newName, "session")
		if err != nil {
			return nil, err
		}
	}
	update, newSessionId, newScreenId, err := sstore.InsertSessionWithName(ctx, newName, activate)
	if err != nil {
		return nil, err
	}
	uiContextCopy := *pk.UIContext
	uiContextCopy.SessionId = newSessionId
	uiContextCopy.ScreenId = newScreenId
	crUpdate, err := doNewTabConnectLocal(ctx, newScreenId, &uiContextCopy, "")
	if err != nil {
		return nil, err
	}
	update.Merge(crUpdate)
	return update, nil
}

func SessionEnsureOneCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	numSessions, err := sstore.GetSessionCount(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot get number of sessions: %v", err)
	}
	if numSessions > 0 {
		return nil, nil
	}
	return SessionOpenCommand(ctx, pk)
}

func SessionDeleteCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, 0) // don't force R_Session
	if err != nil {
		return nil, err
	}
	sessionId := ""
	if len(pk.Args) >= 1 {
		ritem, err := resolveSession(ctx, pk.Args[0], ids.SessionId)
		if err != nil {
			return nil, fmt.Errorf("/session:delete error resolving session %q: %w", pk.Args[0], err)
		}
		if ritem == nil {
			return nil, fmt.Errorf("/session:delete session %q not found", pk.Args[0])
		}
		sessionId = ritem.Id
	} else {
		sessionId = ids.SessionId
	}
	if sessionId == "" {
		return nil, fmt.Errorf("/session:delete no sessionid found")
	}
	update, err := sstore.DeleteSession(ctx, sessionId)
	if err != nil {
		return nil, fmt.Errorf("cannot delete session: %v", err)
	}
	return update, nil
}

func SessionArchiveCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, 0) // don't force R_Session
	if err != nil {
		return nil, err
	}
	sessionId := ""
	if len(pk.Args) >= 1 {
		ritem, err := resolveSession(ctx, pk.Args[0], ids.SessionId)
		if err != nil {
			return nil, fmt.Errorf("/session:archive error resolving session %q: %w", pk.Args[0], err)
		}
		if ritem == nil {
			return nil, fmt.Errorf("/session:archive session %q not found", pk.Args[0])
		}
		sessionId = ritem.Id
	} else {
		sessionId = ids.SessionId
	}
	if sessionId == "" {
		return nil, fmt.Errorf("/session:archive no sessionid found")
	}
	archiveVal := true
	if len(pk.Args) >= 2 {
		archiveVal = resolveBool(pk.Args[1], true)
	}
	if archiveVal {
		update, err := sstore.ArchiveSession(ctx, sessionId)
		if err != nil {
			return nil, fmt.Errorf("cannot archive session: %v", err)
		}
		update.AddUpdate(sstore.InfoMsgType{
			InfoMsg: "session archived",
		})
		return update, nil
	} else {
		activate := resolveBool(pk.Kwargs["activate"], false)
		update, err := sstore.UnArchiveSession(ctx, sessionId, activate)
		if err != nil {
			return nil, fmt.Errorf("cannot un-archive session: %v", err)
		}
		update.AddUpdate(sstore.InfoMsgType{
			InfoMsg: "session un-archived",
		})
		return update, nil
	}
}

func ScreenShowCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}
	screen, err := sstore.GetScreenById(ctx, ids.ScreenId)
	if err != nil {
		return nil, fmt.Errorf("cannot get screen: %v", err)
	}
	if screen == nil {
		return nil, fmt.Errorf("screen not found")
	}
	statePtr, err := sstore.GetRemoteStatePtr(ctx, ids.SessionId, ids.ScreenId, ids.Remote.RemotePtr)
	if err != nil {
		return nil, fmt.Errorf("cannot resolve current screen stateptr: %v", err)
	}
	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "screenid", screen.ScreenId))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "name", screen.Name))
	buf.WriteString(fmt.Sprintf("  %-15s %d\n", "screenidx", screen.ScreenIdx))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "tabcolor", screen.ScreenOpts.TabColor))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "tabicon", screen.ScreenOpts.TabIcon))
	buf.WriteString(fmt.Sprintf("  %-15s %d\n", "selectedline", screen.SelectedLine))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "curremote", GetFullRemoteDisplayName(&screen.CurRemote, &ids.Remote.RState)))
	if statePtr != nil {
		buf.WriteString(fmt.Sprintf("  %-15s %s\n", "stateptr-base", statePtr.BaseHash))
		buf.WriteString(fmt.Sprintf("  %-15s %v\n", "stateptr-diff", statePtr.DiffHashArr))
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.InfoMsgType{
		InfoTitle: "screen info",
		InfoLines: splitLinesForInfo(buf.String()),
	})
	return update, nil
}

func TermSetThemeCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
	}
	id, ok := pk.Kwargs["id"]
	if !ok {
		return nil, fmt.Errorf("id key not provided")
	}
	themeName, themeNameOk := pk.Kwargs["name"]
	feOpts := clientData.FeOpts
	if feOpts.TermThemeSettings == nil {
		feOpts.TermThemeSettings = make(map[string]string)
	}
	if themeNameOk && themeName != "" {
		feOpts.TermThemeSettings[id] = themeName
	} else {
		delete(feOpts.TermThemeSettings, id)
	}
	err = sstore.UpdateClientFeOpts(ctx, feOpts)
	if err != nil {
		return nil, fmt.Errorf("error updating client feopts: %v", err)
	}
	clientData, err = sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve updated client data: %v", err)
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(*clientData)
	return update, nil
}

func SessionShowCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session)
	if err != nil {
		return nil, err
	}
	session, err := sstore.GetSessionById(ctx, ids.SessionId)
	if err != nil {
		return nil, fmt.Errorf("cannot get session: %w", err)
	}
	if session == nil {
		return nil, fmt.Errorf("session not found")
	}
	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "sessionid", session.SessionId))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "name", session.Name))
	if session.SessionIdx != 0 {
		buf.WriteString(fmt.Sprintf("  %-15s %d\n", "index", session.SessionIdx))
	}
	if session.Archived {
		buf.WriteString(fmt.Sprintf("  %-15s %s\n", "archived", "true"))
		ts := time.UnixMilli(session.ArchivedTs)
		buf.WriteString(fmt.Sprintf("  %-15s %s\n", "archivedts", ts.Format(TsFormatStr)))
	}
	stats, err := sstore.GetSessionStats(ctx, ids.SessionId)
	if err != nil {
		return nil, fmt.Errorf("error getting session stats: %w", err)
	}
	var screenArchiveStr string
	if stats.NumArchivedScreens > 0 {
		screenArchiveStr = fmt.Sprintf(" (%d archived)", stats.NumArchivedScreens)
	}
	buf.WriteString(fmt.Sprintf("  %-15s %d%s\n", "screens", stats.NumScreens, screenArchiveStr))
	buf.WriteString(fmt.Sprintf("  %-15s %d\n", "lines", stats.NumLines))
	buf.WriteString(fmt.Sprintf("  %-15s %d\n", "cmds", stats.NumCmds))
	buf.WriteString(fmt.Sprintf("  %-15s %0.2fM\n", "disksize", float64(stats.DiskStats.TotalSize)/1000000))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "disk-location", stats.DiskStats.Location))
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.InfoMsgType{
		InfoTitle: "session info",
		InfoLines: splitLinesForInfo(buf.String()),
	})
	return update, nil
}

func SessionShowAllCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	sessions, err := sstore.GetBareSessions(ctx)
	if err != nil {
		return nil, fmt.Errorf("error retrieving sessions: %v", err)
	}
	var buf bytes.Buffer
	for _, session := range sessions {
		var archivedStr string
		if session.Archived {
			archivedStr = " (archived)"
		}
		sessionIdxStr := "-"
		if session.SessionIdx != 0 {
			sessionIdxStr = strconv.Itoa(int(session.SessionIdx))
		}
		outStr := fmt.Sprintf("%-30s %s  %s\n", session.Name+archivedStr, session.SessionId, sessionIdxStr)
		buf.WriteString(outStr)
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.InfoMsgType{
		InfoTitle: "all sessions",
		InfoLines: splitLinesForInfo(buf.String()),
	})
	return update, nil
}

func SessionSetCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session)
	if err != nil {
		return nil, err
	}
	var varsUpdated []string
	if pk.Kwargs["name"] != "" {
		newName := pk.Kwargs["name"]
		err = validateName(newName, "session")
		if err != nil {
			return nil, err
		}
		err = sstore.SetSessionName(ctx, ids.SessionId, newName)
		if err != nil {
			return nil, fmt.Errorf("setting session name: %v", err)
		}
		varsUpdated = append(varsUpdated, "name")
	}
	if len(varsUpdated) == 0 {
		return nil, fmt.Errorf("/session:set no updates, can set %s", formatStrs([]string{"name", "pos"}, "or", false))
	}
	bareSession, err := sstore.GetBareSessionById(ctx, ids.SessionId)
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(*bareSession, sstore.InfoMsgType{
		InfoMsg:   fmt.Sprintf("session updated %s", formatStrs(varsUpdated, "and", false)),
		TimeoutMs: 2000,
	})
	return update, nil
}

func GetFullRemoteDisplayName(rptr *sstore.RemotePtrType, rstate *remote.RemoteRuntimeState) string {
	if rptr == nil {
		return "(invalid)"
	}
	if rstate.RemoteAlias != "" {
		fullName := rstate.RemoteAlias
		if rptr.Name != "" {
			fullName = fullName + ":" + rptr.Name
		}
		return fmt.Sprintf("[%s] (%s)", fullName, rstate.RemoteCanonicalName)
	} else {
		if rptr.Name != "" {
			return fmt.Sprintf("[%s:%s]", rstate.RemoteCanonicalName, rptr.Name)
		}
		return fmt.Sprintf("[%s]", rstate.RemoteCanonicalName)
	}
}
