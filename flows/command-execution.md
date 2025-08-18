# Command Execution Flow

This document describes how commands are executed in WaveTerm, from user input to terminal output.

## Overview

Command execution in WaveTerm follows this high-level flow:
1. User types command in the command input area
2. User presses Enter to submit
3. Command is processed and sent to the backend
4. Backend executes command through appropriate shell
5. Output is streamed back and displayed in the terminal

## Key Components

### Frontend Components

#### 1. CmdInput (`src_new/components/workspace/cmdinput/cmdinput.tsx`)
- Main command input component
- Manages input state and UI interactions
- Handles special features like AI mode toggles

#### 2. TextAreaInput (`src_new/components/workspace/cmdinput/textareainput.tsx`)
- Actual text input field
- Handles keyboard events and shortcuts
- Manages command history navigation

#### 3. InputModel (`src_new/models/input.ts`)
- Stores input state (current line, history, modes)
- Methods:
  - `uiSubmitCommand()`: Processes and submits commands
  - `isEmpty()`: Checks if input is empty
  - `resetInput()`: Clears input after submission

### Command Submission Flow

1. **Enter Key Handling** (`textareainput.tsx:141`)
   ```typescript
   keybindManager.registerKeybinding("pane", "cmdinput", "generic:confirm", () => {
       if (GlobalModel.inputModel.isEmpty()) {
           // Currently prevents blank line submission
           // Focus first line if no input
       } else {
           GlobalModel.inputModel.uiSubmitCommand();
       }
   });
   ```

2. **Command Processing** (`input.ts:733`)
   ```typescript
   uiSubmitCommand(): void {
       let commandStr = this.curLine;
       if (commandStr.trim() == "") {
           return; // Prevents blank lines
       }
       // Add mode prefixes if needed
       // Reset input
       // Submit to GlobalModel
   }
   ```

3. **Backend Submission** (`model.ts:1632`)
   ```typescript
   submitCommand(metaCmd, metaSubCmd, args, kwargs, interactive, runUpdate)
   ```

### Command Types

1. **Regular Commands**: Direct shell commands (e.g., `ls`, `cd`)
2. **Meta Commands**: Special Wave commands starting with `/` (e.g., `/clear`, `/session`)
3. **Agent Mode**: Commands prefixed with `/agent` for AI execution
4. **Thread Mode**: Commands prefixed with `/thread` for AI conversation

### Line Types

Wave supports different line types in the terminal:
- `cmd`: Regular command lines with output
- `text`: Text-only lines (for notes, blank lines, etc.)
- `agent_mode`: AI agent command lines
- `thread_mode`: AI conversation lines
- `thread_mode_cmd`: Commands within thread mode

### Current Limitations

1. **No Blank Lines**: Empty input is currently blocked at two levels:
   - Enter key handler checks `isEmpty()` and doesn't submit
   - `uiSubmitCommand()` returns early if command is empty

2. **No Text-Only Lines**: No current mechanism to create text lines without commands

## Proposed Changes for Blank Line Support

To support blank lines, we need to:

1. Modify the Enter key handler to allow blank line submission
2. Update `uiSubmitCommand()` to handle empty commands
3. Create a mechanism to add text-only lines to the screen
4. Ensure the backend can handle blank line creation

The blank line should create a `text` line type with empty or minimal content, maintaining the terminal flow while allowing visual separation.