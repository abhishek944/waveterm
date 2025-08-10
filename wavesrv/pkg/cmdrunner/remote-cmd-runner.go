package cmdrunner

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/abhishek944/waveterm/waveshell/pkg/base"
	"github.com/abhishek944/waveterm/waveshell/pkg/packet"
	"github.com/abhishek944/waveterm/waveshell/pkg/server"
	"github.com/abhishek944/waveterm/wavesrv/pkg/remote"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbase"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
	"github.com/google/uuid"
	"github.com/kevinburke/ssh_config"
)

func RemoteConfigParseCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	home := base.GetHomeDir()
	localConfig := filepath.Join(home, ".ssh", "config")
	systemConfig := filepath.Join("/etc", "ssh", "config")
	sshConfigFiles := []string{localConfig, systemConfig}
	ssh_config.ReloadConfigs()
	hostPatterns, hostPatternsErr := resolveSshConfigPatterns(sshConfigFiles)
	if hostPatternsErr != nil {
		return nil, hostPatternsErr
	}
	previouslyImportedRemotes, dbQueryErr := sstore.GetAllImportedRemotes(ctx)
	if dbQueryErr != nil {
		return nil, dbQueryErr
	}

	var parsedHostData []*HostInfoType
	hostInfoInConfig := make(map[string]*HostInfoType)
	for _, hostPattern := range hostPatterns {
		hostInfo, hostInfoErr := NewHostInfo(hostPattern)
		if hostInfoErr != nil {
			log.Printf("sshconfig-import: %s", hostInfoErr)
			continue
		}
		parsedHostData = append(parsedHostData, hostInfo)
		hostInfoInConfig[hostInfo.CanonicalName] = hostInfo
	}

	remoteChangeList := make(map[string][]string)

	// remove all previously imported remotes that
	// no longer have a canonical pattern in the config files
	for importedRemoteCanonicalName, importedRemote := range previouslyImportedRemotes {
		var err error
		hostInfo := hostInfoInConfig[importedRemoteCanonicalName]
		if !importedRemote.Archived && (hostInfo == nil || hostInfo.Ignore) {
			err = remote.ArchiveRemote(ctx, importedRemote.RemoteId)
			if err != nil {
				remoteChangeList["deleteErr"] = append(remoteChangeList["deleteErr"], importedRemote.RemoteCanonicalName)
				log.Printf("sshconfig-import: failed to remove remote \"%s\" (%s)\n", importedRemote.RemoteAlias, importedRemote.RemoteCanonicalName)
			} else {
				remoteChangeList["delete"] = append(remoteChangeList["delete"], importedRemote.RemoteCanonicalName)
				log.Printf("sshconfig-import: archived remote \"%s\" (%s)\n", importedRemote.RemoteAlias, importedRemote.RemoteCanonicalName)
			}
		}
	}

	for _, hostInfo := range parsedHostData {
		previouslyImportedRemote := previouslyImportedRemotes[hostInfo.CanonicalName]
		if hostInfo.Ignore {
			log.Printf("sshconfig-import: ignore remote[%s] as specified in config file\n", hostInfo.CanonicalName)
			continue
		}
		if previouslyImportedRemote != nil && !previouslyImportedRemote.Archived {
			// this already existed and was created via import
			// it needs to be updated instead of created
			editMap := make(map[string]interface{})
			editMap[sstore.RemoteField_Alias] = hostInfo.Host
			editMap[sstore.RemoteField_ConnectMode] = hostInfo.ConnectMode
			if hostInfo.SshKeyFile != "" {
				editMap[sstore.RemoteField_SSHKey] = hostInfo.SshKeyFile
			}
			editMap[sstore.RemoteField_ShellPref] = hostInfo.ShellPref
			wsh := remote.GetRemoteById(previouslyImportedRemote.RemoteId)
			if wsh == nil {
				remoteChangeList["updateErr"] = append(remoteChangeList["updateErr"], hostInfo.CanonicalName)
				log.Printf("strange, wsh for remote %s [%s] not found\n", hostInfo.CanonicalName, previouslyImportedRemote.RemoteId)
				continue
			}

			if wsh.Remote.ConnectMode == hostInfo.ConnectMode && wsh.Remote.SSHOpts.SSHIdentity == hostInfo.SshKeyFile && wsh.Remote.RemoteAlias == hostInfo.Host && wsh.Remote.ShellPref == hostInfo.ShellPref {
				// silently skip this one. it didn't fail, but no changes were needed
				continue
			}

			err := wsh.UpdateRemote(ctx, editMap)
			if err != nil {
				remoteChangeList["updateErr"] = append(remoteChangeList["updateErr"], hostInfo.CanonicalName)
				log.Printf("error updating remote[%s]: %v\n", hostInfo.CanonicalName, err)
				continue
			}
			remoteChangeList["update"] = append(remoteChangeList["update"], hostInfo.CanonicalName)
			log.Printf("sshconfig-import: found previously imported remote with canonical name \"%s\": it has been updated\n", hostInfo.CanonicalName)
		} else {
			sshOpts := &sstore.SSHOpts{
				Local:   false,
				SSHHost: hostInfo.Host,
				SSHUser: hostInfo.User,
				IsSudo:  false,
				SSHPort: hostInfo.Port,
			}
			if hostInfo.SshKeyFile != "" {
				sshOpts.SSHIdentity = hostInfo.SshKeyFile
			}

			// this is new and must be created for the first time
			r := &sstore.RemoteType{
				RemoteId:            scbase.GenWaveUUID(),
				RemoteType:          sstore.RemoteTypeSsh,
				RemoteAlias:         hostInfo.Host,
				RemoteCanonicalName: hostInfo.CanonicalName,
				RemoteUser:          hostInfo.User,
				RemoteHost:          hostInfo.Host,
				ConnectMode:         hostInfo.ConnectMode,
				AutoInstall:         true,
				SSHOpts:             sshOpts,
				SSHConfigSrc:        sstore.SSHConfigSrcTypeImport,
				ShellPref:           sstore.ShellTypePref_Detect,
			}
			err := remote.AddRemote(ctx, r, false)
			if err != nil {
				remoteChangeList["createErr"] = append(remoteChangeList["createErr"], hostInfo.CanonicalName)
				log.Printf("sshconfig-import: failed to add remote \"%s\" (%s): it is being skipped\n", hostInfo.Host, hostInfo.CanonicalName)
				continue
			}
			remoteChangeList["create"] = append(remoteChangeList["create"], hostInfo.CanonicalName)
			log.Printf("sshconfig-import: created remote \"%s\" (%s)\n", hostInfo.Host, hostInfo.CanonicalName)
		}
	}

	outMsg := createSshImportSummary(remoteChangeList)
	visualEdit := resolveBool(pk.Kwargs["visual"], false)
	if visualEdit {
		update := scbus.MakeUpdatePacket()
		update.AddUpdate(sstore.AlertMessageType{
			Title:    "SSH Config Import",
			Message:  outMsg,
			Markdown: true,
		})
		return update, nil
	} else {
		update := scbus.MakeUpdatePacket()
		update.AddUpdate(sstore.InfoMsgType{
			InfoMsg: outMsg,
		})
		return update, nil
	}
}

func RemoteArchiveCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_Remote)
	if err != nil {
		return nil, err
	}
	err = remote.ArchiveRemote(ctx, ids.Remote.RemotePtr.RemoteId)
	if err != nil {
		return nil, fmt.Errorf("archiving remote: %v", err)
	}
	update := sstore.InfoMsgUpdate("remote [%s] archived", ids.Remote.DisplayName)
	localRemote := remote.GetLocalRemote()
	rptr := sstore.RemotePtrType{RemoteId: localRemote.GetRemoteId()}
	err = sstore.UpdateCurRemote(ctx, ids.ScreenId, rptr)
	if err != nil {
		return nil, fmt.Errorf("cannot switch remote back to local: %w", err)
	}
	screen, err := sstore.GetScreenById(ctx, ids.ScreenId)
	if err != nil {
		return nil, fmt.Errorf("cannot get updated screen: %w", err)
	}
	update.AddUpdate(*screen)
	return update, nil
}

func RemoteCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	return nil, fmt.Errorf("/remote requires a subcommand: %s", formatStrs([]string{"show"}, "or", false))
}

func RemoteShowCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_Remote)
	if err != nil {
		return nil, err
	}
	state := ids.Remote.RState
	return createRemoteViewRemoteIdUpdate(state.RemoteId), nil
}

func RemoteShowAllCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	stateArr := remote.GetAllRemoteRuntimeState()
	var buf bytes.Buffer
	for _, rstate := range stateArr {
		var name string
		if rstate.RemoteAlias == "" {
			name = rstate.RemoteCanonicalName
		} else {
			name = fmt.Sprintf("%s (%s)", rstate.RemoteCanonicalName, rstate.RemoteAlias)
		}
		buf.WriteString(fmt.Sprintf("%-12s %-5s %8s  %s\n", rstate.Status, rstate.RemoteType, rstate.RemoteId[0:8], name))
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.RemoteViewType{
		RemoteShowAll: true,
	})
	return update, nil
}

func RemoteNewCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	visualEdit := resolveBool(pk.Kwargs["visual"], false)
	isSubmitted := resolveBool(pk.Kwargs["submit"], false)
	if visualEdit && !isSubmitted && len(pk.Args) == 0 {
		return makeRemoteEditUpdate_new(nil), nil
	}
	editArgs, err := parseRemoteEditArgs(true, pk, false)
	if err != nil {
		return nil, fmt.Errorf("/remote:new %v", err)
	}
	r := &sstore.RemoteType{
		RemoteId:            scbase.GenWaveUUID(),
		RemoteType:          sstore.RemoteTypeSsh,
		RemoteAlias:         editArgs.Alias,
		RemoteCanonicalName: editArgs.CanonicalName,
		RemoteUser:          editArgs.SSHOpts.SSHUser,
		RemoteHost:          editArgs.SSHOpts.SSHHost,
		ConnectMode:         editArgs.ConnectMode,
		AutoInstall:         editArgs.AutoInstall,
		SSHOpts:             editArgs.SSHOpts,
		SSHConfigSrc:        sstore.SSHConfigSrcTypeManual,
		ShellPref:           editArgs.ShellPref,
	}
	if editArgs.Color != "" {
		r.RemoteOpts = &sstore.RemoteOptsType{Color: editArgs.Color}
	}
	err = remote.AddRemote(ctx, r, true)
	if err != nil {
		return nil, fmt.Errorf("cannot create remote %q: %v", r.RemoteCanonicalName, err)
	}
	// SUCCESS
	return createRemoteViewRemoteIdUpdate(r.RemoteId), nil
}

func RemoteSetCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_Remote)
	if err != nil {
		return nil, err
	}
	visualEdit := resolveBool(pk.Kwargs["visual"], false)
	isSubmitted := resolveBool(pk.Kwargs["submit"], false)
	editArgs, err := parseRemoteEditArgs(false, pk, ids.Remote.Waveshell.IsLocal())
	if err != nil {
		return makeRemoteEditErrorReturn_edit(ids, visualEdit, fmt.Errorf("/remote:new %v", err))
	}
	if visualEdit && !isSubmitted && len(editArgs.EditMap) == 0 {
		return makeRemoteEditUpdate_edit(ids, nil), nil
	}
	if !visualEdit && len(editArgs.EditMap) == 0 {
		return nil, fmt.Errorf("/remote:set no updates, can set %s.  (set visual=1 to edit in UI)", formatStrs(RemoteSetArgs, "or", false))
	}
	err = ids.Remote.Waveshell.UpdateRemote(ctx, editArgs.EditMap)
	if err != nil {
		return makeRemoteEditErrorReturn_edit(ids, visualEdit, fmt.Errorf("/remote:new error updating remote: %v", err))
	}
	if visualEdit {
		return createRemoteViewRemoteIdUpdate(ids.Remote.RemoteCopy.RemoteId), nil
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.InfoMsgType{
		InfoMsg:   fmt.Sprintf("remote %q updated", ids.Remote.DisplayName),
		TimeoutMs: 2000,
	})
	return update, nil
}

func RemoteInstallCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_Remote)
	if err != nil {
		return nil, err
	}
	wshell := ids.Remote.Waveshell
	go wshell.RunInstall(false)
	return createRemoteViewRemoteIdUpdate(ids.Remote.RemotePtr.RemoteId), nil
}

func RemoteInstallCancelCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_Remote)
	if err != nil {
		return nil, err
	}
	wshell := ids.Remote.Waveshell
	go wshell.CancelInstall()
	return createRemoteViewRemoteIdUpdate(ids.Remote.RemotePtr.RemoteId), nil
}

func RemoteConnectCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_Remote)
	if err != nil {
		return nil, err
	}
	go ids.Remote.Waveshell.Launch(true)
	return createRemoteViewRemoteIdUpdate(ids.Remote.RemotePtr.RemoteId), nil
}

func RemoteDisconnectCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_Remote)
	if err != nil {
		return nil, err
	}
	force := resolveBool(pk.Kwargs["force"], false)
	go ids.Remote.Waveshell.Disconnect(force)
	return createRemoteViewRemoteIdUpdate(ids.Remote.RemotePtr.RemoteId), nil
}

func RemoteResetCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (rtnUpdate scbus.UpdatePacket, rtnErr error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_Remote)
	if err != nil {
		return nil, err
	}
	if !ids.Remote.Waveshell.IsConnected() {
		return nil, fmt.Errorf("cannot reinit, remote is not connected")
	}
	verbose := resolveBool(pk.Kwargs["verbose"], false)
	shellType, err := resolveShellType(pk.Kwargs["shell"], ids.Remote.ShellType)
	if err != nil {
		return nil, err
	}
	termOpts, err := GetUITermOpts(pk.UIContext.WinSize, DefaultPTERM)
	if err != nil {
		return nil, fmt.Errorf("cannot make termopts: %w", err)
	}
	pkTermOpts := convertTermOpts(termOpts)
	cmd, err := makeDynCmd(ctx, "reset", ids, pk.GetRawStr(), *pkTermOpts, nil)
	if err != nil {
		return nil, err
	}
	update, err := addLineForCmd(ctx, "/reset", true, ids, cmd, "", nil)
	if err != nil {
		return nil, err
	}
	opts := connectOptsType{
		Verbose:   verbose,
		ShellType: shellType,
		SessionId: ids.SessionId,
		ScreenId:  ids.ScreenId,
		RPtr:      ids.Remote.RemotePtr,
	}
	go doAsyncResetCommand(ids.Remote.Waveshell, opts, cmd)
	return update, nil
}

func CopyFileCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("usage: /copyfile [file to copy] local=[path to copy to on local]")
	}
	ids, err := resolveUiIds(ctx, pk, R_Screen|R_Session|R_RemoteConnected)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve connected remote id: %v", err)
	}
	sourceInfo := pk.Args[0]
	sourceRemote, sourcePath, err := parseCopyFileParam(sourceInfo)
	var sourceRemoteId *ResolvedRemote
	var destRemoteId *ResolvedRemote
	if err != nil {
		return nil, fmt.Errorf("error: malformed arguments - usage: [remote]:path ")
	} else if sourceRemote == "" {
		// use cur remote
		sourceRemote = ConnectedRemote
		sourceRemoteId = ids.Remote
		if ids.Remote.RemoteCopy.IsLocal() {
			sourceRemote = LocalRemote
		}
	} else {
		pk.Kwargs["remote"] = sourceRemote
		sourceIds, err := resolveUiIds(ctx, pk, R_Remote)
		if err != nil {
			return nil, fmt.Errorf("error resolving remote id %v", err)
		}
		sourceRemoteId = sourceIds.Remote
	}
	destInfo := pk.Args[1]
	destRemote, destPath, err := parseCopyFileParam(destInfo)
	if err != nil {
		return nil, fmt.Errorf("error: malformed arguments - usage: [remote]:path ")
	} else if destRemote == "" {
		destRemote = ConnectedRemote
		destRemoteId = ids.Remote
		if ids.Remote.RemoteCopy.IsLocal() {
			destRemote = LocalRemote
		}
	} else {
		pk.Kwargs["remote"] = destRemote
		destIds, err := resolveUiIds(ctx, pk, R_Remote)
		if err != nil {
			return nil, fmt.Errorf("error resolving remote id %v", err)
		}
		destRemoteId = destIds.Remote
	}
	if destPath == "" {
		return nil, fmt.Errorf("error: malformed arguments - usage: [remote]:path ")
	}

	var sourceFullPath string
	var destFullPath string
	sourceWsh := sourceRemoteId.Waveshell
	if sourceWsh == nil {
		return nil, fmt.Errorf("failure getting source remote waveshell")
	}
	sourceRRState := sourceWsh.GetRemoteRuntimeState()
	sourcePathWithHome, err := sourceRRState.ExpandHomeDir(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("expand home dir err: %v", err)
	}
	sourceFullPath = sourcePathWithHome
	if (sourceRemote == ConnectedRemote || sourceRemote == LocalRemote) && !filepath.IsAbs(sourcePathWithHome) && sourceRemoteId.FeState != nil {
		sourceCwd := sourceRemoteId.FeState["cwd"]
		if sourceCwd != "" {
			sourceFullPath = filepath.Join(sourceCwd, sourcePathWithHome)
		}
	}
	if destPath[len(destPath)-1:] == "/" {
		sourceFileName := filepath.Base(sourceFullPath)
		destPath = filepath.Join(destPath, sourceFileName)
	}
	destWsh := destRemoteId.Waveshell
	if destWsh == nil {
		return nil, fmt.Errorf("failure getting dest remote waveshell")
	}
	destRRState := destWsh.GetRemoteRuntimeState()
	destPathWithHome, err := destRRState.ExpandHomeDir(destPath)
	if err != nil {
		return nil, fmt.Errorf("expand home dir err: %v", err)
	}
	destFullPath = destPathWithHome
	if (destRemote == ConnectedRemote || destRemote == LocalRemote) && !filepath.IsAbs(destPathWithHome) && destRemoteId.FeState != nil {
		destCwd := destRemoteId.FeState["cwd"]
		if destCwd != "" {
			destFullPath = filepath.Join(destCwd, destPathWithHome)
		}
	}
	var outputPos int64
	outputStr := fmt.Sprintf("Copying [%v]:%v to [%v]:%v\r\n", sourceRemoteId.DisplayName, sourceFullPath, destRemoteId.DisplayName, destFullPath)
	termOpts, err := GetUITermOpts(pk.UIContext.WinSize, DefaultPTERM)
	if err != nil {
		return nil, fmt.Errorf("cannot make termopts: %w", err)
	}
	pkTermOpts := convertTermOpts(termOpts)
	cmd, err := makeDynCmd(ctx, "copy file", ids, pk.GetRawStr(), *pkTermOpts, nil)
	writeStringToPty(ctx, cmd, outputStr, &outputPos)
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, err
	}
	update, err := addLineForCmd(ctx, "/copy file", false, ids, cmd, "", nil)
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, err
	}
	update.AddUpdate(sstore.InteractiveUpdate(pk.Interactive))
	if destRemote != ConnectedRemote && destRemoteId != nil && !destRemoteId.RState.IsConnected() {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Attempting to autoconnect to remote %v\r\n", destRemote), &outputPos)
		err = destRemoteId.Waveshell.TryAutoConnect()
		if err != nil {
			writeStringToPty(ctx, cmd, fmt.Sprintf("Couldn't connect to remote %v\r\n", sourceRemote), &outputPos)
		} else {
			writeStringToPty(ctx, cmd, "Auto connect successful\r\n", &outputPos)
		}
	}
	if sourceRemote != LocalRemote && sourceRemoteId != nil && !sourceRemoteId.RState.IsConnected() {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Attempting to autoconnect to remote %v\r\n", sourceRemote), &outputPos)
		err = sourceRemoteId.Waveshell.TryAutoConnect()
		if err != nil {
			writeStringToPty(ctx, cmd, fmt.Sprintf("Couldn't connect to remote %v\r\n", sourceRemote), &outputPos)
		} else {
			writeStringToPty(ctx, cmd, "Auto connect successful\r\n", &outputPos)
		}
	}
	scbus.MainUpdateBus.DoScreenUpdate(cmd.ScreenId, update)
	update = scbus.MakeUpdatePacket()
	if destRemote == LocalRemote && sourceRemote == LocalRemote {
		go doCopyLocalFileToLocal(context.Background(), cmd, sourceFullPath, destFullPath, outputPos)
	} else if destRemote == LocalRemote && sourceRemote != LocalRemote {
		go doCopyRemoteFileToLocal(context.Background(), cmd, sourceWsh, sourceFullPath, destFullPath, outputPos)
	} else if destRemote != LocalRemote && sourceRemote == LocalRemote {
		go doCopyLocalFileToRemote(context.Background(), cmd, destWsh, sourceFullPath, destFullPath, outputPos)
	} else if destRemote != LocalRemote && sourceRemote != LocalRemote {
		go doCopyRemoteFileToRemote(context.Background(), cmd, sourceWsh, destWsh, sourceFullPath, destFullPath, outputPos)
	}
	return update, nil
}

