// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmdrunner

import (
	"context"
	"fmt"
	"runtime/debug"

	"github.com/abhishek944/waveterm/waveshell/pkg/packet"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

func init() {
	registerCmdFn("aichat:list", AIChatListCommand)
	registerCmdFn("aichat:new", AIChatNewCommand)
	registerCmdFn("aichat:get", AIChatGetCommand)
	registerCmdFn("aichat:send", AIChatSendCommand)
	registerCmdFn("aichat:delete", AIChatDeleteCommand)
}

func AIChatListCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	chats, err := sstore.GetAIChats(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get AI chats: %w", err)
	}
	
	update := scbus.MakeUpdatePacket()
	for _, chat := range chats {
		update.AddUpdate(chat)
	}
	return update, nil
}

func AIChatNewCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	chat, err := sstore.CreateAIChat()
	if err != nil {
		return nil, fmt.Errorf("failed to create AI chat: %w", err)
	}
	
	err = sstore.InsertAIChat(ctx, chat)
	if err != nil {
		return nil, fmt.Errorf("failed to insert AI chat: %w", err)
	}
	
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(chat)
	return update, nil
}

func AIChatGetCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	fmt.Printf("AIChatGetCommand called\n")
	update := scbus.MakeUpdatePacket()
	
	chatId := pk.Kwargs["chatid"]
	if chatId == "" {
		// Get latest chat
		chat, err := sstore.GetLatestAIChat(ctx)
		if err != nil {
			fmt.Printf("Error getting latest chat: %v\n", err)
			return update, fmt.Errorf("failed to get latest AI chat: %w", err)
		}
		if chat == nil {
			// Create new chat if none exists
			chat, err = sstore.CreateAIChat()
			if err != nil {
				fmt.Printf("Error creating chat: %v\n", err)
				return update, fmt.Errorf("failed to create AI chat: %w", err)
			}
			err = sstore.InsertAIChat(ctx, chat)
			if err != nil {
				fmt.Printf("Error inserting chat: %v\n", err)
				return update, fmt.Errorf("failed to insert AI chat: %w", err)
			}
		}
		chatId = chat.ChatId
	}
	
	history, err := sstore.GetAIChatHistory(ctx, chatId)
	if err != nil {
		fmt.Printf("Error getting chat history: %v\n", err)
		return update, fmt.Errorf("failed to get AI chat history: %w", err)
	}
	
	if history != nil {
		update.AddUpdate(history)
	}
	return update, nil
}

func AIChatSendCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	fmt.Printf("DEBUG START: Entering AIChatSendCommand\n")
	fmt.Printf("DEBUG: pk=%+v\n", pk)
	fmt.Printf("DEBUG: pk.Kwargs=%+v\n", pk.Kwargs)
	
	// Check if context is already cancelled
	select {
	case <-ctx.Done():
		fmt.Printf("DEBUG: Context already cancelled at start: %v\n", ctx.Err())
	default:
		fmt.Printf("DEBUG: Context is active\n")
	}
	
	// Add panic recovery that returns a proper error
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("PANIC in AIChatSendCommand: %v\n", r)
			// Print stack trace
			debug.PrintStack()
		}
		fmt.Printf("DEBUG END: Exiting AIChatSendCommand\n")
	}()
	
	chatId := pk.Kwargs["chatid"]
	message := pk.Kwargs["message"]
	provider := pk.Kwargs["provider"]
	
	// Add logging
	fmt.Printf("AIChatSendCommand called with chatId=%s, provider=%s, message length=%d\n", chatId, provider, len(message))
	
	fmt.Printf("DEBUG 0.1: Checking parameters\n")
	if chatId == "" {
		fmt.Printf("DEBUG 0.1 ERROR: chatid is empty\n")
		return nil, fmt.Errorf("chatid is required")
	}
	if message == "" {
		fmt.Printf("DEBUG 0.1 ERROR: message is empty\n")
		return nil, fmt.Errorf("message is required")
	}
	fmt.Printf("DEBUG 0.2: Parameters are valid\n")
	
	// Create user message
	fmt.Printf("DEBUG 0.3: Creating user message\n")
	userMsg, err := sstore.CreateAIMessage(chatId, "user", message)
	if err != nil {
		fmt.Printf("Error creating user message: %v\n", err)
		update := scbus.MakeUpdatePacket()
		return update, fmt.Errorf("failed to create user message: %w", err)
	}
	fmt.Printf("DEBUG 0.4: User message created with ID=%s\n", userMsg.MessageId)
	
	fmt.Printf("DEBUG 0.5: About to insert user message\n")
	err = sstore.InsertAIMessage(ctx, userMsg)
	fmt.Printf("DEBUG 0.6: InsertAIMessage returned, err=%v\n", err)
	if err != nil {
		fmt.Printf("Error inserting user message: %v\n", err)
		update := scbus.MakeUpdatePacket()
		return update, fmt.Errorf("failed to insert user message: %w", err)
	}
	fmt.Printf("User message inserted successfully\n")
	
	fmt.Printf("DEBUG 0.7: After insert, continuing with chat history\n")
	
	// Get chat history for context
	fmt.Printf("DEBUG 1: Getting chat history for chatId=%s\n", chatId)
	history, err := sstore.GetAIChatHistory(ctx, chatId)
	if err != nil {
		fmt.Printf("DEBUG 1 ERROR: Failed to get chat history: %v\n", err)
		update := scbus.MakeUpdatePacket()
		return update, fmt.Errorf("failed to get chat history: %w", err)
	}
	fmt.Printf("DEBUG 2: Got chat history with %d messages\n", len(history.Messages))
	
	// Get client data for AI provider settings
	fmt.Printf("DEBUG 3: Getting client data\n")
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		fmt.Printf("DEBUG 3 ERROR: Failed to get client data: %v\n", err)
		update := scbus.MakeUpdatePacket()
		return update, fmt.Errorf("failed to get client data: %w", err)
	}
	fmt.Printf("DEBUG 4: Got client data, clientId=%s\n", clientData.ClientId)
	
	// Log client data AI options
	fmt.Printf("DEBUG 5: Client AI opts: %+v\n", clientData.AIOpts)
	if clientData.AIOpts != nil {
		fmt.Printf("DEBUG 5a: Default provider: %s\n", clientData.AIOpts.Default)
		if clientData.AIOpts.OpenAI != nil {
			fmt.Printf("DEBUG 5b: OpenAI enabled: %v\n", clientData.AIOpts.OpenAI.Enabled)
		}
		if clientData.AIOpts.Gemini != nil {
			fmt.Printf("DEBUG 5c: Gemini enabled: %v\n", clientData.AIOpts.Gemini.Enabled)
		}
		if clientData.AIOpts.Azure != nil {
			fmt.Printf("DEBUG 5d: Azure enabled: %v\n", clientData.AIOpts.Azure.Enabled)
		}
	} else {
		fmt.Printf("DEBUG 5e: clientData.AIOpts is nil\n")
	}
	
	// If no provider specified, try to get the default
	if provider == "" && clientData.AIOpts != nil {
		provider = clientData.AIOpts.Default
		fmt.Printf("DEBUG 6: Using default provider: %s\n", provider)
	}
	
	if provider == "" {
		fmt.Printf("DEBUG 6 ERROR: No provider configured\n")
		errorMsg := "No AI provider configured. Please configure an AI provider in settings."
		aiMsg, _ := sstore.CreateAIMessage(chatId, "ai", errorMsg)
		sstore.InsertAIMessage(ctx, aiMsg)
		updatedHistory, _ := sstore.GetAIChatHistory(ctx, chatId)
		update := scbus.MakeUpdatePacket()
		if updatedHistory != nil {
			update.AddUpdate(updatedHistory)
		}
		return update, nil
	}
	
	// Build prompt from history
	fmt.Printf("DEBUG 7: Building prompt from history\n")
	var prompt []packet.OpenAIPromptMessageType
	for i, msg := range history.Messages {
		role := "user"
		if msg.Role == "ai" {
			role = "assistant"
		}
		prompt = append(prompt, packet.OpenAIPromptMessageType{
			Role:    role,
			Content: msg.Content,
		})
		fmt.Printf("DEBUG 7a: Message %d: role=%s, content length=%d\n", i, role, len(msg.Content))
	}
	fmt.Printf("DEBUG 8: Built prompt with %d messages\n", len(prompt))
	
	// Create AI request
	fmt.Printf("DEBUG 9: Creating AI request\n")
	request := &AIRequest{
		Mode:      AIModeAgent, // Use agent mode for chat
		Prompt:    prompt,
		Streaming: true,
		Provider:  provider,
		Context:   ctx,
	}
	fmt.Printf("DEBUG 10: AI request created - mode=%s, provider=%s, streaming=%v\n", request.Mode, request.Provider, request.Streaming)
	
	// Run AI completion
	fmt.Printf("DEBUG 11: About to call RunAICompletion\n")
	response, err := RunAICompletion(ctx, clientData, request)
	fmt.Printf("DEBUG 12: RunAICompletion returned, err=%v\n", err)
	if err != nil {
		// Create an error message as AI response
		errorMsg := fmt.Sprintf("Error calling AI provider: %v", err)
		fmt.Printf("AI completion error: %s\n", errorMsg)
		
		// Create error AI message
		aiMsg, msgErr := sstore.CreateAIMessage(chatId, "ai", errorMsg)
		if msgErr != nil {
			return nil, fmt.Errorf("failed to create error message: %w", msgErr)
		}
		
		msgErr = sstore.InsertAIMessage(ctx, aiMsg)
		if msgErr != nil {
			return nil, fmt.Errorf("failed to insert error message: %w", msgErr)
		}
		
		// Return updated history even with error
		updatedHistory, _ := sstore.GetAIChatHistory(ctx, chatId)
		update := scbus.MakeUpdatePacket()
		update.AddUpdate(updatedHistory)
		return update, nil
	}
	
	// Collect response
	fmt.Printf("DEBUG 13: Collecting response\n")
	var aiResponseText string
	if response != nil && response.Stream != nil {
		fmt.Printf("DEBUG 14: Response has stream\n")
		packetCount := 0
		for packet := range response.Stream {
			packetCount++
			if packet != nil && packet.Text != "" {
				aiResponseText += packet.Text
				fmt.Printf("DEBUG 14a: Packet %d added %d chars\n", packetCount, len(packet.Text))
			}
		}
		fmt.Printf("DEBUG 15: Collected %d packets from stream, total response length=%d\n", packetCount, len(aiResponseText))
	} else if response != nil && len(response.Packets) > 0 {
		fmt.Printf("DEBUG 16: Response has %d packets\n", len(response.Packets))
		for i, packet := range response.Packets {
			if packet != nil && packet.Text != "" {
				aiResponseText += packet.Text
				fmt.Printf("DEBUG 16a: Packet %d added %d chars\n", i, len(packet.Text))
			}
		}
	} else {
		fmt.Printf("DEBUG 17: No response stream or packets\n")
	}
	
	// Check if we got any response
	if aiResponseText == "" {
		fmt.Printf("DEBUG 18: No response text, using default message\n")
		aiResponseText = "I apologize, but I didn't receive a response. Please try again."
	} else {
		fmt.Printf("DEBUG 19: Got response text, length=%d\n", len(aiResponseText))
	}
	
	// Create AI message
	fmt.Printf("DEBUG 20: Creating AI message\n")
	aiMsg, err := sstore.CreateAIMessage(chatId, "ai", aiResponseText)
	if err != nil {
		fmt.Printf("DEBUG 20 ERROR: Failed to create AI message: %v\n", err)
		update := scbus.MakeUpdatePacket()
		return update, fmt.Errorf("failed to create AI message: %w", err)
	}
	fmt.Printf("DEBUG 21: AI message created\n")
	
	err = sstore.InsertAIMessage(ctx, aiMsg)
	if err != nil {
		fmt.Printf("DEBUG 21 ERROR: Failed to insert AI message: %v\n", err)
		update := scbus.MakeUpdatePacket()
		return update, fmt.Errorf("failed to insert AI message: %w", err)
	}
	fmt.Printf("DEBUG 22: AI message inserted\n")
	
	// Return updated history
	fmt.Printf("DEBUG 23: Getting updated history\n")
	updatedHistory, err := sstore.GetAIChatHistory(ctx, chatId)
	if err != nil {
		// Even on error, return an update packet to prevent server crash
		fmt.Printf("DEBUG 23 ERROR: Error getting updated history: %v\n", err)
		update := scbus.MakeUpdatePacket()
		return update, nil
	}
	fmt.Printf("DEBUG 24: Got updated history with %d messages\n", len(updatedHistory.Messages))
	
	fmt.Printf("DEBUG 25: Creating update packet\n")
	update := scbus.MakeUpdatePacket()
	if updatedHistory != nil {
		update.AddUpdate(updatedHistory)
		fmt.Printf("DEBUG 26: Added history to update packet\n")
	}
	
	// Debug the update packet
	fmt.Printf("DEBUG 27: Update packet type: %T\n", update)
	if update != nil {
		fmt.Printf("DEBUG 27a: Update packet is not nil\n")
	} else {
		fmt.Printf("DEBUG 27d: Update packet is nil!\n")
	}
	
	fmt.Printf("DEBUG 28: Returning update packet\n")
	return update, nil
}

func AIChatDeleteCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	chatId := pk.Kwargs["chatid"]
	if chatId == "" {
		return nil, fmt.Errorf("chatid is required")
	}
	
	err := sstore.DeleteAIChat(ctx, chatId)
	if err != nil {
		return nil, fmt.Errorf("failed to delete AI chat: %w", err)
	}
	
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(&sstore.AIChatType{
		ChatId: chatId,
		Remove: true,
	})
	return update, nil
}