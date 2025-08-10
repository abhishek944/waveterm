# Thread Mode Flow - End to End

This document describes the complete flow of the Thread Mode feature in Wave Terminal, from user activation to AI response with structured output and command execution.

## Overview

Thread Mode is an enhanced AI interaction mode that builds on Agent Mode by adding:
1. **Structured Output**: AI responses include both explanation and command in a structured format
2. **Conversation Context**: Thread mode maintains conversation history across multiple interactions
3. **Command Execution**: Ability to execute commands suggested by the AI (future implementation)

## Key Components

### Frontend Files
- **src/models/model.ts** - Main model containing thread mode state and toggle handler
- **src/models/input.ts** - Handles input submission with `/thread` prefix
- **src/app/workspace/cmdinput/cmdinput.tsx** - UI component showing thread mode indicator
- **src/app/line/linecomps.tsx** - Line rendering component that handles "thread_mode" line type
- **src/types/custom.d.ts** - TypeScript type definitions including `threadmodetoggle`

### Backend Files
- **wavesrv/pkg/cmdrunner/cmdrunner.go** - Contains ThreadCommand function
- **wavesrv/pkg/cmdrunner/ai-cmd-runner.go** - RunThreadMode and ParseThreadModeResponse functions
- **wavesrv/pkg/sstore/sstore.go** - Storage types and constants for thread mode
- **wavesrv/pkg/sstore/thread-mode.go** - Thread mode specific storage functions
- **wavesrv/pkg/prompts/thread-prompt.go** - System prompt for thread mode
- **wavesrv/pkg/remote/responseformat.go** - Structured output schema definition
- **wavesrv/pkg/remote/openai/openai.go** - OpenAI provider with structured output support
- **wavesrv/pkg/remote/gemini/gemini.go** - Gemini provider with structured output support
- **wavesrv/pkg/remote/azureopenai/azureopenai.go** - Azure OpenAI provider with structured output support

## Detailed Flow

### 1. Activation (User presses Cmd+Shift+O or toggles manually)

**File: src/models/model.ts**
```typescript
toggleThreadMode(): void {
    mobx.action(() => {
        if (this.isAgentMode.get()) {
            this.isAgentMode.set(false);
        }
        this.isThreadMode.set(!this.isThreadMode.get());
    })();
}
```

### 2. UI Updates

**File: src/app/workspace/cmdinput/cmdinput.tsx**
- Shows "Mode: Thread" indicator when thread mode is active
- Applies thread-mode styling to command input

### 3. User Input Submission

**File: src/models/input.ts (lines ~745-747)**
```typescript
if (isThreadMode && !commandStr.startsWith("/thread ")) {
    commandStr = "/thread " + commandStr;
}
```
- User input is automatically prefixed with `/thread`
- Command is submitted with thread mode flags

### 4. Command Processing

**File: src/models/model.ts**
- `submitRawCommand` adds thread mode kwargs to the command packet
- Command is sent to backend via WebSocket

### 5. Backend Command Routing

**File: wavesrv/pkg/cmdrunner/cmdrunner.go**
```go
registerCmdFn("thread", ThreadCommand)
```
- `/thread` commands are routed to ThreadCommand function

### 6. Thread Command Execution

**File: wavesrv/pkg/cmdrunner/cmdrunner.go (ThreadCommand function)**
Key steps:
1. Creates a thread mode line (type: "thread_mode")
2. Retrieves conversation history from previous thread lines
3. Builds conversation array with all previous messages
4. Calls RunThreadMode with conversation context

### 7. AI Processing with Structured Output

**File: wavesrv/pkg/cmdrunner/ai-cmd-runner.go**
```go
func RunThreadMode(ctx context.Context, pk *scpacket.FeCommandPacketType, 
                  clientData *sstore.ClientData, conversation []packet.OpenAIPromptMessageType, 
                  provider string) (*AIResponse, error)
```

Key features:
- Adds thread system prompt if not present
- Configures structured output based on provider

### 8. Provider-Specific Structured Output

**OpenAI (wavesrv/pkg/remote/openai/openai.go)**
```go
func CreateThreadModeResponseFormat() *openaiapi.ChatCompletionNewParamsResponseFormatUnion
```
- Uses OpenAI's JSON Schema response format
- Enforces structure: `{explanation: string, command: string}`

