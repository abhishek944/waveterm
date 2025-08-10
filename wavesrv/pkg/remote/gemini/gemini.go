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
	if resp.UsageMetadata == nil {
		return nil
	}
	return &packet.OpenAIUsageType{
		PromptTokens:     int(resp.UsageMetadata.PromptTokenCount),
		CompletionTokens: int(resp.UsageMetadata.CandidatesTokenCount),
		TotalTokens:      int(resp.UsageMetadata.TotalTokenCount),
	}
}

// Wrapper functions that delegate to the WithSchema versions
func RunCompletion(ctx context.Context, opts *sstore.GeminiOptsType, prompt []packet.OpenAIPromptMessageType) ([]*packet.OpenAIPacketType, error) {
	return RunCompletionWithSchema(ctx, opts, prompt, nil)
}

func RunCompletionStream(ctx context.Context, opts *sstore.GeminiOptsType, prompt []packet.OpenAIPromptMessageType) (chan *packet.OpenAIPacketType, error) {
	return RunCompletionStreamWithSchema(ctx, opts, prompt, nil)
}

func RunCompletionWithSchema(ctx context.Context, opts *sstore.GeminiOptsType, prompt []packet.OpenAIPromptMessageType, responseSchema *genai.Schema) ([]*packet.OpenAIPacketType, error) {
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
	
	// Configure the model
	if opts.MaxTokens > 0 {
		model.SetMaxOutputTokens(int32(opts.MaxTokens))
	}
	
	// Add response schema if provided
	if responseSchema != nil {
		model.GenerationConfig.ResponseMIMEType = "application/json"
		model.GenerationConfig.ResponseSchema = responseSchema
	}

	// Convert prompt messages to parts
	parts := ConvertPromptMessages(prompt)
	if len(parts) == 0 {
		return nil, fmt.Errorf("no prompt provided")
	}
	
	// Generate content
	resp, err := model.GenerateContent(ctx, parts...)
	if err != nil {
		return nil, fmt.Errorf("error calling gemini API: %v", err)
	}
	
	return marshalResponse(resp, opts.Model), nil
}

func RunCompletionStreamWithSchema(ctx context.Context, opts *sstore.GeminiOptsType, prompt []packet.OpenAIPromptMessageType, responseSchema *genai.Schema) (chan *packet.OpenAIPacketType, error) {
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
	
	// Configure the model
	if opts.MaxTokens > 0 {
		model.SetMaxOutputTokens(int32(opts.MaxTokens))
	}
	
	// Add response schema if provided
	if responseSchema != nil {
		model.GenerationConfig.ResponseMIMEType = "application/json"
		model.GenerationConfig.ResponseSchema = responseSchema
	}

	// Convert prompt messages to parts
	parts := ConvertPromptMessages(prompt)
	if len(parts) == 0 {
		return nil, fmt.Errorf("no prompt provided")
	}

	rtn := make(chan *packet.OpenAIPacketType, DefaultStreamChanSize)
	go func() {
		defer close(rtn)
		defer client.Close()
		
		sentHeader := false
		
		iter := model.GenerateContentStream(ctx, parts...)
		for {
			resp, err := iter.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				errPk := CreateErrorPacket(fmt.Sprintf("error in streaming: %v", err))
				rtn <- errPk
				return
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
				if textPart, ok := part.(genai.Text); ok {
					text += string(textPart)
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
	pk := packet.MakeOpenAIPacket()
	pk.Error = errStr
	pk.FinishReason = "error"
	return pk
}

// CreateThreadModeResponseSchema creates the response schema for thread mode structured output
func CreateThreadModeResponseSchema() *genai.Schema {
	return &genai.Schema{
		Type: genai.TypeObject,
		Properties: map[string]*genai.Schema{
			"explanation": {
				Type:        genai.TypeString,
				Description: "Brief explanation of what the command does and any important considerations",
			},
			"command": {
				Type:        genai.TypeString,
				Description: "The exact command to execute (empty string if no command is needed)",
			},
		},
		Required: []string{"explanation", "command"},
	}
}