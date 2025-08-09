// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmdrunner

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/abhishek944/waveterm/waveshell/pkg/packet"
	"github.com/abhishek944/waveterm/wavesrv/pkg/remote/azureopenai"
	"github.com/abhishek944/waveterm/wavesrv/pkg/remote/gemini"
	"github.com/abhishek944/waveterm/wavesrv/pkg/remote/openai"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

// Constants for connection status
const (
	ConnectionStatusPending   = "pending"
	ConnectionStatusConnected = "connected"
	ConnectionStatusFailed    = "failed"
)

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ClientVerifyAIProviderCommand verifies the connection to an AI provider
func ClientVerifyAIProviderCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	log.Printf("[ClientVerifyAIProviderCommand] Starting verification")
	log.Printf("[ClientVerifyAIProviderCommand] Kwargs: %v", pk.Kwargs)
	
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		log.Printf("[ClientVerifyAIProviderCommand] Error retrieving client data: %v", err)
		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
	}

	provider, found := pk.Kwargs["provider"]
	if !found {
		log.Printf("[ClientVerifyAIProviderCommand] Provider parameter not found")
		return nil, fmt.Errorf("provider parameter is required")
	}
	
	log.Printf("[ClientVerifyAIProviderCommand] Verifying provider: %s", provider)

	// Get current AI options
	aiOpts := clientData.AIOpts
	if aiOpts == nil {
		log.Printf("[ClientVerifyAIProviderCommand] No AI options configured")
		return nil, fmt.Errorf("no AI options configured")
	}
	
	log.Printf("[ClientVerifyAIProviderCommand] Current AI options: %+v", aiOpts)

	// Create a simple test prompt
	testPrompt := []packet.OpenAIPromptMessageType{
		{
			Role:    "user",
			Content: "hey",
		},
	}

	// Set timeout for verification
	verifyCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	
	log.Printf("[ClientVerifyAIProviderCommand] Created context with 10s timeout")

	var verifyErr error
	connectionStatus := ConnectionStatusPending

	log.Printf("[ClientVerifyAIProviderCommand] Starting provider-specific verification")
	
	switch provider {
	case "openai":
		log.Printf("[ClientVerifyAIProviderCommand] Checking OpenAI configuration")
		if aiOpts.OpenAI == nil || aiOpts.OpenAI.APIToken == "" {
			log.Printf("[ClientVerifyAIProviderCommand] OpenAI not configured")
			verifyErr = fmt.Errorf("OpenAI is not configured")
		} else {
			log.Printf("[ClientVerifyAIProviderCommand] Testing OpenAI connection with token: %s...", aiOpts.OpenAI.APIToken[:min(4, len(aiOpts.OpenAI.APIToken))])
			// Test OpenAI connection
			_, err := openai.RunCompletion(verifyCtx, aiOpts.OpenAI, testPrompt)
			if err != nil {
				log.Printf("[ClientVerifyAIProviderCommand] OpenAI test failed: %v", err)
				verifyErr = err
				connectionStatus = ConnectionStatusFailed
			} else {
				log.Printf("[ClientVerifyAIProviderCommand] OpenAI test succeeded")
				connectionStatus = ConnectionStatusConnected
			}
			// Update connection status
			aiOpts.OpenAI.ConnectionStatus = connectionStatus
			log.Printf("[ClientVerifyAIProviderCommand] Set OpenAI connection status: %s", connectionStatus)
		}

	case "gemini":
		log.Printf("[ClientVerifyAIProviderCommand] Checking Gemini configuration")
		if aiOpts.Gemini == nil || aiOpts.Gemini.APIToken == "" {
			log.Printf("[ClientVerifyAIProviderCommand] Gemini not configured")
			verifyErr = fmt.Errorf("Gemini is not configured")
		} else {
			log.Printf("[ClientVerifyAIProviderCommand] Testing Gemini connection with token: %s...", aiOpts.Gemini.APIToken[:min(4, len(aiOpts.Gemini.APIToken))])
			// Test Gemini connection
			_, err := gemini.RunCompletion(verifyCtx, aiOpts.Gemini, testPrompt)
			if err != nil {
				log.Printf("[ClientVerifyAIProviderCommand] Gemini test failed: %v", err)
				verifyErr = err
				connectionStatus = ConnectionStatusFailed
			} else {
				log.Printf("[ClientVerifyAIProviderCommand] Gemini test succeeded")
				connectionStatus = ConnectionStatusConnected
			}
			// Update connection status
			aiOpts.Gemini.ConnectionStatus = connectionStatus
			log.Printf("[ClientVerifyAIProviderCommand] Set Gemini connection status: %s", connectionStatus)
		}

	case "azure":
		log.Printf("[ClientVerifyAIProviderCommand] Checking Azure configuration")
		if aiOpts.Azure == nil || aiOpts.Azure.APIToken == "" || aiOpts.Azure.BaseURL == "" || aiOpts.Azure.DeploymentName == "" {
			log.Printf("[ClientVerifyAIProviderCommand] Azure not configured properly")
			verifyErr = fmt.Errorf("Azure OpenAI is not configured")
		} else {
			log.Printf("[ClientVerifyAIProviderCommand] Testing Azure connection - BaseURL: %s, Deployment: %s", aiOpts.Azure.BaseURL, aiOpts.Azure.DeploymentName)
			// Test Azure OpenAI connection
			_, err := azureopenai.RunCompletion(verifyCtx, aiOpts.Azure, testPrompt)
			if err != nil {
				log.Printf("[ClientVerifyAIProviderCommand] Azure test failed: %v", err)
				verifyErr = err
				connectionStatus = ConnectionStatusFailed
			} else {
				log.Printf("[ClientVerifyAIProviderCommand] Azure test succeeded")
				connectionStatus = ConnectionStatusConnected
			}
			// Update connection status
			aiOpts.Azure.ConnectionStatus = connectionStatus
			log.Printf("[ClientVerifyAIProviderCommand] Set Azure connection status: %s", connectionStatus)
		}

	default:
		log.Printf("[ClientVerifyAIProviderCommand] Unknown provider: %s", provider)
		return nil, fmt.Errorf("unknown provider: %s", provider)
	}

	log.Printf("[ClientVerifyAIProviderCommand] Updating AI options in database")
	// Update the AI options in the database
	err = sstore.UpdateClientAIOpts(ctx, *aiOpts)
	if err != nil {
		log.Printf("[ClientVerifyAIProviderCommand] Error updating AI options: %v", err)
		return nil, fmt.Errorf("error updating AI options: %v", err)
	}
	log.Printf("[ClientVerifyAIProviderCommand] AI options updated successfully")

	// Get updated client data
	clientData, err = sstore.EnsureClientData(ctx)
	if err != nil {
		log.Printf("[ClientVerifyAIProviderCommand] Error retrieving updated client data: %v", err)
		return nil, fmt.Errorf("cannot retrieve updated client data: %v", err)
	}

	// Create response
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(*clientData)

	// Add info message about the verification result
	if verifyErr != nil {
		log.Printf("[ClientVerifyAIProviderCommand] Returning error response: %v", verifyErr)
		update.AddUpdate(sstore.InfoMsgType{
			InfoMsg:   fmt.Sprintf("Failed to verify %s: %v", provider, verifyErr),
			TimeoutMs: 5000,
		})
	} else {
		log.Printf("[ClientVerifyAIProviderCommand] Returning success response")
		update.AddUpdate(sstore.InfoMsgType{
			InfoMsg:   fmt.Sprintf("Successfully connected to %s", provider),
			TimeoutMs: 3000,
		})
	}

	log.Printf("[ClientVerifyAIProviderCommand] Verification complete, returning update packet")
	return update, nil
}