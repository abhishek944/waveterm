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

## Future Improvements

1. **Automatic State Recovery**: Detect and recover from missing state
2. **State Validation**: Validate state integrity on load
3. **Better Error Messages**: Provide more context when state errors occur
4. **State Garbage Collection**: Clean up orphaned states