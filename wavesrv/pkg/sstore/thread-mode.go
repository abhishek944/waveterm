// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package sstore

import (
	"context"
	"time"
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

// GetThreadModeLines retrieves all thread mode lines for a screen
// For now, returns empty list - can be implemented later when needed
func GetThreadModeLines(ctx context.Context, screenId string) ([]*ThreadLineType, error) {
	// TODO: Implement actual retrieval from database
	return []*ThreadLineType{}, nil
}

// ThreadLineType represents a thread mode conversation line
type ThreadLineType struct {
	ScreenId          string `json:"screenid"`
	LineId            string `json:"lineid"`
	LineNum           int64  `json:"linenum"`
	UserQuery         string `json:"userquery"`
	AssistantResponse string `json:"assistantresponse"`
	Command           string `json:"command,omitempty"`
}

// UpdateThreadLineUserQuery updates the user query for a thread line
func UpdateThreadLineUserQuery(ctx context.Context, screenId string, lineId string, userQuery string) error {
	// TODO: Implement actual update to database
	return nil
}

// UpdateThreadLineAssistantResponse updates the assistant response for a thread line
func UpdateThreadLineAssistantResponse(ctx context.Context, screenId string, lineId string, response string) error {
	// TODO: Implement actual update to database
	return nil
}

// UpdateThreadLineCommand updates the command for a thread line
func UpdateThreadLineCommand(ctx context.Context, screenId string, lineId string, command string) error {
	// TODO: Implement actual update to database
	return nil
}