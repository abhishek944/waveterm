// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package azureopenai

import (
	"context"
	"fmt"
	"strings"

	"github.com/openai/openai-go/v2"
	"github.com/openai/openai-go/v2/azure"
	"github.com/openai/openai-go/v2/option"
	"github.com/openai/openai-go/v2/packages/param"
	"github.com/openai/openai-go/v2/shared"
	"github.com/abhishek944/waveterm/waveshell/pkg/packet"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

const DefaultMaxTokens = 1000
const DefaultModel = "gpt-35-turbo" // Azure uses different model names
const DefaultAPIVersion = "2024-06-01"
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

func RunCompletion(ctx context.Context, opts *sstore.AzureOpenAIOptsType, prompt []packet.OpenAIPromptMessageType) ([]*packet.OpenAIPacketType, error) {
	if opts == nil {
		return nil, fmt.Errorf("no azure openai opts found")
	}
	if opts.BaseURL == "" {
		return nil, fmt.Errorf("no azure openai endpoint specified")
	}
	if opts.APIToken == "" {
		return nil, fmt.Errorf("no api token")
	}
	if opts.DeploymentName == "" {
		return nil, fmt.Errorf("no deployment name specified")
	}

	// Extract API version from BaseURL if present (format: https://xxx.openai.azure.com?api-version=2024-06-01)
	baseURL := opts.BaseURL
	apiVersion := DefaultAPIVersion
	
	if idx := strings.Index(baseURL, "?api-version="); idx != -1 {
		apiVersion = baseURL[idx+13:]
		baseURL = baseURL[:idx]
	}
	
	// Ensure the BaseURL doesn't have trailing slash for Azure SDK
	baseURL = strings.TrimSuffix(baseURL, "/")

	clientOpts := []option.RequestOption{
		azure.WithEndpoint(baseURL, apiVersion),
		azure.WithAPIKey(opts.APIToken),
	}
	
	client := openai.NewClient(clientOpts...)
	
	params := openai.ChatCompletionNewParams{
		Model:     shared.ChatModel(opts.DeploymentName), // Use deployment name as model
		Messages:  ConvertPromptMessages(prompt),
		MaxTokens: param.NewOpt(int64(DefaultMaxTokens)),
	}
	
	completion, err := client.Chat.Completions.New(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("error calling azure openai API: %v", err)
	}
	
	return marshalResponse(completion), nil
}

func RunCompletionStream(ctx context.Context, opts *sstore.AzureOpenAIOptsType, prompt []packet.OpenAIPromptMessageType) (chan *packet.OpenAIPacketType, error) {
	if opts == nil {
		return nil, fmt.Errorf("no azure openai opts found")
	}
	if opts.BaseURL == "" {
		return nil, fmt.Errorf("no azure openai endpoint specified")
	}
	if opts.APIToken == "" {
		return nil, fmt.Errorf("no api token")
	}
	if opts.DeploymentName == "" {
		return nil, fmt.Errorf("no deployment name specified")
	}

	// Extract API version from BaseURL if present
	baseURL := opts.BaseURL
	apiVersion := DefaultAPIVersion
	
	if idx := strings.Index(baseURL, "?api-version="); idx != -1 {
		apiVersion = baseURL[idx+13:]
		baseURL = baseURL[:idx]
	}
	
	// Ensure the BaseURL doesn't have trailing slash for Azure SDK
	baseURL = strings.TrimSuffix(baseURL, "/")

	clientOpts := []option.RequestOption{
		azure.WithEndpoint(baseURL, apiVersion),
		azure.WithAPIKey(opts.APIToken),
	}
	
	client := openai.NewClient(clientOpts...)
	
	params := openai.ChatCompletionNewParams{
		Model:     shared.ChatModel(opts.DeploymentName), // Use deployment name as model
		Messages:  ConvertPromptMessages(prompt),
		MaxTokens: param.NewOpt(int64(DefaultMaxTokens)),
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