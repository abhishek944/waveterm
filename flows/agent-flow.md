# Agent Mode Flow - End to End

This document describes the complete flow of the Agent Mode feature in Wave Terminal, from user activation to AI response completion.

## Overview

Agent Mode is a special input mode that allows users to interact with AI directly from the command line. When activated, user input is sent to an AI provider (OpenAI, Gemini, or Azure) and the response is streamed back to the terminal.

## Key Components

### Frontend Files
- **src/models/model.ts** - Main model containing agent mode state
- **src/models/input.ts** - Handles input submission and command prefixing
- **src/app/workspace/cmdinput/cmdinput.tsx** - UI component showing agent mode indicator
- **src/app/line/linecomps.tsx** - Line rendering component that handles "agent_mode" line type
- **assets/default-keybindings.json** - Defines Cmd+O keybinding for agent mode
- **src/types/custom.d.ts** - TypeScript type definitions

### Backend Files
- **wavesrv/pkg/cmdrunner/cmdrunner.go** - Main command runner, contains AgentCommand function
- **wavesrv/pkg/cmdrunner/ai-cmd-runner.go** - AI integration logic
- **wavesrv/pkg/sstore/sstore.go** - Storage types and constants
- **wavesrv/pkg/sstore/updatetypes.go** - Update packet types
- **wavesrv/pkg/prompts/agent-prompt.go** - System prompt for agent mode
- **wavesrv/pkg/telemetry/telemetry.go** - Telemetry tracking

## Detailed Flow

### 1. Activation (User presses Cmd+O)

**File: src/models/model.ts**
```typescript
// Line ~300: Keybinding registration
keybindManager.registerKeybinding("pane", "app", "app:toggleAgentMode", (waveEvent) => {
    this.toggleAgentMode();
    return true;
});

// Line ~456: Toggle function
toggleAgentMode(): void {
    mobx.action(() => {
        if (this.isThreadMode.get()) {
            this.isThreadMode.set(false);
        }
        this.isAgentMode.set(!this.isAgentMode.get());
    })();
}
```

### 2. UI Updates

**File: src/app/workspace/cmdinput/cmdinput.tsx**
```typescript
// Line ~201: Agent mode class applied to cmd-input
<div className={clsx("cmd-input", { "agent-mode": isAgentMode })}>

// Lines ~286-288: Mode indicator displayed
{(GlobalModel.isThreadMode.get() || GlobalModel.isAgentMode.get()) && (
    <span className="mode-indicator"> | Mode: {GlobalModel.isAgentMode.get() ? "Agent" : "Thread"}</span>
)}
```

### 3. User Input Submission

**File: src/models/input.ts**
```typescript
// Lines ~735-756: uiSubmitCommand function
uiSubmitCommand(): void {
    let commandStr = this.curLine;
    if (commandStr.trim() == "") {
        return;
    }
    
    const isAgentMode = this.globalModel.isAgentMode.get();
    const isThreadMode = this.globalModel.isThreadMode.get();
    
    // Prefix command with /agent if in agent mode
    if (isAgentMode && !commandStr.startsWith("/agent ")) {
        commandStr = "/agent " + commandStr;
    }
    
    mobx.action(() => {
        this.resetInput();
        // Don't toggle off agent mode here - it will be toggled off after response
    })();
    
    this.globalModel.submitRawCommand(commandStr, true, true, isAgentMode, isThreadMode);
}
```

### 4. Command Processing

**File: src/models/model.ts**
```typescript
// Lines ~1638-1669: submitRawCommand
submitRawCommand(cmdStr: string, addToHistory: boolean, interactive: boolean, isAgentMode?: boolean, isThreadMode?: boolean): Promise<CommandRtnType> {
    const pk: FeCmdPacketType = {
        type: "fecmd",
        metacmd: "eval",
        args: [cmdStr],
        kwargs: {},
        uicontext: this.getUIContext(),
        interactive: interactive,
        rawstr: cmdStr,
    };
    
    if (isAgentMode) {
        pk.kwargs["agentmode"] = "1";
        const provider = this.aiProvider.get();
        if (provider && provider !== "") {
            pk.kwargs["provider"] = provider;
        }
    }
    
    return this.submitCommandPacket(pk, interactive);
}
```

### 5. Backend Command Routing

**File: wavesrv/pkg/cmdrunner/cmdrunner.go**
```typescript
// Line ~274: Command registration
registerCmdFn("agent", AgentCommand)

// Lines ~420-450: EvalMetaCommand parses "/agent" prefix
func EvalMetaCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
    metaCmd, metaSubCmd, args, kwargs := parseMetaCmd(pk.GetRawStr())
    // Routes to AgentCommand when metaCmd == "agent"
}
```

### 6. Agent Command Execution