func parseCopyFileParam(info string) (remote string, path string, err error) {
	stringsList := strings.Split(info, ":")
	if len(stringsList) == 1 {
		// use cur remote
		return "", stringsList[0], nil
	} else if len(stringsList) == 2 {
		remote := strings.Trim(stringsList[0], "[] ")
		return remote, stringsList[1], nil
	} else {
		return "error", "error", fmt.Errorf("malformed arguments")
	}
}

func doCopyLocalFileToRemote(ctx context.Context, cmd *sstore.CmdType, remoteWsh *remote.WaveshellProc, localPath string, destPath string, outputPos int64) {
	var exitSuccess bool
	startTime := time.Now()
	defer func() {
		deferWriteCmdStatus(ctx, cmd, startTime, exitSuccess, outputPos)
	}()
	localFile, err := os.Open(localPath)
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Error, unable to open file %v: %v\r\n", localFile, localPath), &outputPos)
		return
	}
	defer localFile.Close()
	writePk := packet.MakeWriteFilePacket()
	writePk.ReqId = uuid.New().String()
	writePk.Path = destPath
	iter, err := remoteWsh.WriteFile(ctx, writePk)
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Error starting file write: %v\r\n", err), &outputPos)
		return
	}
	defer iter.Close()
	_, err = checkForWriteReady(ctx, iter)
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Write ready packet error: %v\r\n", err), &outputPos)
		return
	}
	fileStat, err := localFile.Stat()
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("error: could not get file stat: %v", err), &outputPos)
		return
	}
	fileSizeBytes := fileStat.Size()
	bytesWritten := int64(0)
	lastFileTransferPercentage := float64(0)
	fileTransferPercentage := float64(0)
	writeStringToPty(ctx, cmd, fmt.Sprintf("Source File Size: %s\r\n", prettyPrintByteSize(fileSizeBytes)), &outputPos)
	writeStringToPty(ctx, cmd, "[", &outputPos)
	var buffer [server.MaxFileDataPacketSize]byte
	bufSlice := buffer[:]
	for {
		dataPk := packet.MakeFileDataPacket(writePk.ReqId)
		bytesRead, err := io.ReadFull(localFile, bufSlice)
		if err == io.ErrUnexpectedEOF || err == io.EOF {
			dataPk.Eof = true
		} else if err != nil {
			dataErr := fmt.Sprintf("error reading file data: %v", err)
			dataPk.Error = dataErr
			remoteWsh.SendFileData(dataPk)
			writeStringToPty(ctx, cmd, dataErr, &outputPos)
			return
		}
		if bytesRead > 0 {
			dataPk.Data = make([]byte, bytesRead)
			copy(dataPk.Data, bufSlice[0:bytesRead])
			bytesWritten += int64(len(dataPk.Data))
			fileTransferPercentage = float64(bytesWritten) / float64(fileSizeBytes)

			if fileTransferPercentage-lastFileTransferPercentage > float64(0.05) {
				writeStringToPty(ctx, cmd, "-", &outputPos)
				lastFileTransferPercentage = fileTransferPercentage
			}
		}
		remoteWsh.SendFileData(dataPk)
		if dataPk.Eof {
			break
		}
	}
	err = checkForWriteFinished(ctx, iter)
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Write finished packet error %v", err), &outputPos)
		return
	}
	writeStringToPty(ctx, cmd, "] done. \r\n", &outputPos)
	writeStringToPty(ctx, cmd, fmt.Sprintf("Finished transferring. Transferred %v bytes\r\n", fileSizeBytes), &outputPos)
	exitSuccess = true
}