**Gemini (wavesrv/pkg/remote/gemini/gemini.go)**
```go
func CreateThreadModeResponseSchema() *genai.Schema
```
- Uses Gemini's Schema support
- Same structure as OpenAI

**Azure OpenAI (wavesrv/pkg/remote/azureopenai/azureopenai.go)**
- Same implementation as OpenAI provider

### 9. Response Processing

**File: wavesrv/pkg/cmdrunner/cmdrunner.go (ThreadCommand goroutine)**
```go
// Parse structured response
threadResp, err := ParseThreadModeResponse(responseText)
if err != nil {
    // Fallback to plain text
} else {
    // Write explanation
    err = writeTextToPty(bgCtx, cmd, threadResp.Explanation+"\n", &outputPos)
    
    // Show command (execution placeholder)
    if threadResp.Command != "" {
        err = writeTextToPty(bgCtx, cmd, "\n$ "+threadResp.Command+"\n", &outputPos)
        // TODO: Actual command execution
    }
}
```

### 10. Thread Mode Toggle Off

**File: wavesrv/pkg/sstore/updatetypes.go**
```go
type ThreadModeToggleType struct {
    Enabled bool `json:"enabled"`
}
```

After response completion:
```go
update := scbus.MakeUpdatePacket()
update.AddUpdate(sstore.ThreadModeToggleType{Enabled: false})
scbus.MainUpdateBus.DoUpdate(update)
```

### 11. Frontend Update Handler

**File: src/models/model.ts (lines ~1150-1157)**
```typescript
} else if (update.threadmodetoggle != null) {
    mobx.action(() => {
        this.isThreadMode.set(update.threadmodetoggle.enabled);
        // If enabling thread mode and agent mode is active, turn off agent mode
        if (update.threadmodetoggle.enabled && this.isAgentMode.get()) {
            this.isAgentMode.set(false);
        }
    })();
}
```

## Structured Output Format

### Request Format
The AI receives prompts with this system message:

**File: wavesrv/pkg/prompts/thread-prompt.go**
- Instructs AI to respond with JSON containing `explanation` and `command` fields
- Provides guidelines for command generation and safety

### Response Format
```json
{
    "explanation": "Brief explanation of what the command does",
    "command": "exact command to execute or empty string"
}
```

### Schema Definition
**File: wavesrv/pkg/remote/responseformat.go**
```go
type ThreadModeResponse struct {
    Explanation string `json:"explanation"`
    Command     string `json:"command"`
}
```

## Key Differences from Agent Mode

1. **Structured Output**: Thread mode enforces JSON response format vs free-form markdown in agent mode
2. **Conversation Context**: Thread mode maintains conversation history across interactions
3. **Command Extraction**: Commands are explicitly separated from explanations
4. **Future Command Execution**: Thread mode is designed to execute suggested commands
5. **Line Storage**: Thread lines store user queries, AI responses, and commands separately

## Data Flow Summary

1. User activates thread mode ’ `isThreadMode` observable set to true
2. User types and submits input ’ Input prefixed with `/thread`
3. Command sent to backend ’ Routed to `ThreadCommand` function
4. Thread line created (type: "thread_mode") ’ Not shown as "running"
5. Conversation history retrieved ’ All thread lines for screen
6. AI provider called with structured output ’ Response in JSON format
7. Response parsed ’ Explanation and command extracted
8. Output written to PTY ’ Formatted display in terminal
9. Thread data saved ’ User query, response, and command stored
10. On completion ’ Backend sends `threadmodetoggle` update
11. Frontend receives update ’ Thread mode toggled off

## Implementation Status

### Completed
- Thread mode activation and UI
- Command routing and processing
- Structured output for all AI providers
- Response parsing and display
- Thread line creation and storage structures

### TODO
- Actual command execution (currently placeholder)
- Thread conversation persistence to database
- Thread history retrieval from database
- Multi-turn conversation context
- Command execution safety checks
- Command output capture and display

This architecture provides a foundation for advanced AI-assisted command execution with proper context awareness and safety controls.