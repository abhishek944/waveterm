package cmdrunner

import (
	"context"
	"fmt"

	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

func AutocompleteOnCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
	}
	if clientData.ClientOpts.AutocompleteEnabled {
		return sstore.InfoMsgUpdate("autocomplete is already on"), nil
	}
	err = setAutocompleteEnabled(ctx, clientData, true)
	if err != nil {
		return nil, err
	}
	clientData, err = sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve updated client data: %v", err)
	}
	update := sstore.InfoMsgUpdate("autocomplete is now on")
	update.AddUpdate(*clientData)
	return update, nil
}

func AutocompleteOffCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
	}
	if !clientData.ClientOpts.AutocompleteEnabled {
		return sstore.InfoMsgUpdate("autocomplete is already off"), nil
	}
	err = setAutocompleteEnabled(ctx, clientData, false)
	if err != nil {
		return nil, err
	}
	clientData, err = sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve updated client data: %v", err)
	}
	update := sstore.InfoMsgUpdate("autocomplete is now off")
	update.AddUpdate(*clientData)
	return update, nil
}