func doCopyRemoteFileToRemote(ctx context.Context, cmd *sstore.CmdType, sourceWsh *remote.WaveshellProc, destWsh *remote.WaveshellProc, sourcePath string, destPath string, outputPos int64) {
	var exitSuccess bool
	startTime := time.Now()
	defer func() {
		deferWriteCmdStatus(ctx, cmd, startTime, exitSuccess, outputPos)
	}()
	streamPk := packet.MakeStreamFilePacket()
	streamPk.ReqId = uuid.New().String()
	streamPk.Path = sourcePath
	sourceStreamIter, err := sourceWsh.StreamFile(ctx, streamPk)
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Error getting file data packet: %v\r\n", err), &outputPos)
		return
	}
	defer sourceStreamIter.Close()
	respIf, err := sourceStreamIter.Next(ctx)
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Error getting next packet: %v\r\n", err), &outputPos)
		return
	}
	resp, ok := respIf.(*packet.StreamFileResponseType)
	if !ok {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Error in getting packet response: %v\r\n", err), &outputPos)
		return
	}
	if resp == nil || resp.Error != "" {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Response packet has error: %v\r\n", err), &outputPos)
		return
	}
	fileSizeBytes := resp.Info.Size
	if fileSizeBytes == 0 {
		writeStringToPty(ctx, cmd, "Source file does not exist or is empty - exiting\r\n", &outputPos)
		return
	}
	writeStringToPty(ctx, cmd, fmt.Sprintf("Source File Size: %v\r\n", prettyPrintByteSize(fileSizeBytes)), &outputPos)
	writePk := packet.MakeWriteFilePacket()
	writePk.ReqId = uuid.New().String()
	writePk.Path = destPath
	destWriteIter, err := destWsh.WriteFile(ctx, writePk)
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Error starting file write: %v\r\n", err), &outputPos)
		return
	}
	defer destWriteIter.Close()
	_, err = checkForWriteReady(ctx, destWriteIter)
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Write ready packet error: %v\r\n", err), &outputPos)
		return
	}
	bytesWritten := int64(0)
	lastFilePercentageInt := int(0)
	fileTransferPercentage := float64(0)
	writeStringToPty(ctx, cmd, "[", &outputPos)
	for {
		dataPkIf, err := sourceStreamIter.Next(ctx)
		if err != nil {
			log.Printf("error in read-file while getting data: %v\n", err)
			return
		}
		if dataPkIf == nil {
			break
		}
		dataPk, ok := dataPkIf.(*packet.FileDataPacketType)
		if !ok {
			writeStringToPty(ctx, cmd, fmt.Sprintf("error in read-file, invalid data packet type: %T\r\n", dataPkIf), &outputPos)
			return
		}
		if dataPk.Error != "" {
			writeStringToPty(ctx, cmd, fmt.Sprintf("in read-file, data packet error: %s\r\n", dataPk.Error), &outputPos)
			return
		}
		writeDataPk := packet.MakeFileDataPacket(writePk.ReqId)
		writeDataPk.Eof = dataPk.Eof
		writeDataPk.Error = dataPk.Error
		writeDataPk.Type = dataPk.Type
		writeDataPk.Data = make([]byte, int64(len(dataPk.Data)))
		copy(writeDataPk.Data, dataPk.Data)
		err = destWsh.SendFileData(writeDataPk)
		if err != nil {
			writeStringToPty(ctx, cmd, fmt.Sprintf("error sending file to dest: %v\r\n", err), &outputPos)
			return
		}
		bytesWritten += int64(len(dataPk.Data))
		fileTransferPercentage = float64(bytesWritten) / float64(fileSizeBytes)
		filePercentageInt := int(fileTransferPercentage * 100)
		if filePercentageInt-lastFilePercentageInt > 5 {
			statusBarString := getStatusBarString(filePercentageInt)
			writeStringToPty(ctx, cmd, statusBarString, &outputPos)
			lastFilePercentageInt = filePercentageInt
		}
	}
	err = checkForWriteFinished(ctx, destWriteIter)
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("\r\nWrite finished packet error %v", err), &outputPos)
		return
	}
	writeStringToPty(ctx, cmd, getStatusBarString(100), &outputPos)
	writeStringToPty(ctx, cmd, " done. \r\n", &outputPos)
	writeStringToPty(ctx, cmd, fmt.Sprintf("Finished transferring. Transferred %v bytes\r\n", bytesWritten), &outputPos)
	exitSuccess = true
}

