// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package gemini

import (
	"context"
	"fmt"
	"io"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
	"github.com/abhishek944/waveterm/waveshell/pkg/packet"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

const DefaultMaxTokens = 1000
const DefaultModel = "gemini-pro"
const DefaultStreamChanSize = 10

func ConvertPromptMessages(prompt []packet.OpenAIPromptMessageType) []genai.Part {
	var parts []genai.Part
	for _, p := range prompt {
		parts = append(parts, genai.Text(p.Content))
	}
	return parts
}

func convertUsage(resp *genai.GenerateContentResponse) *packet.OpenAIUsageType {
	// Gemini API doesn't provide usage metadata in the same way
	// Return nil for now
	return nil
}

func RunCompletion(ctx context.Context, opts *sstore.GeminiOptsType, prompt []packet.OpenAIPromptMessageType) ([]*packet.OpenAIPacketType, error) {
	if opts == nil {
		return nil, fmt.Errorf("no gemini opts found")
	}
	if opts.Model == "" {
		return nil, fmt.Errorf("no gemini model specified")
	}
	if opts.APIToken == "" {
		return nil, fmt.Errorf("no api token")
	}

	client, err := genai.NewClient(ctx, option.WithAPIKey(opts.APIToken))
	if err != nil {
		return nil, fmt.Errorf("error creating gemini client: %v", err)
	}
	defer client.Close()

	model := client.GenerativeModel(opts.Model)
	if opts.MaxTokens > 0 {
		maxTokens := int32(opts.MaxTokens)
		model.MaxOutputTokens = &maxTokens
	}

	// Convert prompt messages to chat history
	cs := model.StartChat()
	for i, p := range prompt {
		if i == len(prompt)-1 {
			// Last message is the actual prompt
			resp, err := cs.SendMessage(ctx, genai.Text(p.Content))
			if err != nil {
				return nil, fmt.Errorf("error calling gemini API: %v", err)
			}
			return marshalResponse(resp, opts.Model), nil
		} else {
			// Previous messages are history
			role := "user"
			if p.Role == "assistant" || p.Role == "model" {
				role = "model"
			}
			cs.History = append(cs.History, &genai.Content{
				Parts: []genai.Part{genai.Text(p.Content)},
				Role:  role,
			})
		}
	}

	return nil, fmt.Errorf("no prompt provided")
}

func RunCompletionStream(ctx context.Context, opts *sstore.GeminiOptsType, prompt []packet.OpenAIPromptMessageType) (chan *packet.OpenAIPacketType, error) {
	if opts == nil {
		return nil, fmt.Errorf("no gemini opts found")
	}
	if opts.Model == "" {
		return nil, fmt.Errorf("no gemini model specified")
	}
	if opts.APIToken == "" {
		return nil, fmt.Errorf("no api token")
	}

	client, err := genai.NewClient(ctx, option.WithAPIKey(opts.APIToken))
	if err != nil {
		return nil, fmt.Errorf("error creating gemini client: %v", err)
	}

	model := client.GenerativeModel(opts.Model)
	if opts.MaxTokens > 0 {
		maxTokens := int32(opts.MaxTokens)
		model.MaxOutputTokens = &maxTokens
	}

	// Convert prompt messages to chat history
	cs := model.StartChat()
	var lastPrompt string
	for i, p := range prompt {
		if i == len(prompt)-1 {
			// Last message is the actual prompt
			lastPrompt = p.Content
		} else {
			// Previous messages are history
			role := "user"
			if p.Role == "assistant" || p.Role == "model" {
				role = "model"
			}
			cs.History = append(cs.History, &genai.Content{
				Parts: []genai.Part{genai.Text(p.Content)},
				Role:  role,
			})
		}
	}

	if lastPrompt == "" {
		return nil, fmt.Errorf("no prompt provided")
	}

	iter := cs.SendMessageStream(ctx, genai.Text(lastPrompt))

	rtn := make(chan *packet.OpenAIPacketType, DefaultStreamChanSize)
	go func() {
		defer close(rtn)
		defer client.Close()
		
		sentHeader := false
		for {
			resp, err := iter.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				errPk := CreateErrorPacket(fmt.Sprintf("error in streaming: %v", err))
				rtn <- errPk
				break
			}

			if !sentHeader {
				pk := packet.MakeOpenAIPacket()
				pk.Model = opts.Model
				pk.Created = 0 // Gemini doesn't provide creation timestamp
				rtn <- pk
				sentHeader = true
			}

			for _, cand := range resp.Candidates {
				if cand.Content != nil {
					for _, part := range cand.Content.Parts {
						if text, ok := part.(genai.Text); ok {
							pk := packet.MakeOpenAIPacket()
							pk.Index = int(cand.Index)
							pk.Text = string(text)
							if cand.FinishReason != genai.FinishReasonUnspecified {
								pk.FinishReason = string(cand.FinishReason)
							}
							rtn <- pk
						}
					}
				}
			}
		}
	}()

	return rtn, nil
}

func marshalResponse(resp *genai.GenerateContentResponse, model string) []*packet.OpenAIPacketType {
	var rtn []*packet.OpenAIPacketType
	
	headerPk := packet.MakeOpenAIPacket()
	headerPk.Model = model
	headerPk.Created = 0 // Gemini doesn't provide creation timestamp
	headerPk.Usage = convertUsage(resp)
	rtn = append(rtn, headerPk)

	for _, cand := range resp.Candidates {
		if cand.Content != nil {
			text := ""
			for _, part := range cand.Content.Parts {
				if t, ok := part.(genai.Text); ok {
					text += string(t)
				}
			}
			
			choicePk := packet.MakeOpenAIPacket()
			choicePk.Index = int(cand.Index)
			choicePk.Text = text
			if cand.FinishReason != genai.FinishReasonUnspecified {
				choicePk.FinishReason = string(cand.FinishReason)
			}
			rtn = append(rtn, choicePk)
		}
	}
	return rtn
}

func CreateErrorPacket(errStr string) *packet.OpenAIPacketType {
	errPk := packet.MakeOpenAIPacket()
	errPk.FinishReason = "error"
	errPk.Error = errStr
	return errPk
}

func CreateTextPacket(text string) *packet.OpenAIPacketType {
	pk := packet.MakeOpenAIPacket()
	pk.Text = text
	return pk
}