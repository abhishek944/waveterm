# AI Implementation Flow

## Overview

The AI implementation supports both Agent Mode (cmd+o) and Thread Mode (cmd+i) with multiple AI providers (OpenAI, Gemini, Azure).

## Architecture

### Key Components

1. **AI Command Runner** (`wavesrv/pkg/cmdrunner/ai-cmd-runner.go`)
   - Central routing logic for AI requests
   - Provider selection based on user settings
   - Unified interface for different AI providers

2. **Provider Implementations**
   - **OpenAI** (`wavesrv/pkg/remote/openai/openai.go`)
     - Uses official `github.com/openai/openai-go/v2` SDK
     - Supports streaming and non-streaming completions
   - **Gemini** (`wavesrv/pkg/remote/gemini/gemini.go`)
     - Uses `github.com/google/generative-ai-go` SDK
     - Adapts Gemini API to OpenAI-compatible format
   - **Azure OpenAI** (`wavesrv/pkg/remote/azureopenai/azureopenai.go`)
     - Uses `github.com/openai/openai-go/v2` SDK with Azure configuration
     - Supports Azure endpoints and deployment names
     - Compatible with Azure API versions

3. **Command Handler** (`wavesrv/pkg/cmdrunner/cmdrunner.go`)
   - `AgentCommand`: Handles `/agent` command for agent mode
   - `OpenAICommand`: Handles `/chat` command for thread mode

## Agent Mode Flow (cmd+o)

1. **User Trigger**: User presses cmd+o and enters a prompt
2. **Command Processing**: 
   - `AgentCommand` function in `cmdrunner.go` is invoked
   - Creates a command context with terminal options
   - Increments running command counter
3. **AI Request**:
   - Calls `RunAgentMode` in `ai-cmd-runner.go`
   - Adds system prompt for command-line assistance
   - Routes to appropriate provider based on settings
4. **Provider Execution**:
   - Selected provider (OpenAI/Gemini) processes the request
   - Returns streaming response channel
5. **Response Handling**:
   - Streams response packets to PTY buffer
   - Updates command status when complete
   - Updates screen with response

## Thread Mode Flow (cmd+i)

1. **User Trigger**: User presses cmd+i for contextual help
2. **Command Processing**: 
   - `OpenAICommand` function handles the request
   - Maintains conversation history
3. **AI Request**:
   - Calls appropriate completion functions
   - Includes conversation context
4. **Response Display**:
   - Updates UI with streaming responses
   - Maintains chat history

## Provider Selection Logic

```go
// In GetAIProvider:
1. Check if AIOpts.Default is set
2. Return error if no provider configured

// In GetAIOptions:
1. Return provider-specific options based on selection
2. Support for OpenAI, Gemini, and Azure
```

## Configuration Structure

```go
type AIOptsType struct {
    Default string               // Selected provider: "openai", "gemini", "azure"
    Gemini  *GeminiOptsType     // Gemini-specific options
    OpenAI  *OpenAIOptsType     // OpenAI-specific options
    Azure   *AzureOpenAIOptsType // Azure-specific options
}
```

## Key Functions

### AI Command Runner
- `RunAICompletion`: Main entry point for all AI completions
- `RunAgentMode`: Specific handler for agent mode with prompt engineering
- `RunThreadMode`: Handler for thread mode with conversation context

### Provider Functions
- `RunCompletion`: Non-streaming completion
- `RunCompletionStream`: Streaming completion
- `ConvertPromptMessages`: Converts generic format to provider-specific format

## Error Handling

1. Provider not configured: Returns error message
2. API errors: Wrapped and returned to user
3. Timeout handling: Configurable timeouts for streaming
4. Network errors: Graceful degradation with error messages

## UI Provider Selection

The Agent Mode UI now includes a dropdown to select the AI provider:
- Options: OpenAI, Azure OpenAI, Gemini
- The selection is passed with the request and overrides the default provider
- Provider parameter flows from UI → AgentCommand → RunAgentMode → RunAICompletion

## Azure OpenAI Configuration

Azure OpenAI requires:
- **BaseURL**: Azure endpoint (e.g., https://myresource.openai.azure.com)
- **APIToken**: Azure API key
- **DeploymentName**: The deployment name (used as model parameter)
- **API Version**: Can be included in BaseURL or defaults to 2024-06-01

## Future Enhancements

1. **Provider Switching**: Dynamic provider switching in thread mode
2. **Model Selection**: Per-request model selection
3. **Cost Tracking**: Usage and cost monitoring
4. **Prompt Templates**: Customizable prompt engineering
5. **Thread Mode Prompts**: Enhanced prompts for thread mode