func doCopyLocalFileToLocal(ctx context.Context, cmd *sstore.CmdType, sourcePath string, destPath string, outputPos int64) {
	var exitSuccess bool
	var bytesWritten int64
	startTime := time.Now()
	defer func() {
		deferWriteCmdStatus(ctx, cmd, startTime, exitSuccess, outputPos)
	}()
	sourceFile, err := os.Open(sourcePath)
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("error opening source file %v", err), &outputPos)
		return
	}
	defer sourceFile.Close()
	sourceFileStat, err := sourceFile.Stat()
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("error getting filestat %v", err), &outputPos)
		return
	}
	fileSizeBytes := sourceFileStat.Size()
	writeStringToPty(ctx, cmd, fmt.Sprintf("Source File Size: %v\r\n", prettyPrintByteSize(fileSizeBytes)), &outputPos)
	destFile, err := os.Create(destPath)
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("error creating dest file %v", err), &outputPos)
		return
	}
	defer destFile.Close()
	bytesWritten, err = io.Copy(destFile, sourceFile)
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("error copying files %v", err), &outputPos)
		return
	}
	writeStringToPty(ctx, cmd, fmt.Sprintf("Finished transferring. Transferred %v bytes\r\n", bytesWritten), &outputPos)
	exitSuccess = true
}

func doCopyRemoteFileToLocal(ctx context.Context, cmd *sstore.CmdType, remoteWsh *remote.WaveshellProc, sourcePath string, localPath string, outputPos int64) {
	var exitSuccess bool
	startTime := time.Now()
	defer func() {
		deferWriteCmdStatus(ctx, cmd, startTime, exitSuccess, outputPos)
	}()
	streamPk := packet.MakeStreamFilePacket()
	streamPk.ReqId = uuid.New().String()
	streamPk.Path = sourcePath
	iter, err := remoteWsh.StreamFile(ctx, streamPk)
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Error getting file data packet: %v\r\n", err), &outputPos)
		return
	}
	defer iter.Close()
	respIf, err := iter.Next(ctx)
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Error getting next packet: %v\r\n", err), &outputPos)
		return
	}
	resp, ok := respIf.(*packet.StreamFileResponseType)
	if !ok {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Error in getting packet response: %v\r\n", err), &outputPos)
		return
	}
	if resp == nil || resp.Error != "" {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Response packet has error: %v\r\n", err), &outputPos)
		return
	}
	fileSizeBytes := resp.Info.Size
	if fileSizeBytes == 0 {
		writeStringToPty(ctx, cmd, "Source file doesn't exist or file is empty - exiting\r\n", &outputPos)
		return
	}
	writeStringToPty(ctx, cmd, fmt.Sprintf("Source File Size: %s\r\n", prettyPrintByteSize(fileSizeBytes)), &outputPos)
	localFile, err := os.Create(localPath)
	if err != nil {
		writeStringToPty(ctx, cmd, fmt.Sprintf("Error creating file on local %v\r\n", err), &outputPos)
		return
	}
	defer localFile.Close()
	bytesWritten := int64(0)
	lastFileTransferPercentage := float64(0)
	fileTransferPercentage := float64(0)
	writeStringToPty(ctx, cmd, "[", &outputPos)
	for {
		dataPkIf, err := iter.Next(ctx)
		if err != nil {
			log.Printf("error in read-file while getting data: %v\n", err)
			return
		}
		if dataPkIf == nil {
			break
		}
		dataPk, ok := dataPkIf.(*packet.FileDataPacketType)
		if !ok {
			writeStringToPty(ctx, cmd, fmt.Sprintf("error in read-file, invalid data packet type: %T\r\n", dataPkIf), &outputPos)
			return
		}
		if dataPk.Error != "" {
			writeStringToPty(ctx, cmd, fmt.Sprintf("in read-file, data packet error: %s", dataPk.Error), &outputPos)
			return
		}
		localFile.Write(dataPk.Data)
		bytesWritten += int64(len(dataPk.Data))
		fileTransferPercentage = float64(bytesWritten) / float64(fileSizeBytes)

		if fileTransferPercentage-lastFileTransferPercentage > float64(0.05) {
			writeStringToPty(ctx, cmd, "-", &outputPos)
			lastFileTransferPercentage = fileTransferPercentage
		}
	}
	writeStringToPty(ctx, cmd, "] done. \r\n", &outputPos)
	writeStringToPty(ctx, cmd, fmt.Sprintf("Finished transferring. Transferred %v bytes\n", fileSizeBytes), &outputPos)
	exitSuccess = true
}