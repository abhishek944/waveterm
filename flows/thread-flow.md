# Thread Mode Flow - End to End

This document describes the complete flow of the Thread Mode feature in Wave Terminal, from user activation to AI response with structured output and command execution.

## Overview

Thread Mode is an enhanced AI interaction mode that builds on Agent Mode by adding:

1. **Structured Output**: AI responses include both explanation and command in a structured format
2. **Conversation Context**: Thread mode maintains conversation history across multiple interactions
3. **Command Execution**: Ability to execute commands suggested by the AI (future implementation)

## Key Components

### Frontend Files

-   **src/models/model.ts** - Main model containing thread mode state and toggle handler
-   **src/models/input.ts** - Handles input submission with `/thread` prefix
-   **src/app/workspace/cmdinput/cmdinput.tsx** - UI component showing thread mode indicator
-   **src/app/line/linecomps.tsx** - Line rendering component that handles "thread_mode" line type
-   **src/types/custom.d.ts** - TypeScript type definitions including `threadmodetoggle`

### Backend Files

-   **wavesrv/pkg/cmdrunner/cmdrunner.go** - Contains ThreadCommand function
-   **wavesrv/pkg/cmdrunner/ai-cmd-runner.go** - RunThreadMode and ParseThreadModeResponse functions
-   **wavesrv/pkg/sstore/sstore.go** - Storage types and constants for thread mode
-   **wavesrv/pkg/sstore/thread-mode.go** - Thread mode specific storage functions
-   **wavesrv/pkg/prompts/thread-prompt.go** - System prompt for thread mode
-   **wavesrv/pkg/remote/responseformat.go** - Structured output schema definition
-   **wavesrv/pkg/remote/openai/openai.go** - OpenAI provider with structured output support
-   **wavesrv/pkg/remote/gemini/gemini.go** - Gemini provider with structured output support
-   **wavesrv/pkg/remote/azureopenai/azureopenai.go** - Azure OpenAI provider with structured output support

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

-   Shows "Mode: Thread" indicator when thread mode is active
-   Applies thread-mode styling to command input

### 3. User Input Submission

**File: src/models/input.ts (lines ~745-747)**

```typescript
if (isThreadMode && !commandStr.startsWith("/thread ")) {
    commandStr = "/thread " + commandStr;
}
```

-   User input is automatically prefixed with `/thread`
-   Command is submitted with thread mode flags

### 4. Command Processing

**File: src/models/model.ts**

-   `submitRawCommand` adds thread mode kwargs to the command packet
-   Command is sent to backend via WebSocket

### 5. Backend Command Routing

**File: wavesrv/pkg/cmdrunner/cmdrunner.go**

```go
registerCmdFn("thread", ThreadCommand)
```

-   `/thread` commands are routed to ThreadCommand function

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

-   Adds thread system prompt if not present
-   Configures structured output based on provider

### 8. Provider-Specific Structured Output

**OpenAI (wavesrv/pkg/remote/openai/openai.go)**

```go
func CreateThreadModeResponseFormat() *openaiapi.ChatCompletionNewParamsResponseFormatUnion
```

-   Uses OpenAI's JSON Schema response format
-   Enforces structure: `{explanation: string, command: string}`

**Gemini (wavesrv/pkg/remote/gemini/gemini.go)**

```go
func CreateThreadModeResponseSchema() *genai.Schema
```

-   Uses Gemini's Schema support
-   Same structure as OpenAI

**Azure OpenAI (wavesrv/pkg/remote/azureopenai/azureopenai.go)**

-   Same implementation as OpenAI provider

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

-   Instructs AI to respond with JSON containing `explanation` and `command` fields
-   Provides guidelines for command generation and safety

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

1. User activates thread mode � `isThreadMode` observable set to true
2. User types and submits input � Input prefixed with `/thread`
3. Command sent to backend � Routed to `ThreadCommand` function
4. Thread line created (type: "thread_mode") � Not shown as "running"
5. Conversation history retrieved � All thread lines for screen
6. AI provider called with structured output � Response in JSON format
7. Response parsed � Explanation and command extracted
8. Output written to PTY � Formatted display in terminal
9. Thread data saved � User query, response, and command stored
10. On completion � Backend sends `threadmodetoggle` update
11. Frontend receives update � Thread mode toggled off

## Implementation Status

### Completed

-   Thread mode activation and UI
-   Command routing and processing
-   Structured output for all AI providers
-   Response parsing and display
-   Thread line creation and storage structures

### TODO

-   Actual command execution (currently placeholder)
-   Thread conversation persistence to database
-   Thread history retrieval from database
-   Multi-turn conversation context
-   Command execution safety checks
-   Command output capture and display

This architecture provides a foundation for advanced AI-assisted command execution with proper context awareness and safety controls.

\n

# Thread Mode Flow - End to End (Current, ID-based and Streaming)

This section reflects the current implementation after recent changes. Thread Mode maintains conversation context strictly by thread ID and streams responses like Agent Mode.

## Overview

-   Threads are identified and referenced by `threadid` everywhere. Names are display-only for the dropdown.
-   Frontend passes `threadid` with each `/thread` submission when selected; if not set, backend creates a new thread for the active screen.
-   Backend streams the AI response to PTY and persists user/assistant/command linked to the thread.
-   Thread mode remains active after responses (similar to agent mode) until user toggles it off

## Key Components (Current)