**File: wavesrv/pkg/cmdrunner/cmdrunner.go**
```go
// Lines ~2720-2838: AgentCommand function
func AgentCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
    // Create command for agent mode (not a running command)
    cmd := &sstore.CmdType{
        ScreenId:  ids.ScreenId,
        LineId:    scbase.GenWaveUUID(),
        CmdStr:    pk.GetRawStr(),
        RawCmdStr: pk.GetRawStr(),
        Remote:    ids.Remote.RemotePtr,
        TermOpts:  *termOpts,
        Status:    sstore.CmdStatusDone, // Set as done, not running
        RunOut:    nil,
    }
    
    // Add agent mode line
    line, err := sstore.AddAgentModeLine(ctx, ids.ScreenId, DefaultUserId, cmd)
    
    // Run agent mode in goroutine
    go func() {
        response, err := RunAgentMode(ctx, pk, clientData, promptStr, provider)
        // Handle streaming response...
        
        // When done, send toggle update
        if !ok {
            update := scbus.MakeUpdatePacket()
            update.AddUpdate(sstore.AgentModeToggleType{Enabled: false})
            scbus.MainUpdateBus.DoUpdate(update)
            return
        }
    }()
}
```

### 7. Line Creation

**File: wavesrv/pkg/sstore/sstore.go**
```go
// Lines ~59-62: Line type constants
const (
    LineTypeCmd       = "cmd"
    LineTypeText      = "text"
    LineTypeAgentMode = "agent_mode"
)

// Lines ~1054-1066: makeNewLineAgentMode
func makeNewLineAgentMode(screenId string, userId string, lineId string) *LineType {
    rtn := &LineType{}
    rtn.ScreenId = screenId
    rtn.UserId = userId
    rtn.LineId = lineId
    rtn.Ts = time.Now().UnixMilli()
    rtn.LineLocal = true
    rtn.LineType = LineTypeAgentMode
    rtn.ContentHeight = LineNoHeight
    rtn.Renderer = CmdRendererAgentMode
    rtn.LineState = make(map[string]any)
    return rtn
}
```

### 8. AI Processing

**File: wavesrv/pkg/cmdrunner/ai-cmd-runner.go**
```go
// Lines ~180-202: RunAgentMode
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
        Provider:  provider,
    }
    
    return RunAICompletion(ctx, clientData, request)
}
```

### 9. Frontend Line Rendering

**File: src/app/line/linecomps.tsx**
```typescript
// Lines ~1008-1016: Line component routing
render() {
    const line = this.props.line;
    if (line.archived) {
        return null;
    }
    if (line.linetype == "text") {
        return <LineText {...this.props} />;
    }
    if (line.linetype == "cmd" || line.linetype == "agent_mode") {
        return <LineCmd {...this.props} />;
    }
    return <div className="line line-invalid">[invalid line type '{line.linetype}']</div>;
}
```

### 10. Agent Mode Toggle Off

**File: wavesrv/pkg/sstore/updatetypes.go**
```go
// Lines ~169-176: AgentModeToggleType
type AgentModeToggleType struct {
    Enabled bool `json:"enabled"`
}

func (AgentModeToggleType) GetType() string {
    return "agentmodetoggle"
}
```

**File: src/models/model.ts**
```typescript
// Lines ~1140-1147: Update handler
} else if (update.agentmodetoggle != null) {
    mobx.action(() => {
        // If thread mode is active and agent mode is being enabled, turn off thread mode
        if (this.isThreadMode.get() && update.agentmodetoggle.enabled) {
            this.isThreadMode.set(false);
        }
        this.isAgentMode.set(update.agentmodetoggle.enabled);
    })();
}
```

## Key Features

1. **Non-Running Line Behavior**: Agent mode commands don't show as "running" - they're created with `CmdStatusDone`
2. **Mode Persistence**: Agent mode stays active during AI processing
3. **Auto Toggle Off**: Mode automatically turns off after response completion
4. **Provider Selection**: Supports multiple AI providers (OpenAI, Gemini, Azure)
5. **Streaming Response**: AI responses are streamed back in real-time

## Data Flow Summary

1. User activates agent mode (Cmd+O) ’ `isAgentMode` observable set to true
2. User types and submits input ’ Input prefixed with "/agent"
3. Command sent to backend ’ Routed to `AgentCommand` function
4. Agent line created (type: "agent_mode") ’ Not shown as "running"
5. AI provider called ’ Response streamed back
6. Response written to PTY ’ Displayed in terminal
7. On completion ’ Backend sends `agentmodetoggle` update
8. Frontend receives update ’ Agent mode toggled off

This architecture ensures a seamless experience where users can quickly get AI assistance without the command appearing as a traditional "running" command, and the mode automatically resets after each use.