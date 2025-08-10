package cmdrunner

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

func SidebarOpenCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Screen)
	if err != nil {
		return nil, err
	}
	screen, err := sidebarSetOpen(ctx, GetCmdStr(pk), ids.ScreenId, true, pk.Kwargs["width"])
	if err != nil {
		return nil, err
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(*screen)
	return update, nil
}

func sidebarSetOpen(ctx context.Context, cmdStr string, screenId string, open bool, width string) (*sstore.ScreenType, error) {
	if width != "" && !sidebarWidthRe.MatchString(width) {
		return nil, fmt.Errorf("/%s invalid width specified, must be either a px value or a percent (e.g. '300px' or '50%%')", cmdStr)
	}
	if strings.HasSuffix(width, "%") {
		percentNum, _ := strconv.Atoi(width[:len(width)-1])
		if percentNum < 10 || percentNum > 90 {
			return nil, fmt.Errorf("/%s invalid width specified, percentage must be between 10%% and 90%%", cmdStr)
		}
	}
	if strings.HasSuffix(width, "px") {
		pxNum, _ := strconv.Atoi(width[:len(width)-2])
		if pxNum < 200 {
			return nil, fmt.Errorf("/%s invalid width specified, minimum sizebar width is 200px", cmdStr)
		}
	}
	screen, err := sstore.GetScreenById(ctx, screenId)
	if err != nil {
		return nil, fmt.Errorf("/%s cannot get screen: %v", cmdStr, err)
	}
	if screen.ScreenViewOpts.Sidebar == nil {
		screen.ScreenViewOpts.Sidebar = &sstore.ScreenSidebarOptsType{}
	}
	screen.ScreenViewOpts.Sidebar.Open = open
	if width != "" {
		screen.ScreenViewOpts.Sidebar.Width = width
	}
	err = sstore.ScreenUpdateViewOpts(ctx, screenId, screen.ScreenViewOpts)
	if err != nil {
		return nil, fmt.Errorf("/%s error updating screenviewopts: %v", cmdStr, err)
	}
	return screen, nil
}

func SidebarCloseCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Screen)
	if err != nil {
		return nil, err
	}
	screen, err := sidebarSetOpen(ctx, GetCmdStr(pk), ids.ScreenId, false, "")
	if err != nil {
		return nil, err
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(*screen)
	return update, nil
}

func SidebarAddCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Screen)
	if err != nil {
		return nil, err
	}
	var addLineId string
	if lineArg, ok := pk.Kwargs["line"]; ok {
		lineId, err := sstore.FindLineIdByArg(ctx, ids.ScreenId, lineArg)
		if err != nil {
			return nil, fmt.Errorf("error looking up lineid: %v", err)
		}
		addLineId = lineId
	}
	if addLineId == "" {
		return nil, fmt.Errorf("/%s must specify line=[lineid] to add to the sidebar", GetCmdStr(pk))
	}
	screen, err := sidebarSetOpen(ctx, GetCmdStr(pk), ids.ScreenId, true, pk.Kwargs["width"])
	if err != nil {
		return nil, err
	}
	screen.ScreenViewOpts.Sidebar.SidebarLineId = addLineId
	err = sstore.ScreenUpdateViewOpts(ctx, ids.ScreenId, screen.ScreenViewOpts)
	if err != nil {
		return nil, fmt.Errorf("/%s error updating screenviewopts: %v", GetCmdStr(pk), err)
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(*screen)
	return update, nil
}

func SidebarRemoveCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Screen)
	if err != nil {
		return nil, err
	}
	screen, err := sstore.GetScreenById(ctx, ids.ScreenId)
	if err != nil {
		return nil, fmt.Errorf("/%s cannot get screeen: %v", GetCmdStr(pk), err)
	}
	sidebar := screen.ScreenViewOpts.Sidebar
	if sidebar == nil {
		return nil, nil
	}
	sidebar.SidebarLineId = ""
	sidebar.Open = false
	err = sstore.ScreenUpdateViewOpts(ctx, ids.ScreenId, screen.ScreenViewOpts)
	if err != nil {
		return nil, fmt.Errorf("/%s error updating screenviewopts: %v", GetCmdStr(pk), err)
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(*screen)
	return update, nil
}
