// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package shexec

import (
	"context"
	"fmt"
	"io"
	"log"
	"os/exec"
	"time"

	"github.com/abhishek944/waveterm/waveshell/pkg/base"
	"github.com/abhishek944/waveterm/waveshell/pkg/packet"
	"github.com/abhishek944/waveterm/waveshell/pkg/utilfn"
	"golang.org/x/crypto/ssh"
	"golang.org/x/mod/semver"
)

// TODO - track buffer sizes for sending input

const NotFoundVersion = "v0.0"

type CmdWrap struct {
	Cmd *exec.Cmd
}

func (cw CmdWrap) Kill() {
	cw.Cmd.Process.Kill()
}

func (cw CmdWrap) Wait() error {
	return cw.Cmd.Wait()
}

func (cw CmdWrap) Sender() (*packet.PacketSender, io.WriteCloser, error) {
	inputWriter, err := cw.Cmd.StdinPipe()
	if err != nil {
		return nil, nil, fmt.Errorf("creating stdin pipe: %v", err)
	}
	sender := packet.MakePacketSender(inputWriter, nil)
	return sender, inputWriter, nil
}

func (cw CmdWrap) Parser() (*packet.PacketParser, io.ReadCloser, io.ReadCloser, error) {
	stdoutReader, err := cw.Cmd.StdoutPipe()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("creating stdout pipe: %v", err)
	}
	stderrReader, err := cw.Cmd.StderrPipe()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("creating stderr pipe: %v", err)
	}
	stdoutPacketParser := packet.MakePacketParser(stdoutReader, &packet.PacketParserOpts{IgnoreUntilValid: true})
	stderrPacketParser := packet.MakePacketParser(stderrReader, nil)
	packetParser := packet.CombinePacketParsers(stdoutPacketParser, stderrPacketParser, true)
	return packetParser, stdoutReader, stderrReader, nil
}

func (cw CmdWrap) Start() error {
	defer func() {
		for _, extraFile := range cw.Cmd.ExtraFiles {
			if extraFile != nil {
				extraFile.Close()
			}
		}
	}()
	return cw.Cmd.Start()
}

func (cw CmdWrap) StdinPipe() (io.WriteCloser, error) {
	return cw.Cmd.StdinPipe()
}

func (cw CmdWrap) StdoutPipe() (io.ReadCloser, error) {
	return cw.Cmd.StdoutPipe()
}

func (cw CmdWrap) StderrPipe() (io.ReadCloser, error) {
	return cw.Cmd.StderrPipe()
}

type SessionWrap struct {
	Session  *ssh.Session
	StartCmd string
	stdin    io.WriteCloser // keep reference alive to prevent GC closing
}

func (sw SessionWrap) Kill() {
	sw.Session.Close()
}

func (sw SessionWrap) Wait() error {
	log.Printf("[SSH] SessionWrap.Wait: Waiting for session to complete")
	err := sw.Session.Wait()
	log.Printf("[SSH] SessionWrap.Wait: Session completed with error: %v", err)
	return err
}

func (sw SessionWrap) Start() error {
	// For gcloud IAP tunnels, we need to use Shell mode instead of Start
	// This keeps the session alive properly
	log.Printf("[SSH] SessionWrap.Start: Setting up shell mode")

	// Get stdin pipe before starting shell and keep it alive
	stdin, err := sw.Session.StdinPipe()
	if err != nil {
		log.Printf("[SSH] SessionWrap.Start: StdinPipe failed: %v", err)
		return err
	}

	// Start shell first
	if err := sw.Session.Shell(); err != nil {
		log.Printf("[SSH] SessionWrap.Start: Shell failed: %v", err)
		return err
	}

	// Send the command through stdin
	log.Printf("[SSH] SessionWrap.Start: Sending command: %s", sw.StartCmd)
	// save writer to keep session stdin open
	sw.stdin = stdin
	_, err = fmt.Fprintf(sw.stdin, "%s\n", sw.StartCmd)
	if err != nil {
		log.Printf("[SSH] SessionWrap.Start: Failed to send command: %v", err)
		return err
	}

	return nil
}

