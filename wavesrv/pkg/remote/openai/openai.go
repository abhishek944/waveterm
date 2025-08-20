// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package openai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/abhishek944/waveterm/waveshell/pkg/packet"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
	"github.com/openai/openai-go/v2"
	"github.com/openai/openai-go/v2/option"
	"github.com/openai/openai-go/v2/packages/param"
	"github.com/openai/openai-go/v2/shared"
)

const DefaultMaxTokens = 1000
const DefaultModel = "gpt-4.1-mini"
const DefaultStreamChanSize = 10
const MaxRetries = 3

// isRetriableError checks if the error is worth retrying
func isRetriableError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "tls: bad record MAC") ||
		strings.Contains(errStr, "connection reset") ||
		strings.Contains(errStr, "EOF") ||
		strings.Contains(errStr, "timeout") ||
		strings.Contains(errStr, "temporary failure")
}

// retryWithBackoff executes a function with exponential backoff retry logic
func retryWithBackoff(ctx context.Context, maxRetries int, operation func() error) error {
	for attempt := 0; attempt < maxRetries; attempt++ {
		err := operation()
		if err == nil {
			return nil
		}

		// If it's the last attempt or not a retriable error, return the error
		if attempt == maxRetries-1 || !isRetriableError(err) {
			return err
		}

		// Calculate backoff delay: 100ms * 2^attempt (100ms, 200ms, 400ms, ...)
		backoffDelay := time.Duration(100<<uint(attempt)) * time.Millisecond

		// Check if context is cancelled before waiting
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoffDelay):
			// Continue to next attempt
		}
	}
	return fmt.Errorf("max retries exceeded")
}

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

	var completion *openai.ChatCompletion

	// Retry logic for API calls
	err := retryWithBackoff(ctx, MaxRetries, func() error {
		clientOpts := []option.RequestOption{
			option.WithAPIKey(opts.APIToken),
		}
		if opts.BaseURL != "" {
			clientOpts = append(clientOpts, option.WithBaseURL(opts.BaseURL))
		}

		client := openai.NewClient(clientOpts...)

		params := openai.ChatCompletionNewParams{
			Model:    shared.ChatModel(opts.Model),
			Messages: ConvertPromptMessages(prompt),
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

		var apiErr error
		completion, apiErr = client.Chat.Completions.New(ctx, params)
		return apiErr
	})

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

	rtn := make(chan *packet.OpenAIPacketType, DefaultStreamChanSize)

	// Retry logic for stream initialization
	err := retryWithBackoff(ctx, MaxRetries, func() error {
		clientOpts := []option.RequestOption{
			option.WithAPIKey(opts.APIToken),
		}
		if opts.BaseURL != "" {
			clientOpts = append(clientOpts, option.WithBaseURL(opts.BaseURL))
		}

		client := openai.NewClient(clientOpts...)

		params := openai.ChatCompletionNewParams{
			Model:    shared.ChatModel(opts.Model),
			Messages: ConvertPromptMessages(prompt),
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
				// Check if it's a retriable error and we haven't exhausted retries
				if isRetriableError(err) {
					errPk := CreateErrorPacket(fmt.Sprintf("error in streaming (will retry): %v", err))
					rtn <- errPk
				} else {
					errPk := CreateErrorPacket(fmt.Sprintf("error in streaming: %v", err))
					rtn <- errPk
				}
			}
		}()

		return nil // Stream initialization successful
	})

	if err != nil {
		close(rtn)
		return nil, fmt.Errorf("failed to initialize stream after retries: %v", err)
	}

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
