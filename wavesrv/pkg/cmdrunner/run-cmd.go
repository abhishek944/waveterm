package cmdrunner

import (
	"context"
	"fmt"
	"strings"

	"github.com/abhishek944/waveterm/waveshell/pkg/base"
	"github.com/abhishek944/waveterm/waveshell/pkg/packet"
	"github.com/abhishek944/waveterm/wavesrv/pkg/remote"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbase"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
	"github.com/google/uuid"
)

func RunCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_RemoteConnected)
	if err != nil {
		return nil, fmt.Errorf("/run error: %w", err)
	}
	renderer, err := getRendererArg(pk)
	if err != nil {
		return nil, fmt.Errorf("/run error, invalid view/renderer: %w", err)
	}
	templateArg, err := getTemplateArg(pk)
	if err != nil {
		return nil, fmt.Errorf("/run error, invalid template: %w", err)
	}
	langArg, err := getLangArg(pk)
	if err != nil {
		return nil, fmt.Errorf("/run error, invalid lang: %w", err)
	}

	cmdStr := firstArg(pk)
	expandedCmdStr, err := doCmdHistoryExpansion(ctx, ids, cmdStr)
	if err != nil {
		return nil, err
	}
	if expandedCmdStr != "" {
		newPk := scpacket.MakeFeCommandPacket()
		newPk.MetaCmd = "eval"
		newPk.Args = []string{expandedCmdStr}
		newPk.Kwargs = pk.Kwargs
		newPk.RawStr = pk.RawStr
		newPk.UIContext = pk.UIContext
		newPk.Interactive = pk.Interactive
		newPk.EphemeralOpts = pk.EphemeralOpts
		evalDepth := getEvalDepth(ctx)
		ctxWithDepth := context.WithValue(ctx, depthContextKey, evalDepth+1)
		return EvalCommand(ctxWithDepth, newPk)
	}
	isRtnStateCmd := IsReturnStateCommand(cmdStr)
	// runPacket.State is set in remote.RunCommand()
	runPacket := packet.MakeRunPacket()
	runPacket.ReqId = uuid.New().String()
	runPacket.CK = base.MakeCommandKey(ids.ScreenId, scbase.GenWaveUUID())
	runPacket.UsePty = true
	ptermVal := defaultStr(pk.Kwargs["wterm"], DefaultPTERM)
	runPacket.TermOpts, err = GetUITermOpts(pk.UIContext.WinSize, ptermVal)
	if err != nil {
		return nil, fmt.Errorf("/run error, invalid 'pterm' value %q: %v", ptermVal, err)
	}
	runPacket.Command = strings.TrimSpace(cmdStr)
	runPacket.ReturnState = resolveBool(pk.Kwargs["rtnstate"], isRtnStateCmd)

	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
	}
	feOpts := clientData.FeOpts

	if sudoArg, ok := pk.Kwargs[KwArgSudo]; ok {
		runPacket.IsSudo = resolveBool(sudoArg, false) && feOpts.SudoPwStore != "off"
	} else {
		runPacket.IsSudo = IsSudoCommand(cmdStr) && feOpts.SudoPwStore != "off"
	}
	rcOpts := remote.RunCommandOpts{
		SessionId:     ids.SessionId,
		ScreenId:      ids.ScreenId,
		RemotePtr:     ids.Remote.RemotePtr,
		EphemeralOpts: pk.EphemeralOpts,
	}
	cmd, callback, err := remote.RunCommand(ctx, rcOpts, runPacket)
	if callback != nil {
		defer callback()
	}
	if err != nil {
		return nil, err
	}
	cmd.RawCmdStr = pk.GetRawStr()
	lineState := make(map[string]any)
	if templateArg != "" {
		lineState[sstore.LineState_Template] = templateArg
	}
	if langArg != "" {
		lineState[sstore.LineState_Lang] = langArg
	}

	// If we are running an ephemeral command, we don't want to add the line to the screen
	if pk.EphemeralOpts == nil {
		update, err := addLineForCmd(ctx, "/run", true, ids, cmd, renderer, lineState)
		if err != nil {
			return nil, err
		}
		update.AddUpdate(sstore.InteractiveUpdate(pk.Interactive))
		// this update is sent asynchronously for timing issues.  the cmd update comes async as well
		// so if we return this directly it sometimes gets evaluated first.  by pushing it on the MainBus
		// it ensures it happens after the command creation event.
		scbus.MainUpdateBus.DoScreenUpdate(ids.ScreenId, update)
	}
	return nil, nil
}