func (sw SessionWrap) Sender() (*packet.PacketSender, io.WriteCloser, error) {
	// Reuse the stdin writer obtained during Start to avoid closing the pipe.
	var inputWriter io.WriteCloser
	var err error
	if sw.stdin != nil {
		inputWriter = sw.stdin
	} else {
		inputWriter, err = sw.Session.StdinPipe()
		if err != nil {
			return nil, nil, fmt.Errorf("creating stdin pipe: %v", err)
		}
		// keep reference
		sw.stdin = inputWriter
	}
	sender := packet.MakePacketSender(inputWriter, nil)
	return sender, inputWriter, nil
}

func (sw SessionWrap) Parser() (*packet.PacketParser, io.ReadCloser, io.ReadCloser, error) {
	stdoutReader, err := sw.Session.StdoutPipe()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("creating stdout pipe: %v", err)
	}
	stderrReader, err := sw.Session.StderrPipe()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("creating stderr pipe: %v", err)
	}
	stdoutPacketParser := packet.MakePacketParser(stdoutReader, &packet.PacketParserOpts{IgnoreUntilValid: true})
	stderrPacketParser := packet.MakePacketParser(stderrReader, nil)
	packetParser := packet.CombinePacketParsers(stdoutPacketParser, stderrPacketParser, true)
	return packetParser, io.NopCloser(stdoutReader), io.NopCloser(stderrReader), nil
}

func (sw SessionWrap) StdinPipe() (io.WriteCloser, error) {
	return sw.Session.StdinPipe()
}

func (sw SessionWrap) StdoutPipe() (io.ReadCloser, error) {
	stdoutReader, err := sw.Session.StdoutPipe()
	if err != nil {
		return nil, err
	}
	return io.NopCloser(stdoutReader), nil
}

func (sw SessionWrap) StderrPipe() (io.ReadCloser, error) {
	stderrReader, err := sw.Session.StderrPipe()
	if err != nil {
		return nil, err
	}
	return io.NopCloser(stderrReader), nil
}

type ConnInterface interface {
	Kill()
	Wait() error
	Sender() (*packet.PacketSender, io.WriteCloser, error)
	Parser() (*packet.PacketParser, io.ReadCloser, io.ReadCloser, error)
	Start() error
	StdinPipe() (io.WriteCloser, error)
	StdoutPipe() (io.ReadCloser, error)
	StderrPipe() (io.ReadCloser, error)
}

type ClientProc struct {
	Cmd          ConnInterface
	InitPk       *packet.InitPacketType
	StartTs      time.Time
	StdinWriter  io.WriteCloser
	StdoutReader io.ReadCloser
	StderrReader io.ReadCloser
	Input        *packet.PacketSender
	Output       *packet.PacketParser
}

type WaveshellLaunchError struct {
	InitPk *packet.InitPacketType
}

func (wle WaveshellLaunchError) Error() string {
	if wle.InitPk.NotFound {
		return "waveshell client not found"
	} else if semver.MajorMinor(wle.InitPk.Version) != semver.MajorMinor(base.WaveshellVersion) {
		return fmt.Sprintf("invalid remote waveshell version '%s', must be '=%s'", wle.InitPk.Version, semver.MajorMinor(base.WaveshellVersion))
	}
	return fmt.Sprintf("invalid waveshell: init packet=%v", *wle.InitPk)
}

type InvalidPacketError struct {
	InvalidPk *packet.PacketType
}

func (ipe InvalidPacketError) Error() string {
	if ipe.InvalidPk == nil {
		return "no init packet received from waveshell client"
	}
	return fmt.Sprintf("invalid packet received from waveshell client: %s", packet.AsString(*ipe.InvalidPk))
}

