package cmdrunner

import (
	"context"
	"fmt"

	"github.com/abhishek944/waveterm/wavesrv/pkg/bookmarks"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

func BookmarksShowCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	// no resolve ui ids!
	var tagName string // defaults to ''
	if len(pk.Args) > 0 {
		tagName = pk.Args[0]
	}
	bms, err := bookmarks.GetBookmarks(ctx, tagName)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve bookmarks: %v", err)
	}
	// telemetry.GoUpdateActivityWrap(telemetry.ActivityUpdate{BookmarksView: 1}, "bookmarks")
	update := scbus.MakeUpdatePacket()

	update.AddUpdate(&MainViewUpdate{
		MainView:      sstore.MainViewBookmarks,
		BookmarksView: &bookmarks.BookmarksUpdate{Bookmarks: bms},
	})
	return update, nil
}

func BookmarkSetCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("/bookmark:set requires one argument (bookmark id)")
	}
	bookmarkArg := pk.Args[0]
	bookmarkId, err := bookmarks.GetBookmarkIdByArg(ctx, bookmarkArg)
	if err != nil {
		return nil, fmt.Errorf("error trying to resolve bookmark: %v", err)
	}
	if bookmarkId == "" {
		return nil, fmt.Errorf("bookmark not found")
	}
	editMap := make(map[string]interface{})
	if descStr, found := pk.Kwargs["desc"]; found {
		editMap[bookmarks.BookmarkField_Desc] = descStr
	}
	if cmdStr, found := pk.Kwargs["cmdstr"]; found {
		editMap[bookmarks.BookmarkField_CmdStr] = cmdStr
	}
	if len(editMap) == 0 {
		return nil, fmt.Errorf("no fields set, can set %s", formatStrs([]string{"desc", "cmdstr"}, "or", false))
	}
	err = bookmarks.EditBookmark(ctx, bookmarkId, editMap)
	if err != nil {
		return nil, fmt.Errorf("error trying to edit bookmark: %v", err)
	}
	bm, err := bookmarks.GetBookmarkById(ctx, bookmarkId, "")
	if err != nil {
		return nil, fmt.Errorf("error retrieving edited bookmark: %v", err)
	}
	bms := []*bookmarks.BookmarkType{bm}
	update := scbus.MakeUpdatePacket()
	bookmarks.AddBookmarksUpdate(update, bms, nil)
	update.AddUpdate(sstore.InfoMsgUpdate("bookmark edited"))
	return update, nil
}

func BookmarkDeleteCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("/bookmark:delete requires one argument (bookmark id)")
	}
	bookmarkArg := pk.Args[0]
	bookmarkId, err := bookmarks.GetBookmarkIdByArg(ctx, bookmarkArg)
	if err != nil {
		return nil, fmt.Errorf("error trying to resolve bookmark: %v", err)
	}
	if bookmarkId == "" {
		return nil, fmt.Errorf("bookmark not found")
	}
	err = bookmarks.DeleteBookmark(ctx, bookmarkId)
	if err != nil {
		return nil, fmt.Errorf("error deleting bookmark: %v", err)
	}
	update := scbus.MakeUpdatePacket()
	bms := []*bookmarks.BookmarkType{{BookmarkId: bookmarkId, Remove: true}}
	bookmarks.AddBookmarksUpdate(update, bms, nil)
	update.AddUpdate(sstore.InfoMsgUpdate("bookmark deleted"))
	return update, nil
}
