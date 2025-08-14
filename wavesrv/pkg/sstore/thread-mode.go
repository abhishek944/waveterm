// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package sstore

import (
	"context"
	"fmt"
	"time"

	"github.com/abhishek944/waveterm/wavesrv/pkg/dbutil"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbase"
)

// ThreadModeToggleType is used to toggle thread mode on/off
type ThreadModeToggleType struct {
	Enabled bool `json:"enabled"`
}

func (ThreadModeToggleType) GetType() string {
	return "threadmodetoggle"
}

// AddThreadModeLine creates a new thread mode line
func AddThreadModeLine(ctx context.Context, screenId string, userId string, cmd *CmdType) (*LineType, error) {
	rtnLine := makeNewLineThreadMode(screenId, userId, cmd.LineId)
	err := InsertLine(ctx, rtnLine, cmd)
	if err != nil {
		return nil, err
	}
	return rtnLine, nil
}


// makeNewLineThreadMode creates a new thread mode line
func makeNewLineThreadMode(screenId string, userId string, lineId string) *LineType {
	rtn := &LineType{}
	rtn.ScreenId = screenId
	rtn.UserId = userId
	rtn.LineId = lineId
	rtn.Ts = time.Now().UnixMilli()
	rtn.LineLocal = true
	rtn.LineType = LineTypeThreadMode
	rtn.ContentHeight = LineNoHeight
	rtn.Renderer = CmdRendererThreadMode
	rtn.LineState = make(map[string]any)
	return rtn
}

// GetThreadLinesByThread retrieves all thread lines for a given thread
func GetThreadLinesByThread(ctx context.Context, threadId string) ([]*ThreadLineType, error) {
	return WithTxRtn(ctx, func(tx *TxWrap) ([]*ThreadLineType, error) {
		query := `SELECT tl.screenid, tl.lineid, tl.linenum, tl.userquery, tl.assistantresponse, tl.command,
                         tl.cmdlineid, tl.created_ts
                  FROM thread_line tl WHERE tl.threadid = ? ORDER BY tl.linenum`
		rtn := dbutil.SelectMappable[*ThreadLineType](tx, query, threadId)
		return rtn, nil
	})
}

// ThreadLineType represents a thread mode conversation line
type ThreadLineType struct {
	ScreenId          string `json:"screenid"`
	LineId            string `json:"lineid"`
	LineNum           int64  `json:"linenum"`
	UserQuery         string `json:"userquery"`
	AssistantResponse string `json:"assistantresponse"`
	Command           string `json:"command,omitempty"`
	CmdLineId         string `json:"cmdlineid,omitempty"`
	CreatedTs         int64  `json:"createdts"`
}

func (ThreadLineType) UseDBMap() {}

// ThreadsUpdateType is sent to the frontend with the list of threads for a screen
type ThreadsUpdateType struct {
	ScreenId string              `json:"screenid"`
	Items    []map[string]string `json:"items"`
}

func (ThreadsUpdateType) GetType() string { return "threads" }

// UpdateThreadLineUserQuery updates the user query for a thread line
func UpdateThreadLineUserQuery(ctx context.Context, threadId string, screenId string, lineId string, userQuery string) error {
	return WithTx(ctx, func(tx *TxWrap) error {
		query := `UPDATE thread_line SET userquery = ? WHERE threadid = ? AND screenid = ? AND lineid = ?`
		tx.Exec(query, userQuery, threadId, screenId, lineId)
		return nil
	})
}

// UpdateThreadLineAssistantResponse updates the assistant response for a thread line
func UpdateThreadLineAssistantResponse(ctx context.Context, threadId string, screenId string, lineId string, response string) error {
	return WithTx(ctx, func(tx *TxWrap) error {
		query := `UPDATE thread_line SET assistantresponse = ? WHERE threadid = ? AND screenid = ? AND lineid = ?`
		tx.Exec(query, response, threadId, screenId, lineId)
		return nil
	})
}

// UpdateThreadLineCommand updates the command for a thread line
func UpdateThreadLineCommand(ctx context.Context, threadId string, screenId string, lineId string, command string) error {
	return WithTx(ctx, func(tx *TxWrap) error {
		query := `UPDATE thread_line SET command = ? WHERE threadid = ? AND screenid = ? AND lineid = ?`
		tx.Exec(query, command, threadId, screenId, lineId)
		return nil
	})
}

