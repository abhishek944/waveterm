// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmdrunner

import (
	"context"
	"fmt"
	"log"
	"runtime"
	"strings"
	"time"

	"github.com/abhishek944/waveterm/waveshell/pkg/base"
	"github.com/abhishek944/waveterm/waveshell/pkg/packet"
	"github.com/abhishek944/waveterm/wavesrv/pkg/prompts"
	"github.com/abhishek944/waveterm/wavesrv/pkg/remote/azureopenai"
	"github.com/abhishek944/waveterm/wavesrv/pkg/remote/gemini"
	"github.com/abhishek944/waveterm/wavesrv/pkg/remote/openai"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

// AI Provider constants
const (
	AIProviderOpenAI = "openai"
	AIProviderGemini = "gemini"
	AIProviderAzure  = "azure"
)

// AI mode constants
const (
	AIModeAgent  = "agent"
	AIModeThread = "thread"
)

// AIRequest represents a generic AI request
type AIRequest struct {
	Mode      string                            // agent or thread
	Prompt    []packet.OpenAIPromptMessageType
	Streaming bool
	Provider  string // openai, gemini, azure
	Context   context.Context
}

// AIResponse represents a generic AI response
type AIResponse struct {
	Packets []*packet.OpenAIPacketType
	Stream  chan *packet.OpenAIPacketType
	Error   error
}

// GetAIProvider returns the configured AI provider from client data
func GetAIProvider(clientData *sstore.ClientData) (string, error) {
	if clientData.AIOpts != nil && clientData.AIOpts.Default != "" {
		return clientData.AIOpts.Default, nil
	}
	return "", fmt.Errorf("no AI provider configured")
}

// GetAIOptions returns the AI options for the specified provider
func GetAIOptions(clientData *sstore.ClientData, provider string) (interface{}, error) {
	switch provider {
	case AIProviderOpenAI:
		if clientData.AIOpts != nil && clientData.AIOpts.OpenAI != nil {
			return clientData.AIOpts.OpenAI, nil
		}
		return nil, fmt.Errorf("OpenAI options not configured")
	case AIProviderGemini:
		if clientData.AIOpts != nil && clientData.AIOpts.Gemini != nil {
			return clientData.AIOpts.Gemini, nil
		}
		return nil, fmt.Errorf("Gemini options not configured")
	case AIProviderAzure:
		if clientData.AIOpts != nil && clientData.AIOpts.Azure != nil {
			return clientData.AIOpts.Azure, nil
		}
		return nil, fmt.Errorf("Azure OpenAI options not configured")
	default:
		return nil, fmt.Errorf("unsupported AI provider: %s", provider)
	}
}

// RunAICompletion is the main entry point for AI completions
func RunAICompletion(ctx context.Context, clientData *sstore.ClientData, request *AIRequest) (*AIResponse, error) {
	provider := request.Provider
	if provider == "" {
		var err error
		provider, err = GetAIProvider(clientData)
		if err != nil {
			return nil, err
		}
	}

	opts, err := GetAIOptions(clientData, provider)
	if err != nil {
		return nil, err
	}

	switch provider {
	case AIProviderOpenAI:
		return runOpenAICompletion(ctx, opts.(*sstore.OpenAIOptsType), request)
	case AIProviderGemini:
		return runGeminiCompletion(ctx, opts.(*sstore.GeminiOptsType), request)
	case AIProviderAzure:
		return runAzureOpenAICompletion(ctx, opts.(*sstore.AzureOpenAIOptsType), request)
	default:
		return nil, fmt.Errorf("unsupported AI provider: %s", provider)
	}
}

// runOpenAICompletion handles OpenAI completions
func runOpenAICompletion(ctx context.Context, opts *sstore.OpenAIOptsType, request *AIRequest) (*AIResponse, error) {
	if opts.Model == "" {
		opts.Model = openai.DefaultModel
	}
	if opts.MaxTokens == 0 {
		opts.MaxTokens = openai.DefaultMaxTokens
	}

	if request.Streaming {
		ch, err := openai.RunCompletionStream(ctx, opts, request.Prompt)
		if err != nil {
			return nil, err
		}
		return &AIResponse{Stream: ch}, nil
	} else {
		packets, err := openai.RunCompletion(ctx, opts, request.Prompt)
		if err != nil {
			return nil, err
		}
		return &AIResponse{Packets: packets}, nil
	}
}

// runGeminiCompletion handles Gemini completions
func runGeminiCompletion(ctx context.Context, opts *sstore.GeminiOptsType, request *AIRequest) (*AIResponse, error) {
	if opts.Model == "" {
		opts.Model = gemini.DefaultModel
	}
	if opts.MaxTokens == 0 {
		opts.MaxTokens = gemini.DefaultMaxTokens
	}

	if request.Streaming {
		ch, err := gemini.RunCompletionStream(ctx, opts, request.Prompt)
		if err != nil {
			return nil, err
		}
		return &AIResponse{Stream: ch}, nil
	} else {
		packets, err := gemini.RunCompletion(ctx, opts, request.Prompt)
		if err != nil {
			return nil, err
		}
		return &AIResponse{Packets: packets}, nil
	}
}

// runAzureOpenAICompletion handles Azure OpenAI completions
func runAzureOpenAICompletion(ctx context.Context, opts *sstore.AzureOpenAIOptsType, request *AIRequest) (*AIResponse, error) {
	if request.Streaming {
		ch, err := azureopenai.RunCompletionStream(ctx, opts, request.Prompt)
		if err != nil {
			return nil, err
		}
		return &AIResponse{Stream: ch}, nil
	} else {
		packets, err := azureopenai.RunCompletion(ctx, opts, request.Prompt)
		if err != nil {
			return nil, err
		}
		return &AIResponse{Packets: packets}, nil
	}
}

// Agent Mode Implementation

// RunAgentMode handles agent mode AI requests
func RunAgentMode(ctx context.Context, pk *scpacket.FeCommandPacketType, clientData *sstore.ClientData, prompt string, provider string) (*AIResponse, error) {
	agentPrompt := []packet.OpenAIPromptMessageType{
		{
			Role:    "system",
			Content: prompts.AgentSystemPrompt,
		},
		{
			Role:    "user",
			Content: prompt,
		},
	}

	request := &AIRequest{
		Mode:      AIModeAgent,
		Prompt:    agentPrompt,
		Streaming: true,
		Context:   ctx,
		Provider:  provider, // Use the provider from UI
	}

	return RunAICompletion(ctx, clientData, request)
}

// Thread Mode Implementation

// RunThreadMode handles thread mode AI requests
func RunThreadMode(ctx context.Context, pk *scpacket.FeCommandPacketType, clientData *sstore.ClientData, conversation []packet.OpenAIPromptMessageType) (*AIResponse, error) {
	request := &AIRequest{
		Mode:      AIModeThread,
		Prompt:    conversation,
		Streaming: true,
		Context:   ctx,
	}

	return RunAICompletion(ctx, clientData, request)
}

// Helper functions moved from cmdrunner.go

// DoOpenAICompletion performs OpenAI completion and writes to PTY
func DoOpenAICompletion(cmd *sstore.CmdType, opts *sstore.OpenAIOptsType, prompt []packet.OpenAIPromptMessageType) {
	var outputPos int64
	var hadError bool
	startTime := time.Now()
	ctx, cancelFn := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancelFn()
	defer func() {
		r := recover()
		if r != nil {
			panicMsg := fmt.Sprintf("panic: %v", r)
			log.Printf("panic in doOpenAICompletion: %s\n", panicMsg)
			writeErrorToPty(cmd, panicMsg, outputPos)
			hadError = true
		}
		duration := time.Since(startTime)
		cmdStatus := sstore.CmdStatusDone
		var exitCode int
		if hadError {
			cmdStatus = sstore.CmdStatusError
			exitCode = 1
		}
		ck := base.MakeCommandKey(cmd.ScreenId, cmd.LineId)
		doneInfo := sstore.CmdDoneDataValues{
			Ts:         time.Now().UnixMilli(),
			ExitCode:   exitCode,
			DurationMs: duration.Milliseconds(),
		}
		update := scbus.MakeUpdatePacket()
		err := sstore.UpdateCmdDoneInfo(context.Background(), update, ck, doneInfo, cmdStatus)
		if err != nil {
			// nothing to do
			log.Printf("error updating cmddoneinfo (in openai): %v\n", err)
			return
		}
		scbus.MainUpdateBus.DoScreenUpdate(cmd.ScreenId, update)
	}()
	var respPks []*packet.OpenAIPacketType
	var err error
	// run open ai completion
	respPks, err = openai.RunCompletion(ctx, opts, prompt)
	if err != nil {
		writeErrorToPty(cmd, fmt.Sprintf("error calling OpenAI API: %v", err), outputPos)
		return
	}
	for _, pk := range respPks {
		err = writePacketToPty(ctx, cmd, pk, &outputPos)
		if err != nil {
			writeErrorToPty(cmd, fmt.Sprintf("error writing response to ptybuffer: %v", err), outputPos)
			return
		}
	}
	return
}

// DoOpenAICmdInfoCompletion performs OpenAI completion for cmd info
func DoOpenAICmdInfoCompletion(cmd *sstore.CmdType, clientId string, opts *sstore.OpenAIOptsType, prompt []packet.OpenAIPromptMessageType, curLineStr string) {
	ctx, cancelFn := context.WithTimeout(context.Background(), OpenAIStreamTimeout)
	defer cancelFn()
	defer func() {
		r := recover()
		if r != nil {
			panicMsg := fmt.Sprintf("panic: %v", r)
			log.Printf("panic in doOpenAICompletion: %s\n", panicMsg)
		}
	}()
	var ch chan *packet.OpenAIPacketType
	var err error
	ch, err = openai.RunCompletionStream(ctx, opts, prompt)
	asstOutputPk := &packet.OpenAICmdInfoPacketOutputType{
		Model:        "",
		Created:      0,
		FinishReason: "",
		Message:      "",
	}
	asstOutputMessageID := sstore.ScreenMemGetCmdInfoMessageCount(cmd.ScreenId)
	asstMessagePk := &packet.OpenAICmdInfoChatMessage{IsAssistantResponse: true, AssistantResponse: asstOutputPk, MessageID: asstOutputMessageID}
	if err != nil {
		asstOutputPk.Error = fmt.Sprintf("Error calling OpenAI API: %v", err)
		WritePacketToUpdateBus(ctx, cmd, asstMessagePk)
		return
	}
	WritePacketToUpdateBus(ctx, cmd, asstMessagePk)
	packetTimeout := OpenAIPacketTimeout
	if opts.Timeout > 0 {
		packetTimeout = time.Duration(opts.Timeout) * time.Millisecond
	}
	doneWaitingForPackets := false
	for !doneWaitingForPackets {
		select {
		case <-time.After(packetTimeout):
			// timeout reading from channel
			doneWaitingForPackets = true
			asstOutputPk.Error = "timeout waiting for server response"
			UpdateAsstResponseAndWriteToUpdateBus(ctx, cmd, asstMessagePk, asstOutputMessageID)
		case pk, ok := <-ch:
			if ok {
				// got a packet
				if pk.Error != "" {
					asstOutputPk.Error = pk.Error
				}
				if pk.Model != "" && pk.Index == 0 {
					asstOutputPk.Model = pk.Model
					asstOutputPk.Created = pk.Created
					asstOutputPk.FinishReason = pk.FinishReason
					if pk.Text != "" {
						asstOutputPk.Message += pk.Text
					}
				}
				if pk.Index == 0 {
					if pk.FinishReason != "" {
						asstOutputPk.FinishReason = pk.FinishReason
					}
					if pk.Text != "" {
						asstOutputPk.Message += pk.Text
					}
				}
				asstMessagePk.AssistantResponse = asstOutputPk
				UpdateAsstResponseAndWriteToUpdateBus(ctx, cmd, asstMessagePk, asstOutputMessageID)
			} else {
				// channel closed
				doneWaitingForPackets = true
			}
		}
	}
}

// DoOpenAIStreamCompletion performs streaming OpenAI completion
func DoOpenAIStreamCompletion(cmd *sstore.CmdType, clientId string, opts *sstore.OpenAIOptsType, prompt []packet.OpenAIPromptMessageType) {
	var outputPos int64
	var hadError bool
	startTime := time.Now()
	ctx, cancelFn := context.WithTimeout(context.Background(), OpenAIStreamTimeout)
	defer cancelFn()
	defer func() {
		r := recover()
		if r != nil {
			panicMsg := fmt.Sprintf("panic: %v", r)
			log.Printf("panic in doOpenAICompletion: %s\n", panicMsg)
			writeErrorToPty(cmd, panicMsg, outputPos)
			hadError = true
		}
		duration := time.Since(startTime)
		cmdStatus := sstore.CmdStatusDone
		var exitCode int
		if hadError {
			cmdStatus = sstore.CmdStatusError
			exitCode = 1
		}
		ck := base.MakeCommandKey(cmd.ScreenId, cmd.LineId)
		doneInfo := sstore.CmdDoneDataValues{
			Ts:         time.Now().UnixMilli(),
			ExitCode:   exitCode,
			DurationMs: duration.Milliseconds(),
		}
		update := scbus.MakeUpdatePacket()
		err := sstore.UpdateCmdDoneInfo(context.Background(), update, ck, doneInfo, cmdStatus)
		if err != nil {
			// nothing to do
			log.Printf("error updating cmddoneinfo (in openai): %v\n", err)
			return
		}
		scbus.MainUpdateBus.DoScreenUpdate(cmd.ScreenId, update)
	}()
	var ch chan *packet.OpenAIPacketType
	var err error
	ch, err = openai.RunCompletionStream(ctx, opts, prompt)
	if err != nil {
		writeErrorToPty(cmd, fmt.Sprintf("error calling OpenAI API: %v", err), outputPos)
		return
	}
	packetTimeout := OpenAIPacketTimeout
	if opts.Timeout > 0 {
		packetTimeout = time.Duration(opts.Timeout) * time.Millisecond
	}
	doneWaitingForPackets := false
	for !doneWaitingForPackets {
		select {
		case <-time.After(packetTimeout):
			// timeout reading from channel
			hadError = true
			pk := openai.CreateErrorPacket(fmt.Sprintf("timeout waiting for server response"))
			err = writePacketToPty(ctx, cmd, pk, &outputPos)
			if err != nil {
				log.Printf("error writing response to ptybuffer: %v", err)
				return
			}
			doneWaitingForPackets = true
		case pk, ok := <-ch:
			if ok {
				// got a packet
				if pk.Error != "" {
					hadError = true
				}
				err = writePacketToPty(ctx, cmd, pk, &outputPos)
				if err != nil {
					hadError = true
					log.Printf("error writing response to ptybuffer: %v", err)
					return
				}
			} else {
				// channel closed
				doneWaitingForPackets = true
			}
		}
	}
	return
}

// BuildOpenAIPromptArrayWithContext builds OpenAI prompt array from cmd info chat messages
func BuildOpenAIPromptArrayWithContext(messages []*packet.OpenAICmdInfoChatMessage) []packet.OpenAIPromptMessageType {
	rtn := make([]packet.OpenAIPromptMessageType, 0)
	for _, msg := range messages {
		content := msg.UserEngineeredQuery
		if msg.UserEngineeredQuery == "" {
			content = msg.UserQuery
		}
		msgRole := sstore.OpenAIRoleUser
		if msg.IsAssistantResponse {
			msgRole = sstore.OpenAIRoleAssistant
			content = msg.AssistantResponse.Message
		}
		rtn = append(rtn, packet.OpenAIPromptMessageType{Role: msgRole, Content: content})
	}
	return rtn
}

// WritePacketToUpdateBus writes OpenAI cmd info packet to update bus
func WritePacketToUpdateBus(ctx context.Context, cmd *sstore.CmdType, pk *packet.OpenAICmdInfoChatMessage) {
	update := sstore.UpdateWithAddNewOpenAICmdInfoPacket(ctx, cmd.ScreenId, pk)
	scbus.MainUpdateBus.DoScreenUpdate(cmd.ScreenId, update)
}

// UpdateAsstResponseAndWriteToUpdateBus updates assistant response and writes to update bus
func UpdateAsstResponseAndWriteToUpdateBus(ctx context.Context, cmd *sstore.CmdType, pk *packet.OpenAICmdInfoChatMessage, messageID int) {
	update, err := sstore.UpdateWithUpdateOpenAICmdInfoPacket(ctx, cmd.ScreenId, messageID, pk)
	if err != nil {
		log.Printf("Open AI Update packet err: %v\n", err)
	}
	scbus.MainUpdateBus.DoScreenUpdate(cmd.ScreenId, update)
}

// GetCmdInfoEngineeredPrompt creates engineered prompt for cmd info
func GetCmdInfoEngineeredPrompt(userQuery string, curLineStr string, shellType string, osType string) string {
	promptBase := "You are an AI assistant with deep expertise in command line interfaces, CLI programs, and shell scripting. Your task is to help the user to fix an existing command that will be provided, or if no command is provided, help write a new command that the user requires. Feel free to provide appropriate context, but try to keep your answers short and to the point as the user is asking for help because they are trying to get a task done immediately."
	promptBase = promptBase + " The user is current using the \"" + shellType + "\" shell on " + osType + "."
	promptCurrentCommand := ""
	if strings.TrimSpace(curLineStr) != "" {
		// Enclose the command in triple backticks to format it as a code block.
		promptCurrentCommand = " The user is currently working with the command: ```\n" + curLineStr + "\n```\n\n"
	}
	promptFormattingInstruction := "Please ensure any command line suggestions or code snippets or scripts that are meant to be run by the user are enclosed in triple backquotes for easy copy and paste into the terminal.  Also note that any response you give will be rendered in markdown."
	promptQuestion := " The user's question is:\n\n" + userQuery + ""

	return promptBase + promptCurrentCommand + promptFormattingInstruction + promptQuestion
}

// GetOsTypeFromRuntime returns OS type from runtime
func GetOsTypeFromRuntime() string {
	osVal := runtime.GOOS
	if osVal == "darwin" {
		osVal = "macos"
	}
	return osVal
}