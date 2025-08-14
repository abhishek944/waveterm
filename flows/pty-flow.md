# PTY (Pseudo-Terminal) Flow in Wave Terminal

This document describes how PTY buffers work in Wave Terminal and how command output flows from execution to display.

## Overview

Wave Terminal uses PTY (Pseudo-Terminal) to capture and display command output. PTY provides a virtual terminal interface that allows programs to interact with commands as if they were running in a real terminal.

## PTY Basics

### What is a PTY?

A PTY consists of two parts:
- **Master (pty)**: The controlling side used by Wave Terminal
- **Slave (tty)**: The side connected to the command/shell process

When a command runs, its input/output is connected to the slave side, and Wave Terminal reads/writes through the master side.

## Architecture Components

### 1. Backend Components

#### PTY Creation (waveshell/pkg/shexec/shexec.go)
```go
cmdPty, cmdTty, err := pty.Open()
pty.Setsize(cmdPty, GetWinsize(pk))
```

#### Data Reading (waveshell/pkg/mpio/mpio.go)
- Reads from PTY file descriptor in 4KB chunks
- Encodes data as base64 for transport
- Creates DataPackets with position tracking

#### PTY File Storage (wavesrv/pkg/sstore)
- Each command line has an associated PTY file
- Files stored at: `~/.waveterm/ptyout/{screenId}/{lineId}.ptyout`
- Supports append operations for streaming data

### 2. Transport Layer

#### WebSocket Updates (scbus/ptydataupdate.go)
```go
type PtyDataUpdate struct {
    ScreenId   string
    LineId     string
    PtyPos     int64    // Current position in PTY buffer
    PtyData64  string   // Base64 encoded data
    PtyDataLen int64    // Length of decoded data
}
```

### 3. Frontend Components

#### Model Reception (src_new/models/model.ts)
- Receives PtyDataUpdate packets
- Routes to appropriate renderer based on lineId
- Handles position tracking for sequential writes

#### Renderer Interface
```typescript
interface RendererModel {
    receiveData: (pos: number, data: Uint8Array) => void;
    // ... other methods
}
```

## Command Execution Flow

### 1. Regular Command Execution

```
User Input ’ Command Runner ’ PTY Creation ’ Process Execution
                                    “
Frontend  WebSocket  DataPacket  PTY Read Loop
    “
Terminal Display (xterm.js)
```

### 2. Thread Mode Execution (Current)

```
User Input ’ Thread Command ’ Create Thread Line ’ Write AI Response to PTY
                                         “
                              Execute Command ’ Append to SAME PTY
                                         “
                        Frontend (Both views see everything)
```

### 3. Thread Mode Execution (Improved with Separate PTYs)

```
User Input ’ Thread Command ’ Create Thread Line ’ Write AI Response to Main PTY
                                         “
                              Execute Command ’ Write to {lineId}_cmdExec PTY
                                         “
                    Main View (Main PTY) | Sidebar (Command PTY)
```

## PTY File Management

### File Naming Convention
- Main line PTY: `{screenId}/{lineId}.ptyout`
- Command execution PTY: `{screenId}/{lineId}_cmdExec.ptyout`

### File Operations
1. **Create**: `CreateCmdPtyFile()` - Creates new PTY file
2. **Write**: `AppendToCmdPtyFile()` - Appends data at specific position
3. **Read**: `GetCmdPtyData()` - Reads data with offset/length
4. **Stat**: `StatCmdPtyFile()` - Gets file size and metadata

## Data Flow Details

### 1. Writing to PTY
```go
// Backend writes to PTY file
func writeTextToPty(ctx context.Context, cmd *sstore.CmdType, text string, outputPos *int64) error {
    data := []byte(text)
    update, err := sstore.AppendToCmdPtyFile(ctx, cmd.ScreenId, cmd.LineId, data, *outputPos)
    // Send update to frontend
}
```

### 2. Frontend Reception
```typescript
// Model receives and routes PTY data
updatePtyData(lineId: string, ptyData: Uint8Array, ptyPos: number) {
    const renderer = this.getRenderer(lineId);
    if (renderer) {
        renderer.receiveData(ptyPos, ptyData);
    }
}
```

### 3. Renderer Processing
```typescript
// Thread mode renderer
receiveData: (pos: number, data: Uint8Array) => {
    const chunk = decoder.decode(data);
    setContent(prev => prev + chunk);
}
```

## Thread Mode Specific Implementation

### Problem
- AI response and command output share the same PTY file
- Both main view and sidebar show complete content
- No separation between explanation and execution output

### Solution: Separate PTY Files

1. **Main Thread Line PTY** (`{lineId}.ptyout`)
   - Contains AI response (JSON with explanation and command)
   - Read by main thread view

2. **Command Execution PTY** (`{lineId}_cmdExec.ptyout`)
   - Contains only command execution output
   - Read by sidebar view when command is clicked

### Implementation Steps

1. **Backend Changes**:
   - Modify `ExecuteCommandInThread` to create separate PTY file
   - Use `{lineId}_cmdExec` as the new PTY file identifier
   - Write command output to the execution PTY

2. **Frontend Changes**:
   - ThreadModeRenderer in main view: Read from main PTY
   - ThreadModeRenderer in sidebar: Read from execution PTY
   - Register appropriate renderers for each PTY

## Benefits of Separate PTYs

1. **Clear Separation**: AI explanation and command output are physically separated
2. **Independent Streaming**: Each PTY can stream independently
3. **Better Performance**: No need to parse/filter content
4. **Cleaner Architecture**: Each component reads only what it needs

## PTY Buffer Characteristics

- **Streaming**: Data arrives in chunks, not all at once
- **Sequential**: Position tracking ensures correct ordering
- **Persistent**: PTY files persist across sessions
- **Efficient**: Only new data is transmitted, not entire buffer

## Error Handling

1. **PTY Creation Failures**: Fallback to non-PTY mode
2. **Write Failures**: Queue and retry mechanism
3. **Read Failures**: Request full buffer refresh
4. **Position Mismatch**: Re-sync with server

## Performance Considerations

1. **Chunk Size**: 4KB optimal for network transport
2. **Base64 Encoding**: ~33% overhead but ensures data integrity
3. **Position Tracking**: Enables efficient partial reads
4. **File System**: Local storage provides fast access

This architecture enables Wave Terminal to handle large outputs efficiently while maintaining real-time streaming capabilities and supporting advanced features like Thread Mode with separated concerns.