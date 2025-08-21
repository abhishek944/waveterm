# Shell State Management in WaveTerm

## Overview

Shell state management is a critical component of terminal that tracks and maintains the state of shell sessions across different remotes (including local connections). The shell state includes environment variables, current working directory, shell type, and other session-specific information.

## Key Components

### 1. ShellState Structure (`packet.ShellState`)
The core structure that holds the complete state of a shell session:
- **Version**: State version for compatibility
- **ShellType**: Type of shell (bash, zsh, etc.)
- **Cwd**: Current working directory
- **ShellVars**: Serialized environment variables and shell declarations
- **Aliases**: Shell aliases
- **Functions**: Shell functions
- **Error**: Any error state

### 2. ShellStatePtr Structure (`packet.ShellStatePtr`)
A pointer to a shell state that uses content-addressable storage:
- **BaseHash**: Hash of the base shell state (required, cannot be empty)
- **DiffHashArr**: Array of hashes representing state differences/changes

### 3. Remote Instance (`sstore.RemoteInstance`)
Tracks the state for a specific remote connection within a session/screen:
- **StateBaseHash**: The base hash of the current shell state
- **StateDiffHashArr**: Array of diff hashes applied on top of base state
- **ShellType**: The type of shell for this instance

## State Storage Architecture

### Content-Addressable Storage
Shell states are stored using a content-addressable system where:
1. Each complete shell state is hashed and stored in the `state_base` table
2. State differences are stored in the `state_diff` table
3. States are referenced by their hash values, allowing deduplication

### Database Tables
- **state_base**: Stores complete shell states indexed by hash
- **state_diff**: Stores incremental changes to shell states
- **remote_instance**: Links sessions/screens to their current shell state

## State Lifecycle

### 1. Initial State Creation
When a new remote connection is established:
- The waveshell process captures the initial shell state
- This state is hashed and stored in `state_base`
- The remote instance is updated with the state hash

### 2. State Updates
When shell state changes (cd, export, etc.):
- Changes can be stored as a new base state or as a diff
- Diffs are more efficient for small changes
- The remote instance's state pointers are updated

### 3. State Retrieval
When running a command:
1. Get the remote instance's state pointer (BaseHash + DiffHashArr)
2. Load the base state from `state_base` table
3. Apply any diffs from `state_diff` table in order
4. Return the complete current state

## Common Issues and Solutions

### Empty BaseHash Error
**Problem**: "invalid empty basehash" error occurs when:
- A remote instance exists but has no state initialized
- The state was lost or corrupted
- Commands were created before proper state initialization

**Solutions**:
1. Check if StatePtr has valid BaseHash before use
2. Request fresh state from waveshell if BaseHash is empty
3. Handle gracefully when state is unavailable

### State Synchronization
- State must be synchronized between waveshell and the database
- Lost connections can lead to state inconsistencies
- Restart commands may fail if state is missing

## Code Flow for Command Execution

1. **LineRestartCommand** (or similar command):
   - Retrieves stored command with its StatePtr
   - Checks if StatePtr has valid BaseHash
   - Passes to RunCommand

2. **RunCommand**:
   - Gets or uses provided StatePtr
   - Retrieves full state using GetFullState
   - Handles empty BaseHash by requesting fresh state
   - Creates command record with current state

3. **GetFullState**:
   - Validates BaseHash is not empty
   - Loads base state from database
   - Applies any diffs in order
   - Returns complete shell state

## Best Practices

1. **Always validate BaseHash**: Never assume a StatePtr has a valid BaseHash
2. **Handle missing state gracefully**: Provide fallbacks or request fresh state
3. **Log state operations**: Add debug logging for state-related operations
4. **Maintain state consistency**: Ensure database and waveshell states are synchronized

## Debugging Shell State Issues

1. **Check Remote Instance**:
   ```sql
   SELECT * FROM remote_instance WHERE sessionid = ? AND remoteid = ?;
   ```

2. **Verify State Exists**:
   ```sql
   SELECT * FROM state_base WHERE basehash = ?;
   ```

3. **Common Debug Points**:
   - GetRemoteStatePtr: Check if remote instance has StateBaseHash
   - GetFullState: Verify BaseHash is not empty
   - RunCommand: Ensure StatePtr is properly initialized

## New Tab Working Directory Inheritance

### Overview
When creating a new tab in Wave Terminal, the tab inherits the working directory from the last executed command in the current tab. This ensures a seamless workflow where users don't lose their context when opening new tabs.

### Implementation Flow

1. **Frontend (onNewTab)**:
   - The frontend no longer passes cwd - the backend handles directory resolution

2. **Backend (ScreenOpenCommand)**:
   - First attempts to get cwd from the current remote instance's feState
   - If unavailable, calls `GetLastCmdCwd` to retrieve cwd from the last executed command
   - Passes the cwd to `InsertScreen` via `ScreenCreateOpts`

3. **Tab Creation (doNewTabConnectLocal)**:
   - Receives the initial cwd from ScreenOpenCommand
   - Passes it through to `CrCommand` via kwargs

4. **Shell Initialization (doAsyncResetCommand)**:
   - When the shell is initialized (ReInit), it starts in the home directory by default
   - If an initial cwd is specified and differs from the shell's cwd:
     - Creates a `ShellStateDiff` with the desired cwd
     - Updates the feState to reflect the new directory
     - The state diff is applied to change the shell's working directory state
   - Important: Only state OR diff can be passed to UpdateRemoteState, not both

### Key Components

- **GetLastCmdCwd**: Queries the database for the most recent completed command and extracts cwd from its feState JSON
- **ShellStateDiff**: Used to apply working directory changes without executing a cd command
- **UpdateRemoteState**: Applies either a new state OR a state diff to update the remote instance

### Technical Details

