package cmdrunner

import (
	"bytes"
	"context"
	"fmt"
	"io/fs"
	"time"

	"github.com/abhishek944/waveterm/waveshell/pkg/packet"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

func ImageViewCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("%s requires an argument (file name)", GetCmdStr(pk))
	}
	// TODO more error checking on filename format?
	if pk.Args[0] == "" {
		return nil, fmt.Errorf("%s argument cannot be empty", GetCmdStr(pk))
	}
	filePath := pk.Args[0]
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_RemoteConnected)
	if err != nil {
		return nil, err
	}
	outputStr := fmt.Sprintf("%s %q", GetCmdStr(pk), filePath)
	cmd, err := makeStaticCmd(ctx, GetCmdStr(pk), ids, pk.GetRawStr(), []byte(outputStr))
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, err
	}
	// set the line state
	lineState := make(map[string]any)
	lineState[sstore.LineState_Source] = "file"
	lineState[sstore.LineState_File] = filePath
	update, err := addLineForCmd(ctx, "/"+GetCmdStr(pk), false, ids, cmd, "image", lineState)
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, err
	}
	update.AddUpdate(sstore.InteractiveUpdate(pk.Interactive))
	return update, nil
}

func PdfViewCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("%s requires an argument (file name)", GetCmdStr(pk))
	}
	// TODO more error checking on filename format?
	if pk.Args[0] == "" {
		return nil, fmt.Errorf("%s argument cannot be empty", GetCmdStr(pk))
	}
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_RemoteConnected)
	if err != nil {
		return nil, err
	}
	outputStr := fmt.Sprintf("%s %q", GetCmdStr(pk), pk.Args[0])
	cmd, err := makeStaticCmd(ctx, GetCmdStr(pk), ids, pk.GetRawStr(), []byte(outputStr))
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, err
	}
	// set the line state
	lineState := make(map[string]any)
	lineState[sstore.LineState_Source] = "file"
	lineState[sstore.LineState_File] = pk.Args[0]
	update, err := addLineForCmd(ctx, "/"+GetCmdStr(pk), false, ids, cmd, "pdf", lineState)
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, err
	}
	update.AddUpdate(sstore.InteractiveUpdate(pk.Interactive))
	return update, nil
}

func MediaViewCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("%s requires an argument (file name)", GetCmdStr(pk))
	}
	// TODO more error checking on filename format?
	if pk.Args[0] == "" {
		return nil, fmt.Errorf("%s argument cannot be empty", GetCmdStr(pk))
	}
	fileName := pk.Args[0]
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_RemoteConnected)
	if err != nil {
		return nil, err
	}
	outputStr := fmt.Sprintf("%s %q", GetCmdStr(pk), fileName)
	cmd, err := makeStaticCmd(ctx, GetCmdStr(pk), ids, pk.GetRawStr(), []byte(outputStr))
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, err
	}
	// compute hmac read-file URL
	readFileUrl, err := MakeReadFileUrl(ids.ScreenId, cmd.LineId, fileName)
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, fmt.Errorf("error making read-file url: %v", err)
	}
	// set the line state
	lineState := make(map[string]any)
	lineState[sstore.LineState_FileUrl] = readFileUrl
	lineState[sstore.LineState_File] = fileName
	update, err := addLineForCmd(ctx, "/"+GetCmdStr(pk), false, ids, cmd, "media", lineState)
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, err
	}
	update.AddUpdate(sstore.InteractiveUpdate(pk.Interactive))
	return update, nil
}

func MarkdownViewCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("%s requires an argument (file name)", GetCmdStr(pk))
	}
	// TODO more error checking on filename format?
	if pk.Args[0] == "" {
		return nil, fmt.Errorf("%s argument cannot be empty", GetCmdStr(pk))
	}
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_RemoteConnected)
	if err != nil {
		return nil, err
	}
	outputStr := fmt.Sprintf("%s %q", GetCmdStr(pk), pk.Args[0])
	cmd, err := makeStaticCmd(ctx, GetCmdStr(pk), ids, pk.GetRawStr(), []byte(outputStr))
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, err
	}
	// set the line state
	lineState := make(map[string]any)
	lineState[sstore.LineState_Source] = "file"
	lineState[sstore.LineState_File] = pk.Args[0]
	update, err := addLineForCmd(ctx, "/"+GetCmdStr(pk), false, ids, cmd, "markdown", lineState)
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, err
	}
	update.AddUpdate(sstore.InteractiveUpdate(pk.Interactive))
	return update, nil
}

func CSVViewCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("%s requires an argument (file name)", GetCmdStr(pk))
	}
	// TODO more error checking on filename format?
	if pk.Args[0] == "" {
		return nil, fmt.Errorf("%s argument cannot be empty", GetCmdStr(pk))
	}
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_RemoteConnected)
	if err != nil {
		return nil, err
	}
	outputStr := fmt.Sprintf("%s %q", GetCmdStr(pk), pk.Args[0])
	cmd, err := makeStaticCmd(ctx, GetCmdStr(pk), ids, pk.GetRawStr(), []byte(outputStr))
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, err
	}
	// set the line state
	lineState := make(map[string]any)
	lineState[sstore.LineState_Source] = "file"
	lineState[sstore.LineState_File] = pk.Args[0]
	update, err := addLineForCmd(ctx, "/"+GetCmdStr(pk), true, ids, cmd, "csv", lineState)
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, err
	}
	update.AddUpdate(sstore.InteractiveUpdate(pk.Interactive))
	return update, nil
}

func CodeEditCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("%s requires an argument (file name)", GetCmdStr(pk))
	}
	// TODO more error checking on filename format?
	if pk.Args[0] == "" {
		return nil, fmt.Errorf("%s argument cannot be empty", GetCmdStr(pk))
	}
	langArg, err := getLangArg(pk)
	if err != nil {
		return nil, fmt.Errorf("%s invalid 'lang': %v", GetCmdStr(pk), err)
	}
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_RemoteConnected)
	if err != nil {
		return nil, err
	}
	outputStr := fmt.Sprintf("%s %q", GetCmdStr(pk), pk.Args[0])
	cmd, err := makeStaticCmd(ctx, GetCmdStr(pk), ids, pk.GetRawStr(), []byte(outputStr))
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, err
	}
	// set the line state
	lineState := make(map[string]any)
	lineState[sstore.LineState_Source] = "file"
	lineState[sstore.LineState_File] = pk.Args[0]
	if GetCmdStr(pk) == "codeview" {
		lineState[sstore.LineState_Mode] = "view"
	} else {
		lineState[sstore.LineState_Mode] = "edit"
	}
	if langArg != "" {
		lineState[sstore.LineState_Lang] = langArg
	}
	if _, ok := pk.Kwargs[KwArgMinimap]; ok {
		lineState[sstore.LineState_Minimap] = resolveBool(pk.Kwargs[KwArgMinimap], false)
	}
	update, err := addLineForCmd(ctx, "/"+GetCmdStr(pk), true, ids, cmd, "code", lineState)
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, err
	}
	update.AddUpdate(sstore.InteractiveUpdate(pk.Interactive))
	return update, nil
}

func ViewStatCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("/view:stat requires an argument (file name)")
	}
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_RemoteConnected)
	if err != nil {
		return nil, err
	}
	streamPk, err := makeStreamFilePk(ids, pk)
	if err != nil {
		return nil, err
	}
	streamPk.StatOnly = true
	wsh := ids.Remote.Waveshell
	iter, err := wsh.StreamFile(ctx, streamPk)
	if err != nil {
		return nil, fmt.Errorf("/view:stat error: %v", err)
	}
	defer iter.Close()
	respIf, err := iter.Next(ctx)
	if err != nil {
		return nil, fmt.Errorf("/view:stat error getting response: %v", err)
	}
	resp, ok := respIf.(*packet.StreamFileResponseType)
	if !ok {
		return nil, fmt.Errorf("/view:stat error, bad response packet type: %T", respIf)
	}
	if resp.Error != "" {
		return nil, fmt.Errorf("/view:stat error: %s", resp.Error)
	}
	if resp.Info == nil {
		return nil, fmt.Errorf("/view:stat error, no file info")
	}
	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "path", resp.Info.Name))
	buf.WriteString(fmt.Sprintf("  %-15s %d\n", "size", resp.Info.Size))
	modTs := time.UnixMilli(resp.Info.ModTs)
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "modts", modTs.Format(TsFormatStr)))
	buf.WriteString(fmt.Sprintf("  %-15s %v\n", "isdir", resp.Info.IsDir))
	modeStr := fs.FileMode(resp.Info.Perm).String()
	if len(modeStr) > 9 {
		modeStr = modeStr[len(modeStr)-9:]
	}
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "perms", modeStr))
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.InfoMsgType{
		InfoTitle: fmt.Sprintf("view stat %q", streamPk.Path),
		InfoLines: splitLinesForInfo(buf.String()),
	})
	return update, nil
}

func ViewTestCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("/view:test requires an argument (file name)")
	}
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_RemoteConnected)
	if err != nil {
		return nil, err
	}
	streamPk, err := makeStreamFilePk(ids, pk)
	if err != nil {
		return nil, err
	}
	wsh := ids.Remote.Waveshell
	iter, err := wsh.StreamFile(ctx, streamPk)
	if err != nil {
		return nil, fmt.Errorf("/view:test error: %v", err)
	}
	defer iter.Close()
	respIf, err := iter.Next(ctx)
	if err != nil {
		return nil, fmt.Errorf("/view:test error getting response: %v", err)
	}
	resp, ok := respIf.(*packet.StreamFileResponseType)
	if !ok {
		return nil, fmt.Errorf("/view:test error, bad response packet type: %T", respIf)
	}
	if resp.Error != "" {
		return nil, fmt.Errorf("/view:test error: %s", resp.Error)
	}
	if resp.Info == nil {
		return nil, fmt.Errorf("/view:test error, no file info")
	}
	var buf bytes.Buffer
	var numPackets int
	for {
		dataPkIf, err := iter.Next(ctx)
		if err != nil {
			return nil, fmt.Errorf("/view:test error while getting data: %w", err)
		}
		if dataPkIf == nil {
			break
		}
		dataPk, ok := dataPkIf.(*packet.FileDataPacketType)
		if !ok {
			return nil, fmt.Errorf("/view:test invalid data packet type: %T", dataPkIf)
		}
		if dataPk.Error != "" {
			return nil, fmt.Errorf("/view:test error returned while getting data: %s", dataPk.Error)
		}
		numPackets++
		buf.Write(dataPk.Data)
	}
	buf.WriteString(fmt.Sprintf("\n\ntotal packets: %d\n", numPackets))
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.InfoMsgType{
		InfoTitle: fmt.Sprintf("view file %q", streamPk.Path),
		InfoLines: splitLinesForInfo(buf.String()),
	})
	return update, nil
}
