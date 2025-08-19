// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package openai

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/openai/openai-go/v2"
	"github.com/openai/openai-go/v2/option"
	"github.com/openai/openai-go/v2/packages/param"
	"github.com/openai/openai-go/v2/shared"
	"github.com/abhishek944/waveterm/waveshell/pkg/packet"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

const DefaultMaxTokens = 1000
const DefaultModel = "gpt-4.1-mini"
const DefaultStreamChanSize = 10

func convertUsage(usage openai.CompletionUsage) *packet.OpenAIUsageType {
	return &packet.OpenAIUsageType{
		PromptTokens:     int(usage.PromptTokens),
		CompletionTokens: int(usage.CompletionTokens),
		TotalTokens:      int(usage.TotalTokens),
	}
}

func ConvertPromptMessages(prompt []packet.OpenAIPromptMessageType) []openai.ChatCompletionMessageParamUnion {
	var messages []openai.ChatCompletionMessageParamUnion
	for _, p := range prompt {
		switch p.Role {
		case "user":
			messages = append(messages, openai.UserMessage(p.Content))
		case "assistant":
			messages = append(messages, openai.AssistantMessage(p.Content))
		case "system":
			messages = append(messages, openai.SystemMessage(p.Content))
		}
	}
	return messages
}

// Wrapper functions that delegate to the WithFormat versions
func RunCompletion(ctx context.Context, opts *sstore.OpenAIOptsType, prompt []packet.OpenAIPromptMessageType) ([]*packet.OpenAIPacketType, error) {
	return RunCompletionWithFormat(ctx, opts, prompt, nil)
}

func RunCompletionStream(ctx context.Context, opts *sstore.OpenAIOptsType, prompt []packet.OpenAIPromptMessageType) (chan *packet.OpenAIPacketType, error) {
	return RunCompletionStreamWithFormat(ctx, opts, prompt, nil)
}

func RunCompletionWithFormat(ctx context.Context, opts *sstore.OpenAIOptsType, prompt []packet.OpenAIPromptMessageType, responseFormat *openai.ChatCompletionNewParamsResponseFormatUnion) ([]*packet.OpenAIPacketType, error) {
	if opts == nil {
		return nil, fmt.Errorf("no openai opts found")
	}
	if opts.Model == "" {
		return nil, fmt.Errorf("no openai model specified")
	}
	if opts.APIToken == "" {
		return nil, fmt.Errorf("no api token")
	}

	clientOpts := []option.RequestOption{
		option.WithAPIKey(opts.APIToken),
	}
	if opts.BaseURL != "" {
		clientOpts = append(clientOpts, option.WithBaseURL(opts.BaseURL))
	}
	
	client := openai.NewClient(clientOpts...)
	
	params := openai.ChatCompletionNewParams{
		Model:     shared.ChatModel(opts.Model),
		Messages:  ConvertPromptMessages(prompt),
	}
	
	// Only set MaxTokens if it's explicitly set to a positive value
	if opts.MaxTokens > 0 {
		params.MaxTokens = param.NewOpt(int64(opts.MaxTokens))
	}
	
	if opts.MaxChoices > 1 {
		params.N = param.NewOpt(int64(opts.MaxChoices))
	}
	
	// Add response format if provided
	if responseFormat != nil {
		params.ResponseFormat = *responseFormat
	}
	
	completion, err := client.Chat.Completions.New(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("error calling openai API: %v", err)
	}
	
	return marshalResponse(completion), nil
}