-   Frontend
    -   `src_new/models/model.ts`: state `isThreadMode`, `activeThreadId`, `threadsByScreen`; adds `threadmode=1`, `provider`, and `threadid` (if present) to kwargs.
    -   `src_new/models/input.ts`: prefixes `/thread` when thread mode is active.
    -   `src_new/components/workspace/cmdinput/cmdinput.tsx`: shows mode indicator + thread dropdown; selecting sets `activeThreadId`.
    -   `src_new/components/line/linecomps.tsx`: renders `thread_mode` lines in the terminal path for live streaming.
-   Backend
    -   `wavesrv/pkg/cmdrunner/thread-cmd-runner.go`: creates `thread_mode` line; ensures/uses `threadid` (creating a new thread if empty); associates line to thread; builds conversation from that thread’s history; runs AI streaming; persists response and optional command; sends `threadmodetoggle=false`; pushes updated `threads` list for the screen.
    -   `wavesrv/pkg/cmdrunner/ai-cmd-runner.go`: `RunThreadMode` configures structured output per provider; `ParseThreadModeResponse` parses `{ explanation, command }`.
    -   `wavesrv/pkg/sstore/thread-mode.go`: thread DB helpers (`CreateThread`, `ListThreads`, `GetThreadById`, `AddThreadLine`, `GetThreadLinesByThread`, `UpdateThreadLineUserQuery/AssistantResponse/Command`) and update payloads (`ThreadModeToggleType`, `ThreadsUpdateType`).
    -   Migrations: `wavesrv/db/migrations/000033_threads.up.sql` adds `thread` and `thread_line` tables.

## Database Schema (v33)

-   `thread(threadid PK, sessionid, screenid, name, createdts, updatedts, archived)`
-   `thread_line(threadid, screenid, lineid, linenum, userquery, assistantresponse, command)`

## Current Detailed Flow

1. Activation: FE toggles `isThreadMode`; shows “Mode: Thread” and dropdown.
2. Selection: Dropdown shows screen threads (`threads` update). Selecting sets `activeThreadId`. “New Thread…” leaves it empty.
3. Submission: FE prefixes `/thread`, sets `threadmode=1`, `provider` if set, and `threadid` if selected.
4. Routing: `/thread` → `ThreadCommand`.
5. Execution: Backend creates `thread_mode` line; ensures/uses `threadid` (creates if empty); associates line to thread; builds conversation from `GetThreadLinesByThread(threadid)`; persists current user query.
6. Streaming: Backend streams provider response to PTY. On stream end, try JSON parse `{ explanation, command }`; write/persist explanation and optional command; else persist as plain text. Send `threadmodetoggle=false`.
7. Threads update: Backend pushes `ThreadsUpdateType{screenid, items:[{threadid,name}]}`; FE merges into `threadsByScreen`.

## Migration & Startup

-   Latest DB version: 33. On server startup, `TryMigrateUp()` upgrades to v33. If you see “no such table: thread”, run:
    -   `cd wavesrv && go run ./cmd --migrate-up`

## Status & Next Steps

-   Done: ID-based selection, streaming, persistence, structured output.
-   TODO: command execution, rename UI, load thread list on connect, safety checks, output capture.

## Recent Updates Summary

### Frontend Changes
1. **Thread Mode Persistence**: Thread mode now stays active after responses (removed auto-toggle off)
2. **Auto Thread Naming**: New threads get names "thread-1", "thread-2", etc. instead of generic "Thread" 
3. **Auto Thread Selection**: Latest thread automatically selected when list updates (first in list since ordered by updatedts DESC)
4. **Thread List Fetching**: 
   - Fetches threads when entering thread mode via `_requestthreads` command
   - MobX reaction monitors screen changes and fetches threads for new screen
5. **Dropdown Improvements**:
   - Fixed transparency with opaque backgrounds (`bg-black/100`)
   - Fixed flickering with `onMouseDown` event handling
   - Changed empty string to "new-thread" value to avoid Radix UI errors
   - Custom SelectItem to hide checkmarks in AI provider dropdown
6. **Multi-word Support**: Fixed issue where only first word was sent - now joins all args

### Backend Changes
1. **Thread Command**: Now uses `strings.Join(pk.Args, " ")` instead of `firstArg(pk)`
2. **Thread Mode Persistence**: Removed `threadmodetoggle=false` send after response
3. **Auto Naming**: `CreateThread` checks for empty/"Thread" name and generates sequential names
4. **Request Threads Command**: Added `RequestThreadsCommand` handler for `_requestthreads`
5. **Debug Logging**: Added extensive logging in:
   - `RunCompletionWithFormat` and `RunCompletionStreamWithFormat` (OpenAI)
   - `RunThreadMode` and `ParseThreadModeResponse`

### Key Files Modified
- `src_new/models/model.ts` - Thread list fetching, auto-selection, screen monitoring
- `src_new/models/input.ts` - Multi-word prompt support
- `src_new/components/workspace/cmdinput/cmdinput.tsx` - Dropdown fixes
- `src_new/components/workspace/cmdinput/aiprovider.tsx` - Custom SelectItem
- `wavesrv/pkg/cmdrunner/thread-cmd-runner.go` - Multi-word support, persistence
- `wavesrv/pkg/cmdrunner/cmdrunner.go` - RequestThreadsCommand
- `wavesrv/pkg/sstore/thread-mode.go` - Auto-naming logic
- `wavesrv/pkg/cmdrunner/ai-cmd-runner.go` - Debug logging
- `wavesrv/pkg/remote/openai/openai.go` - Removed debug logging after user reverted
