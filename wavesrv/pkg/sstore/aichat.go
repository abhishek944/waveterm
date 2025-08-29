// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package sstore

import (
	"fmt"
	"time"

	"github.com/google/uuid"
)

type AIChatType struct {
	ChatId    string `json:"chatid"`
	CreatedTs int64  `json:"createdts"`
	UpdatedTs int64  `json:"updatedts"`

	// only for updates
	Remove bool `json:"remove,omitempty"`
}

func (AIChatType) GetType() string {
	return "aichat"
}

func (c *AIChatType) ToMap() map[string]interface{} {
	rtn := make(map[string]interface{})
	rtn["chatid"] = c.ChatId
	rtn["createdts"] = c.CreatedTs
	rtn["updatedts"] = c.UpdatedTs
	return rtn
}

func (c *AIChatType) FromMap(m map[string]interface{}) bool {
	quickSetStr(&c.ChatId, m, "chatid")
	quickSetInt64(&c.CreatedTs, m, "createdts")
	quickSetInt64(&c.UpdatedTs, m, "updatedts")
	return true
}

type AIMessageType struct {
	MessageId string `json:"messageid"`
	ChatId    string `json:"chatid"`
	Role      string `json:"role"` // "user" or "ai"
	Content   string `json:"content"`
	CreatedTs int64  `json:"createdts"`
}

func (AIMessageType) GetType() string {
	return "aimessage"
}

func (m *AIMessageType) ToMap() map[string]interface{} {
	rtn := make(map[string]interface{})
	rtn["messageid"] = m.MessageId
	rtn["chatid"] = m.ChatId
	rtn["role"] = m.Role
	rtn["content"] = m.Content
	rtn["createdts"] = m.CreatedTs
	return rtn
}

func (m *AIMessageType) FromMap(mp map[string]interface{}) bool {
	quickSetStr(&m.MessageId, mp, "messageid")
	quickSetStr(&m.ChatId, mp, "chatid")
	quickSetStr(&m.Role, mp, "role")
	quickSetStr(&m.Content, mp, "content")
	quickSetInt64(&m.CreatedTs, mp, "createdts")
	return true
}

type AIChatHistoryType struct {
	ChatId   string           `json:"chatid"`
	Messages []*AIMessageType `json:"messages"`
}

func (AIChatHistoryType) GetType() string {
	return "aichathistory"
}

// Helper functions

func CreateAIChat() (*AIChatType, error) {
	now := time.Now().UnixMilli()
	chat := &AIChatType{
		ChatId:    uuid.New().String(),
		CreatedTs: now,
		UpdatedTs: now,
	}
	return chat, nil
}

func CreateAIMessage(chatId string, role string, content string) (*AIMessageType, error) {
	if role != "user" && role != "ai" {
		return nil, fmt.Errorf("invalid role: %s", role)
	}
	msg := &AIMessageType{
		MessageId: uuid.New().String(),
		ChatId:    chatId,
		Role:      role,
		Content:   content,
		CreatedTs: time.Now().UnixMilli(),
	}
	return msg, nil
}
