package cmdrunner

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/abhishek944/waveterm/wavesrv/pkg/history"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
	"github.com/google/uuid"
)

const HistoryViewPageSize = 50

var cmdFilterLs = regexp.MustCompile(`^ls(\s|$)`)
var cmdFilterCd = regexp.MustCompile(`^cd(\s|$)`)

func historyCmdFilter(hitem *history.HistoryItemType) bool {
	cmdStr := hitem.CmdStr
	if cmdStr == "" || strings.Index(cmdStr, ";") != -1 || strings.Index(cmdStr, "\n") != -1 {
		return true
	}
	if cmdFilterLs.MatchString(cmdStr) {
		return false
	}
	if cmdFilterCd.MatchString(cmdStr) {
		return false
	}
	return true
}

func HistoryCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_Remote)
	if err != nil {
		return nil, err
	}
	maxItems, err := resolvePosInt(pk.Kwargs["maxitems"], DefaultMaxHistoryItems)
	if err != nil {
		return nil, fmt.Errorf("invalid maxitems value '%s' (must be a number): %v", pk.Kwargs["maxitems"], err)
	}
	if maxItems < 0 {
		return nil, fmt.Errorf("invalid maxitems value '%d' (cannot be negative)", maxItems)
	}
	if maxItems == 0 {
		maxItems = DefaultMaxHistoryItems
	}
	htype := HistoryTypeScreen
	hSessionId := ids.SessionId
	hScreenId := ids.ScreenId
	if pk.Kwargs["type"] != "" {
		htype = pk.Kwargs["type"]
		if htype != HistoryTypeScreen && htype != HistoryTypeSession && htype != HistoryTypeGlobal {
			return nil, fmt.Errorf("invalid history type '%s', valid types: %s", htype, formatStrs([]string{HistoryTypeScreen, HistoryTypeSession, HistoryTypeGlobal}, "or", false))
		}
	}
	if htype == HistoryTypeGlobal {
		hSessionId = ""
		hScreenId = ""
	} else if htype == HistoryTypeSession {
		hScreenId = ""
	}
	hopts := history.HistoryQueryOpts{MaxItems: maxItems, SessionId: hSessionId, ScreenId: hScreenId}
	hresult, err := history.GetHistoryItems(ctx, hopts)
	if err != nil {
		return nil, err
	}
	show := !resolveBool(pk.Kwargs["noshow"], false)
	// if show {
	// 	telemetry.GoUpdateActivityWrap(telemetry.ActivityUpdate{HistoryView: 1}, "history")
	// }
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(history.HistoryInfoType{
		HistoryType: htype,
		SessionId:   ids.SessionId,
		ScreenId:    ids.ScreenId,
		Items:       hresult.Items,
		Show:        show,
	})
	return update, nil
}

func HistoryViewAllCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	_, err := resolveUiIds(ctx, pk, 0)
	if err != nil {
		return nil, err
	}
	offset, err := resolveNonNegInt(pk.Kwargs["offset"], 0)
	if err != nil {
		return nil, err
	}
	rawOffset, err := resolveNonNegInt(pk.Kwargs["rawoffset"], 0)
	if err != nil {
		return nil, err
	}
	opts := history.HistoryQueryOpts{MaxItems: HistoryViewPageSize, Offset: offset, RawOffset: rawOffset}
	if pk.Kwargs["text"] != "" {
		opts.SearchText = pk.Kwargs["text"]
	}
	if pk.Kwargs["searchsession"] != "" {
		sessionId, err := resolveSessionArg(pk.Kwargs["searchsession"])
		if err != nil {
			return nil, fmt.Errorf("invalid searchsession: %v", err)
		}
		opts.SessionId = sessionId
	}
	if pk.Kwargs["searchremote"] != "" {
		rptr, err := resolveRemoteArg(pk.Kwargs["searchremote"])
		if err != nil {
			return nil, fmt.Errorf("invalid searchremote: %v", err)
		}
		if rptr != nil {
			opts.RemoteId = rptr.RemoteId
		}
	}
	if pk.Kwargs["fromts"] != "" {
		fromTs, err := resolvePosInt(pk.Kwargs["fromts"], 0)
		if err != nil {
			// no error here anymore (otherwise it jams up the frontend, just ignore and set to 0)
			opts.FromTs = 0
		}
		if fromTs > 0 {
			opts.FromTs = int64(fromTs)
		}
	}
	if pk.Kwargs["meta"] != "" {
		opts.NoMeta = !resolveBool(pk.Kwargs["meta"], true)
	}
	if resolveBool(pk.Kwargs["filter"], false) {
		opts.FilterFn = historyCmdFilter
	}
	if err != nil {
		return nil, fmt.Errorf("invalid meta arg (must be boolean): %v", err)
	}
	hresult, err := history.GetHistoryItems(ctx, opts)
	if err != nil {
		return nil, err
	}
	hvdata := &history.HistoryViewData{
		Items:         hresult.Items,
		Offset:        hresult.Offset,
		RawOffset:     hresult.RawOffset,
		NextRawOffset: hresult.NextRawOffset,
		HasMore:       hresult.HasMore,
	}
	lines, cmds, err := history.GetLineCmdsFromHistoryItems(ctx, hvdata.Items)
	if err != nil {
		return nil, err
	}
	hvdata.Lines = lines
	hvdata.Cmds = cmds
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(&MainViewUpdate{MainView: sstore.MainViewHistory, HistoryView: hvdata})
	return update, nil
}

func HistoryPurgeCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("/history:purge requires at least one argument (history id)")
	}
	var historyIds []string
	for _, historyArg := range pk.Args {
		_, err := uuid.Parse(historyArg)
		if err != nil {
			return nil, fmt.Errorf("invalid historyid (must be uuid)")
		}
		historyIds = append(historyIds, historyArg)
	}
	err := history.PurgeHistoryByIds(ctx, historyIds)
	if err != nil {
		return nil, fmt.Errorf("/history:purge error purging items: %v", err)
	}
	return sstore.InfoMsgUpdate("removed history items"), nil
}