// returns (clientproc, initpk, error)
func MakeClientProc(ctx context.Context, ecmd ConnInterface) (*ClientProc, error) {
	log.Printf("[SSH] MakeClientProc: starting")
	startTs := time.Now()
	sender, inputWriter, err := ecmd.Sender()
	if err != nil {
		log.Printf("[SSH] MakeClientProc: Sender() failed: %v", err)
		return nil, err
	}
	packetParser, stdoutReader, stderrReader, err := ecmd.Parser()
	if err != nil {
		log.Printf("[SSH] MakeClientProc: Parser() failed: %v", err)
		return nil, err
	}
	err = ecmd.Start()
	if err != nil {
		log.Printf("[SSH] MakeClientProc: Start() failed: %v", err)
		return nil, fmt.Errorf("running local client: %w", err)
	}
	log.Printf("[SSH] MakeClientProc: Command started, waiting for init packet")
	cproc := &ClientProc{
		Cmd:          ecmd,
		StartTs:      startTs,
		StdinWriter:  inputWriter,
		StdoutReader: stdoutReader,
		StderrReader: stderrReader,
		Input:        sender,
		Output:       packetParser,
	}

	var pk packet.PacketType
	select {
	case pk = <-packetParser.MainCh:
		log.Printf("[SSH] MakeClientProc: Received packet")
	case <-ctx.Done():
		log.Printf("[SSH] MakeClientProc: Context cancelled")
		cproc.Close()
		return nil, ctx.Err()
	}
	if pk == nil {
		log.Printf("[SSH] MakeClientProc: Received nil packet")
		cproc.Close()
		return nil, InvalidPacketError{}
	}
	if pk.GetType() != packet.InitPacketStr {
		log.Printf("[SSH] MakeClientProc: Invalid packet type: %s", pk.GetType())
		cproc.Close()
		return nil, InvalidPacketError{InvalidPk: &pk}
	}
	initPk := pk.(*packet.InitPacketType)
	log.Printf("[SSH] MakeClientProc: InitPacket received - NotFound=%v, Version=%s", initPk.NotFound, initPk.Version)
	if initPk.NotFound {
		log.Printf("[SSH] MakeClientProc: Waveshell not found on remote")
		cproc.Close()
		return nil, WaveshellLaunchError{InitPk: initPk}
	}
	if semver.MajorMinor(initPk.Version) != semver.MajorMinor(base.WaveshellVersion) {
		log.Printf("[SSH] MakeClientProc: Version mismatch - remote=%s, expected=%s", initPk.Version, semver.MajorMinor(base.WaveshellVersion))
		cproc.Close()
		return nil, WaveshellLaunchError{InitPk: initPk}
	}
	cproc.InitPk = initPk
	log.Printf("[SSH] MakeClientProc: Success")
	return cproc, nil
}

func (cproc *ClientProc) Close() {
	if cproc.Input != nil {
		cproc.Input.Close()
	}
	if cproc.StdinWriter != nil {
		cproc.StdinWriter.Close()
	}
	if cproc.StdoutReader != nil {
		cproc.StdoutReader.Close()
	}
	if cproc.StderrReader != nil {
		cproc.StderrReader.Close()
	}
	if cproc.Cmd != nil {
		cproc.Cmd.Kill()
	}
}

func (cproc *ClientProc) ProxySingleOutput(ck base.CommandKey, sender *packet.PacketSender, packetCallback func(packet.PacketType)) {
	sentDonePk := false
	for pk := range cproc.Output.MainCh {
		if packetCallback != nil {
			packetCallback(pk)
		}
		if pk.GetType() == packet.CmdDonePacketStr {
			sentDonePk = true
		}
		sender.SendPacket(pk)
	}
	exitErr := cproc.Cmd.Wait()
	if !sentDonePk {
		endTs := time.Now()
		cmdDuration := endTs.Sub(cproc.StartTs)
		donePacket := packet.MakeCmdDonePacket(ck)
		donePacket.Ts = endTs.UnixMilli()
		donePacket.ExitCode = utilfn.GetExitCode(exitErr)
		donePacket.DurationMs = int64(cmdDuration / time.Millisecond)
		sender.SendPacket(donePacket)
	}
}