func RunCompletionStreamWithFormat(ctx context.Context, opts *sstore.OpenAIOptsType, prompt []packet.OpenAIPromptMessageType, responseFormat *openai.ChatCompletionNewParamsResponseFormatUnion) (chan *packet.OpenAIPacketType, error) {
	if opts == nil {
		return nil, fmt.Errorf("no openai opts found")
	}
	if opts.Model == "" {
		return nil, fmt.Errorf("no openai model specified")
	}
	if opts.APIToken == "" {
		return nil, fmt.Errorf("no api token")
	}

	clientOpts := []option.RequestOption{
		option.WithAPIKey(opts.APIToken),
	}
	if opts.BaseURL != "" {
		clientOpts = append(clientOpts, option.WithBaseURL(opts.BaseURL))
	}
	
	client := openai.NewClient(clientOpts...)
	
	params := openai.ChatCompletionNewParams{
		Model:     shared.ChatModel(opts.Model),
		Messages:  ConvertPromptMessages(prompt),
	}
	
	// Only set MaxTokens if it's explicitly set to a positive value
	if opts.MaxTokens > 0 {
		params.MaxTokens = param.NewOpt(int64(opts.MaxTokens))
	}
	
	if opts.MaxChoices > 1 {
		params.N = param.NewOpt(int64(opts.MaxChoices))
	}
	
	// Add response format if provided
	if responseFormat != nil {
		params.ResponseFormat = *responseFormat
	}
	
	stream := client.Chat.Completions.NewStreaming(ctx, params)
	
	rtn := make(chan *packet.OpenAIPacketType, DefaultStreamChanSize)
	go func() {
		sentHeader := false
		defer close(rtn)
		for stream.Next() {
			chunk := stream.Current()
			
			if chunk.Model != "" && !sentHeader {
				pk := packet.MakeOpenAIPacket()
				pk.Model = chunk.Model
				pk.Created = chunk.Created
				rtn <- pk
				sentHeader = true
			}
			
			for _, choice := range chunk.Choices {
				pk := packet.MakeOpenAIPacket()
				pk.Index = int(choice.Index)
				if choice.Delta.Content != "" {
					pk.Text = choice.Delta.Content
				}
				if choice.FinishReason != "" {
					pk.FinishReason = string(choice.FinishReason)
				}
				rtn <- pk
			}
		}
		
		if err := stream.Err(); err != nil {
			errPk := CreateErrorPacket(fmt.Sprintf("error in streaming: %v", err))
			rtn <- errPk
		}
	}()
	
	return rtn, nil
}

func marshalResponse(resp *openai.ChatCompletion) []*packet.OpenAIPacketType {
	var rtn []*packet.OpenAIPacketType
	headerPk := packet.MakeOpenAIPacket()
	headerPk.Model = resp.Model
	headerPk.Created = resp.Created
	if resp.Usage.TotalTokens > 0 {
		headerPk.Usage = convertUsage(resp.Usage)
	}
	rtn = append(rtn, headerPk)
	
	for _, choice := range resp.Choices {
		choicePk := packet.MakeOpenAIPacket()
		choicePk.Index = int(choice.Index)
		choicePk.Text = choice.Message.Content
		choicePk.FinishReason = string(choice.FinishReason)
		rtn = append(rtn, choicePk)
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

// CreateThreadModeResponseFormat creates the response format for thread mode structured output
func CreateThreadModeResponseFormat() *openai.ChatCompletionNewParamsResponseFormatUnion {
	schema := json.RawMessage(`{
		"type": "object",
		"properties": {
			"explanation": {
				"type": "string",
				"description": "Brief explanation of what the command does and any important considerations"
			},
			"command": {
				"type": "string",
				"description": "The exact command to execute (empty string if no command is needed)"
			}
		},
		"required": ["explanation", "command"],
		"additionalProperties": false
	}`)
	
	return &openai.ChatCompletionNewParamsResponseFormatUnion{
		OfJSONSchema: &shared.ResponseFormatJSONSchemaParam{
			Type: "json_schema",
			JSONSchema: shared.ResponseFormatJSONSchemaJSONSchemaParam{
				Name:        "thread_mode_response",
				Description: param.NewOpt("Response format for thread mode containing explanation and command"),
				Schema:      schema,
				Strict:      param.NewOpt(true),
			},
		},
	}
}