// UpdateThreadLineCmdLineId updates the cmdlineid for a thread line
func UpdateThreadLineCmdLineId(ctx context.Context, threadId string, screenId string, lineId string, cmdLineId string) error {
	return WithTx(ctx, func(tx *TxWrap) error {
		query := `UPDATE thread_line SET cmdlineid = ? WHERE threadid = ? AND screenid = ? AND lineid = ?`
		tx.Exec(query, cmdLineId, threadId, screenId, lineId)
		return nil
	})
}

// Thread data model
type ThreadType struct {
	ThreadId  string `json:"threadid"`
	SessionId string `json:"sessionid"`
	ScreenId  string `json:"screenid"`
	Name      string `json:"name"`
	CreatedTs int64  `json:"createdts"`
	UpdatedTs int64  `json:"updatedts"`
	Archived  bool   `json:"archived"`
}

func (ThreadType) UseDBMap() {}

// CountThreadsForScreen counts the number of threads (including archived) for a screen
func CountThreadsForScreen(ctx context.Context, screenId string) (int, error) {
	return WithTxRtn(ctx, func(tx *TxWrap) (int, error) {
		query := `SELECT COUNT(*) FROM thread WHERE screenid = ?`
		var count int
		tx.Get(&count, query, screenId)
		return count, nil
	})
}

// CreateThread creates a new thread for a screen
func CreateThread(ctx context.Context, sessionId string, screenId string, name string) (*ThreadType, error) {
	// If name is empty or "Thread", auto-generate a name
	if name == "" || name == "Thread" {
		count, err := CountThreadsForScreen(ctx, screenId)
		if err != nil {
			// If we can't get the count, default to "thread-1"
			name = "thread-1"
		} else {
			// Generate name based on count + 1
			name = fmt.Sprintf("thread-%d", count+1)
		}
	}

	now := time.Now().UnixMilli()
	thread := &ThreadType{
		ThreadId:  scbase.GenWaveUUID(),
		SessionId: sessionId,
		ScreenId:  screenId,
		Name:      name,
		CreatedTs: now,
		UpdatedTs: now,
		Archived:  false,
	}
	err := WithTx(ctx, func(tx *TxWrap) error {
		query := `INSERT INTO thread (threadid, sessionid, screenid, name, createdts, updatedts, archived)
                  VALUES (:threadid, :sessionid, :screenid, :name, :createdts, :updatedts, :archived)`
		tx.NamedExec(query, dbutil.ToDBMap(thread, false))
		return nil
	})
	if err != nil {
		return nil, err
	}
	return thread, nil
}

// ListThreads lists threads for a screen
func ListThreads(ctx context.Context, screenId string) ([]*ThreadType, error) {
	return WithTxRtn(ctx, func(tx *TxWrap) ([]*ThreadType, error) {
		query := `SELECT * FROM thread WHERE screenid = ? AND NOT archived ORDER BY updatedts DESC`
		rtn := dbutil.SelectMappable[*ThreadType](tx, query, screenId)
		return rtn, nil
	})
}

// AddThreadLine associates a line with a thread
func AddThreadLine(ctx context.Context, threadId string, screenId string, line *LineType) error {
	return WithTx(ctx, func(tx *TxWrap) error {
		query := `INSERT INTO thread_line (threadid, screenid, lineid, linenum, created_ts) VALUES (?, ?, ?, ?, ?)`
		tx.Exec(query, threadId, screenId, line.LineId, line.LineNum, time.Now().UnixMilli())
		tx.Exec(`UPDATE thread SET updatedts = ? WHERE threadid = ?`, time.Now().UnixMilli(), threadId)
		return nil
	})
}

// GetThreadById fetches a thread by id
func GetThreadById(ctx context.Context, threadId string) (*ThreadType, error) {
	return WithTxRtn(ctx, func(tx *TxWrap) (*ThreadType, error) {
		query := `SELECT * FROM thread WHERE threadid = ?`
		thread := dbutil.GetMappable[*ThreadType](tx, query, threadId)
		return thread, nil
	})
}