The solution uses Wave Terminal's state management system rather than executing shell commands. This approach:
- Avoids executing a `cd` command after tab creation
- Ensures the shell starts with the correct working directory in its state
- Maintains consistency between the UI state (feState) and shell state

## Future Improvements

1. **Automatic State Recovery**: Detect and recover from missing state
2. **State Validation**: Validate state integrity on load
3. **Better Error Messages**: Provide more context when state errors occur
4. **State Garbage Collection**: Clean up orphaned states

## Simplified Architectural Overview

This section provides a high-level, simplified explanation of WaveTerm's architecture, focusing on shell state, remote instances, and the end-to-end flow.

### The Core Concepts Explained

Think of a terminal session as a conversation. The concepts below are how WaveTerm remembers and manages that conversation for each tab you have open.

#### 1. What is "Shell State"?

In simple terms, the **Shell State is the shell's memory**. It's a complete snapshot of everything that defines your shell's current environment in a specific tab.

This "memory" includes:
*   **Current Working Directory (Cwd):** Where you are right now (e.g., `/home/user/projects`).
*   **Environment Variables:** All the `EXPORT` variables that programs use (e.g., `PATH`, `HOME`).
*   **Aliases and Functions:** Any custom shortcuts or functions you've defined in that session.
*   **Shell Type:** Whether you're using `bash`, `zsh`, etc.

Without saving the Shell State, every new command would run in a fresh, forgetful environment. By tracking it, WaveTerm ensures that when you run a command, it executes in the correct directory with the right variables, just like a normal terminal.

#### 2. What is a "Remote Instance" and "Remote Status"?

The term "remote" can be a bit confusing here. In WaveTerm, **a "remote" is any shell environment you are connected to**. This includes your local machine's shell.

*   **Remote Instance:** This is a **tracker** for a single shell session. Every tab in WaveTerm has its own Remote Instance. This tracker doesn't hold the full Shell State itself; instead, it holds *pointers* to the state. Think of it like a bookmark that tells WaveTerm, "For Tab 1, here is the memory you need to use."

*   **Remote Status:** This is the overall **live status** of a connection in a tab, which is determined by its Remote Instance and the Shell State it points to. It's the combination of "who this tab is" (the instance) and "what it remembers" (the state).

#### How State is Stored: The Smart Way (like Git)

WaveTerm is very clever about how it saves this "memory." Instead of saving the entire, massive Shell State every time you type a command, it uses a system similar to Git.

1.  **Base State (The Full Snapshot):** When you first open a tab, WaveTerm takes a full snapshot of the shell's memory. This is the "Base State" and it's stored and identified by a unique hash (`BaseHash`).
2.  **Diffs (The Small Changes):** When you run a command like `cd ../` or `export FOO=bar`, the memory changes slightly. Instead of creating a whole new snapshot, WaveTerm just records the *difference* (a "diff"). This diff also gets a unique hash.
3.  **Putting it Together:** The **Remote Instance** (the tracker for your tab) keeps a record of the initial snapshot (`StateBaseHash`) and a list of all the small changes that have happened since (`StateDiffHashArr`).

When you run a new command, WaveTerm retrieves the full state by:
1.  Loading the base snapshot.
2.  Applying each small change (diff) in order.
3.  This reconstructs the exact, up-to-date memory for your shell, efficiently and without storing tons of duplicate data.

---

### End-to-End Code Formulation: How It All Works Together

Here is a step-by-step flow of what happens when you use the terminal, from you typing a command to seeing the output.

#### Step 1: The Frontend UI (`/src`) - The Face

This is what you see and interact with. It's a desktop application built with **Electron**, and the user interface is built with **React**.
*   When you type in a terminal tab, you are typing into an `xterm.js` component.
*   When you hit Enter, the React application sends your command over a **WebSocket** connection to the backend.

#### Step 2: The Backend Server (`/wavesrv`) - The Brain

This is the central Go application that orchestrates everything.
*   It receives the command from the frontend via the WebSocket.
*   It looks up the **Remote Instance** associated with your current tab to figure out what the shell's current "memory" (Shell State) is.
*   It doesn't run the shell command itself. For that, it delegates to a specialist.

#### Step 3: The Shell Service (`/waveshell`) - The Hands

This is a separate, specialized Go program whose only job is to manage and interact with actual shells (`bash`, `zsh`, etc.).
*   The `wavesrv` (Brain) sends the command *and* the reconstructed Shell State (the memory) to `waveshell`.
*   `waveshell` uses a pseudo-terminal (PTY) to run the command in the correct environment.
*   It captures the output of the command and, crucially, it also captures the **new Shell State** after the command finishes (e.g., if the directory changed).
*   It sends the command output and the new state information back to the `wavesrv` (Brain).

#### Step 4: The Data Layer (SQLite) - The Long-Term Memory

*   The `wavesrv` receives the result and the new state from `waveshell`.
*   It saves the new state to the SQLite database, likely as a small "diff".
*   It updates the **Remote Instance** for your tab to point to this new diff, so the next command will use the updated memory.
*   It streams the command's output back to the Frontend UI via the WebSocket.

#### Step 5: Back to the Frontend

*   The React application receives the output and displays it in your terminal tab.
*   Your prompt might update to show the new directory, and the whole cycle is ready to begin again.

### Summary

In essence, WaveTerm is a sophisticated system where:

1.  A **React UI** captures your input.
2.  A central **Go server (`wavesrv`)** manages sessions and state.
3.  A specialized **Go service (`waveshell`)** executes commands in a real shell.
4.  A **SQLite database** cleverly stores the "memory" of each tab using a snapshot-and-diffs system.

This architecture allows WaveTerm to provide a rich, modern UI with AI features while ensuring that the core terminal functionality is robust, persistent, and efficient.
