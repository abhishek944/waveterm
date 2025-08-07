// Copyright 2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmdrunner

import (
	"github.com/abhishek944/waveterm/wavesrv/pkg/bookmarks"
	"github.com/abhishek944/waveterm/wavesrv/pkg/history"
)

type MainViewUpdate struct {
	MainView      string                     `json:"mainview"`
	HistoryView   *history.HistoryViewData   `json:"historyview,omitempty"`
	BookmarksView *bookmarks.BookmarksUpdate `json:"bookmarksview,omitempty"`
}

func (MainViewUpdate) GetType() string {
	return "mainview"
}
