// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package sstore

import (
	"context"
	"fmt"
	"log"
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
                         tl.cmdlineid, tl.cmd_execution_status, tl.created_ts
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
	CmdExecutionStatus string `json:"cmdexecutionstatus,omitempty"` // waiting, accepted, rejected
	CreatedTs         int64  `json:"createdts"`
}

func (ThreadLineType) UseDBMap() {}

// ThreadsUpdateType is sent to the frontend with the list of threads for a screen
type ThreadsUpdateType struct {
	ScreenId string              `json:"screenid"`
	Items    []map[string]string `json:"items"`
}

func (ThreadsUpdateType) GetType() string { return "threads" }

// ActiveThreadIdUpdateType is sent to the frontend to update the active thread ID
type ActiveThreadIdUpdateType struct {
	ScreenId string `json:"screenid"`
	ThreadId string `json:"threadid"`
}

func (ActiveThreadIdUpdateType) GetType() string { return "activethreadid" }

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

// UpdateThreadLineCmdExecutionStatus updates the cmd_execution_status for a thread line
func UpdateThreadLineCmdExecutionStatus(ctx context.Context, threadId string, screenId string, lineId string, status string) error {
	return WithTx(ctx, func(tx *TxWrap) error {
		query := `UPDATE thread_line SET cmd_execution_status = ? WHERE threadid = ? AND screenid = ? AND lineid = ?`
		tx.Exec(query, status, threadId, screenId, lineId)
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
		
		// Get all thread IDs for this line (in case it belongs to multiple threads)
		query = `SELECT DISTINCT threadid FROM thread_line WHERE lineid = ?`
		threadIds := tx.SelectStrings(query, line.LineId)
		
		// Update line state with all thread IDs
		if line.LineState == nil {
			line.LineState = make(map[string]interface{})
		}
		line.LineState["threadids"] = threadIds
		
		log.Printf("[AddThreadLine] Setting threadids for line %s: %v, full linestate: %+v", line.LineId, threadIds, line.LineState)
		
		// Update the line in database
		err := UpdateLineState(tx.Context(), screenId, line.LineId, line.LineState)
		if err != nil {
			return fmt.Errorf("failed to update line state: %v", err)
		}
		
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

// GetThreadLineByLineId fetches thread line data by line ID
func GetThreadLineByLineId(ctx context.Context, lineId string) (*ThreadLineType, error) {
	return WithTxRtn(ctx, func(tx *TxWrap) (*ThreadLineType, error) {
		query := `SELECT tl.screenid, tl.lineid, tl.linenum, tl.userquery, tl.assistantresponse, tl.command,
                         tl.cmdlineid, tl.cmd_execution_status, tl.created_ts
                  FROM thread_line tl WHERE tl.lineid = ?`
		threadLine := dbutil.GetMappable[*ThreadLineType](tx, query, lineId)
		return threadLine, nil
	})
}

// AddExistingLineToThread adds an existing line to a thread and updates its linestate
func AddExistingLineToThread(ctx context.Context, threadId string, screenId string, lineId string) error {
	return WithTx(ctx, func(tx *TxWrap) error {
		// First, get the line to ensure it exists
		line, err := GetLineById(tx.Context(), screenId, lineId)
		if err != nil || line == nil {
			return fmt.Errorf("line not found: %v", err)
		}
		
		// Check if this line is already in the thread
		query := `SELECT COUNT(*) FROM thread_line WHERE threadid = ? AND lineid = ?`
		var count int
		tx.Get(&count, query, threadId, lineId)
		if count > 0 {
			// Line is already in thread, just return success
			log.Printf("[AddExistingLineToThread] Line %s already in thread %s, skipping", lineId, threadId)
			return nil
		}
		
		// Add to thread_line table
		// For command lines, we need to set cmdlineid to the same as lineid
		var cmdLineId *string
		if line.LineType == LineTypeCmd {
			cmdLineId = &lineId
		}
		
		query = `INSERT INTO thread_line (threadid, screenid, lineid, linenum, cmdlineid, created_ts) VALUES (?, ?, ?, ?, ?, ?)`
		tx.Exec(query, threadId, screenId, lineId, line.LineNum, cmdLineId, time.Now().UnixMilli())
		
		// Update thread's updatedts
		tx.Exec(`UPDATE thread SET updatedts = ? WHERE threadid = ?`, time.Now().UnixMilli(), threadId)
		
		// Get all thread IDs for this line
		query = `SELECT DISTINCT threadid FROM thread_line WHERE lineid = ?`
		threadIds := tx.SelectStrings(query, lineId)
		
		// Update line state with all thread IDs
		if line.LineState == nil {
			line.LineState = make(map[string]interface{})
		}
		line.LineState["threadids"] = threadIds
		
		// Update the line in database
		err = UpdateLineState(tx.Context(), screenId, lineId, line.LineState)
		if err != nil {
			return fmt.Errorf("failed to update line state: %v", err)
		}
		
		return nil
	})
}

func RemoveLineFromThread(ctx context.Context, threadId string, screenId string, lineId string) error {
	return WithTx(ctx, func(tx *TxWrap) error {
		// First, get the line to ensure it exists
		line, err := GetLineById(tx.Context(), screenId, lineId)
		if err != nil || line == nil {
			return fmt.Errorf("line not found: %v", err)
		}
		
		// Don't allow removing thread mode lines
		if line.LineType == LineTypeThreadMode {
			return fmt.Errorf("cannot remove thread mode lines from threads")
		}
		
		// Remove from thread_line table
		query := `DELETE FROM thread_line WHERE threadid = ? AND lineid = ?`
		tx.Exec(query, threadId, lineId)
		
		// Update thread's updatedts
		tx.Exec(`UPDATE thread SET updatedts = ? WHERE threadid = ?`, time.Now().UnixMilli(), threadId)
		
		// Get all remaining thread IDs for this line
		query = `SELECT DISTINCT threadid FROM thread_line WHERE lineid = ?`
		threadIds := tx.SelectStrings(query, lineId)
		
		// Update line state with remaining thread IDs
		if line.LineState == nil {
			line.LineState = make(map[string]interface{})
		}
		
		if len(threadIds) > 0 {
			line.LineState["threadids"] = threadIds
		} else {
			// Remove threadids from linestate if line is not in any threads
			delete(line.LineState, "threadids")
		}
		
		// Update the line in database
		err = UpdateLineState(tx.Context(), screenId, lineId, line.LineState)
		if err != nil {
			return fmt.Errorf("failed to update line state: %v", err)
		}
		
		log.Printf("[RemoveLineFromThread] Removed line %s from thread %s, remaining threads: %v", lineId, threadId, threadIds)
		
		return nil
	})
}
