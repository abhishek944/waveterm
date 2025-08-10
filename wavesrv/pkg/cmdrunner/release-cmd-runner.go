package cmdrunner

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/abhishek944/waveterm/wavesrv/pkg/scbase"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
	"golang.org/x/mod/semver"
)

func ReleaseCheckCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	err := runReleaseCheck(ctx, true)
	if err != nil {
		return nil, err
	}

	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve updated client data: %v", err)
	}

	var rsp string
	if semver.Compare(scbase.WaveVersion, clientData.ReleaseInfo.LatestVersion) < 0 {
		rsp = "new release available to download: https://www.waveterm.dev/download"
	} else {
		rsp = "no new release available"
	}

	update := sstore.InfoMsgUpdate(rsp)
	update.AddUpdate(*clientData)
	return update, nil
}

func ReleaseCheckOnCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
	}
	if !clientData.ClientOpts.NoReleaseCheck {
		return sstore.InfoMsgUpdate("release check is already on"), nil
	}
	err = setNoReleaseCheck(ctx, clientData, false)
	if err != nil {
		return nil, err
	}

	go func() {
		releaseCheckCtx, cancelFn := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancelFn()
		releaseCheckErr := runReleaseCheck(releaseCheckCtx, true)
		if releaseCheckErr != nil {
			log.Printf("error checking for new release after enabling auto release check: %v\n", releaseCheckErr)
		}
	}()

	clientData, err = sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve updated client data: %v", err)
	}
	update := sstore.InfoMsgUpdate("automatic release checking is now on")
	update.AddUpdate(*clientData)
	return update, nil
}

func ReleaseCheckOffCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
	}
	if clientData.ClientOpts.NoReleaseCheck {
		return sstore.InfoMsgUpdate("release check is already off"), nil
	}
	err = setNoReleaseCheck(ctx, clientData, true)
	if err != nil {
		return nil, err
	}
	clientData, err = sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve updated client data: %v", err)
	}
	update := sstore.InfoMsgUpdate("automatic release checking is now off")
	update.AddUpdate(*clientData)
	return update, nil
}
