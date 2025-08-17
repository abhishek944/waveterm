package cmdrunner

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/abhishek944/waveterm/wavesrv/pkg/history"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbase"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

func implementRunInSidebar(ctx context.Context, screenId string, lineId string) (*sstore.ScreenType, error) {
	screen, err := sidebarSetOpen(ctx, "run", screenId, true, "")
	if err != nil {
		return nil, err
	}
	screen.ScreenViewOpts.Sidebar.SidebarLineId = lineId
	err = sstore.ScreenUpdateViewOpts(ctx, screenId, screen.ScreenViewOpts)
	if err != nil {
		return nil, fmt.Errorf("/run error updating screenviewopts: %v", err)
	}
	return screen, nil
}

func addToHistory(ctx context.Context, pk *scpacket.FeCommandPacketType, historyContext historyContextType, isMetaCmd bool, hadError bool) error {
	cmdStr := firstArg(pk)
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return err
	}
	hitem := &history.HistoryItemType{
		HistoryId: scbase.GenWaveUUID(),
		Ts:        time.Now().UnixMilli(),
		UserId:    DefaultUserId,
		SessionId: ids.SessionId,
		ScreenId:  ids.ScreenId,
		LineId:    historyContext.LineId,
		LineNum:   historyContext.LineNum,
		HadError:  hadError,
		CmdStr:    cmdStr,
		IsMetaCmd: isMetaCmd,
		FeState:   historyContext.FeState,
		Status:    historyContext.InitialStatus,
	}
	if hitem.Status == "" {
		if hadError {
			hitem.Status = sstore.CmdStatusError
		} else {
			hitem.Status = "done"
		}
	}
	if !isMetaCmd && historyContext.RemotePtr != nil {
		hitem.Remote = *historyContext.RemotePtr
	}
	err = history.InsertHistoryItem(ctx, hitem)
	if err != nil {
		return err
	}
	return nil
}

func EvalCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("usage: /eval [command], no command passed to eval")
	}
	log.Printf("[DEBUG] EvalCommand: Evaluating command: %q\n", pk.Args[0])
	if len(pk.Args[0]) > MaxCommandLen {
		return nil, fmt.Errorf("command length too long len:%d, max:%d", len(pk.Args[0]), MaxCommandLen)
	}
	evalDepth := getEvalDepth(ctx)
	// if pk.Interactive && evalDepth == 0 {
	// 	telemetry.GoUpdateActivityWrap(telemetry.ActivityUpdate{NumCommands: 1}, "numcommands")
	// }
	if evalDepth > MaxEvalDepth {
		return nil, fmt.Errorf("alias/history expansion max-depth exceeded")
	}
	var historyContext historyContextType
	ctxWithHistory := context.WithValue(ctx, historyContextKey, &historyContext)
	var update scbus.UpdatePacket
	newPk, rtnErr := EvalMetaCommand(ctxWithHistory, pk)
	if rtnErr == nil {
		log.Printf("[DEBUG] EvalCommand: After EvalMetaCommand - MetaCmd=%s, MetaSubCmd=%s, Args=%v\n", newPk.MetaCmd, newPk.MetaSubCmd, newPk.Args)
	}

	if rtnErr == nil {
		update, rtnErr = HandleCommand(ctxWithHistory, newPk)
	} else {
		return nil, fmt.Errorf("error in Eval Meta Command: %w", rtnErr)
	}
	if !resolveBool(pk.Kwargs[KwArgNoHist], false) && pk.EphemeralOpts == nil {
		// TODO should this be "pk" or "newPk" (2nd arg)
		err := addToHistory(ctx, pk, historyContext, (newPk.MetaCmd != "run"), (rtnErr != nil))
		if err != nil {
			log.Printf("[error] adding to history: %v\n", err)
			// fall through (non-fatal error)
		}
	}
	var hasModelUpdate bool
	var modelUpdate *scbus.ModelUpdatePacketType
	if update == nil && newPk.EphemeralOpts == nil {
		// We don't want to serve an update if we are processing an ephemeral command
		hasModelUpdate = true
		modelUpdate = scbus.MakeUpdatePacket()
		update = modelUpdate
	} else if mu, ok := update.(*scbus.ModelUpdatePacketType); ok {
		hasModelUpdate = true
		modelUpdate = mu
	}
	if resolveBool(newPk.Kwargs["sidebar"], false) && historyContext.LineId != "" && hasModelUpdate {
		ids, resolveErr := resolveUiIds(ctx, newPk, R_Session|R_Screen)
		// we are ignoring resolveErr (if not nil).  obviously can't add to sidebar and
		// either another error already happened, or this command was never about the sidebar
		if resolveErr == nil {
			screen, sidebarErr := implementRunInSidebar(ctx, ids.ScreenId, historyContext.LineId)
			if sidebarErr == nil {
				sstore.AddScreenUpdate(modelUpdate, screen)
			} else {
				sstore.AddInfoMsgUpdateError(modelUpdate, fmt.Sprintf("cannot move command to sidebar: %v", sidebarErr))
			}
		}
	}
	return update, rtnErr
}