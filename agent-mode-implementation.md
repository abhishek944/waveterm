# Agent Mode and Thread Mode Command Submission Implementation

## Overview
This implementation adds support for sending agent mode and thread mode commands with special kwargs to the backend.

## Changes Made

### 1. Updated `submitRawCommand` in `/src/models/model.ts`
- Added optional `isAgentMode` and `isThreadMode` parameters
- When `isAgentMode` is true, adds `"agentmode": "1"` to the kwargs sent with the command packet
- When `isThreadMode` is true, adds `"threadmode": "1"` to the kwargs sent with the command packet

### 2. Updated `uiSubmitCommand` in `/src/models/input.ts`
- Gets the current agent mode state from `GlobalModel.isAgentMode`
- Gets the current thread mode state from `GlobalModel.isThreadMode`
- Passes both flags to `submitRawCommand` when submitting commands

### 3. Updated keybinding command submission in `/src/util/keyutil.ts`
- Passes `false` for both `isAgentMode` and `isThreadMode` to ensure keybinding commands are not treated as special mode commands

## How It Works

When a user submits a command while in agent mode or thread mode:
1. The UI detects the mode states from:
   - `GlobalModel.isAgentMode.get()`
   - `GlobalModel.isThreadMode.get()`
2. The command is packaged into a `FeCmdPacketType` with:
   - `metacmd: "eval"`
   - `args: [commandStr]`
   - `kwargs`: May include:
     - `"agentmode": "1"` (when in agent mode)
     - `"threadmode": "1"` (when in thread mode)
     - Both can be present simultaneously
3. The packet is sent to `/api/run-command` endpoint
4. The backend can check the kwargs to determine the command mode

## Backend Integration
The backend can now check for special mode commands by examining the kwargs:
```go
if pk.Kwargs["agentmode"] == "1" {
    // Handle as agent command
}
if pk.Kwargs["threadmode"] == "1" {
    // Handle as thread command
}
```

## Testing
To test this implementation:
1. Toggle agent mode or thread mode in the UI
2. Submit a command
3. Check network tab to verify that the appropriate flags are included in the request payload:
   - `"agentmode": "1"` when in agent mode
   - `"threadmode": "1"` when in thread mode
   - Both flags when both modes are active