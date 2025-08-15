# Connections Architecture and Flow

This document provides a comprehensive overview of the connections functionality in Terminal, detailing how remote connections are managed, displayed, and integrated with the backend.

## Overview

The connections feature in Terminal allows users to manage remote connections (SSH, local, etc.) through a dedicated view accessible from the main sidebar. It provides functionality to create, edit, view, and archive connections with real-time status updates.

## Component Architecture

### Main Components

#### 1. ConnectionsView Component (`src_new/components/connections/connections.tsx`)

The primary UI component that renders the connections interface.

**Key Features:**
- Displays connections in a table format with columns for status, name, and type
- Filters out archived connections from display
- Provides buttons for "New Connection" and "Import Config"
- Shows connection status with color-coded indicators:
  - Green (#58C142) - Connected
  - Yellow (#FFA500) - Connecting/Auth Required  
  - Red (#CC0000) - Error
  - Grey (#757575) - Disconnected

**Key Methods:**
- `handleAddConnection()` - Opens modal to add new connection (calls `RemotesModel.openAddModal()`)
- `handleImportSshConfig()` - Triggers SSH config import (calls `GlobalCommandRunner.importSshConfig()`)
- `handleRead(remote: RemoteType)` - Opens modal to view connection details (calls `RemotesModel.openReadModal()`)
- `getStatus(status: string)` - Maps connection status to appropriate color

### State Management

#### 1. GlobalModel (`src_new/models/model.ts`)

Maintains the global state for all remotes.

**Key Properties:**
- `remotes: OArr<RemoteType>` - Observable array of all remote connections
- `remoteMap: Map<string, RemoteType>` - Map for quick remote lookup by ID

**Key Methods:**
- `updateRemotes(remotes: RemoteType[])` - Updates the entire remotes array
- `getRemote(remoteId: string)` - Retrieves a specific remote by ID
- `getRemoteNames()` - Returns array of remote names for quick reference
- `getRemoteByName(alias: string)` - Finds remote by canonical name

#### 2. RemotesModel (`src_new/models/remotes.ts`)

Manages remote-specific UI state and operations.

**Key Properties:**
- `selectedRemoteId: string` - Currently selected remote
- `remoteEdit: RemoteEditType` - Modal state for add/edit operations
- `termWrap: TermWrap` - Terminal wrapper for remote sessions

**Key Methods:**
- `openAddModal()` - Opens modal for adding new connection
- `openEditModal(remoteId: string, hideFields?: Record<string,boolean>)` - Opens edit modal with field visibility control
- `openReadModal(remoteId: string)` - Opens read-only modal for viewing connection details
- `createTermWrap(elem: HTMLElement)` - Creates terminal instance for remote connection
- `receiveData(remoteId: string, data: Uint8Array, eof: boolean)` - Handles incoming terminal data

#### 3. ConnectionsViewModel (`src_new/models/connectionsview.ts`)

Simple view model controlling the connections view visibility.

**Key Methods:**
- `showConnectionsView()` - Sets view visibility to true
- `closeView()` - Hides the connections view

## Backend Integration

### Command Structure

All backend communication uses the command submission pattern through `GlobalModel.submitCommand()`.

**Primary Commands:**
- `remote set` - Create or update remote configuration
- `remote archive` - Archive a remote connection (soft delete)
- `remote parse` - Import SSH configuration from file

### Data Flow

1. **Frontend to Backend:**
   ```typescript
   // Example: Creating a new connection
   GlobalModel.submitCommand({
     cmdstr: "remote set",
     kwargs: {
       alias: "my-server",
       host: "example.com",
       user: "admin"
     }
   });
   ```

2. **Backend to Frontend:**
   - Backend sends updates via WebSocket
   - Updates are processed in `Model.runUpdate()`
   - Remote updates trigger `GlobalModel.updateRemotes()` or individual remote updates

### Connection Status Updates

The backend continuously monitors connection status and sends updates:
- `status: "connected"` - Active connection
- `status: "disconnected"` - No active connection
- `status: "connecting"` - Connection in progress
- `status: "error"` - Connection failed
- `status: "auth-required"` - Needs authentication

## Integration with Sidebar

The connections view is accessible through the main sidebar:

### MainSideBar Component (`src_new/components/sidebar/main.tsx`)

**Connection Access:**
- `handleConnectionsClick()` - Triggered when connections button is clicked
- Calls `GlobalCommandRunner.connectionsView()` to show connections
- Updates sidebar state to reflect active view

### Navigation Flow

1. User clicks connections icon in sidebar
2. `MainSideBar.handleConnectionsClick()` is called
3. `GlobalCommandRunner.connectionsView()` is executed
4. `ConnectionsViewModel.showConnectionsView()` makes the view visible
5. `ConnectionsView` component renders with current remote data

## Command Runner Integration

### GlobalCommandRunner (`src_new/models/commandrunner.ts`)

Provides high-level methods for connection operations:

**Key Methods:**
- `connectionsView()` - Shows connections view
- `openEditRemote(remoteId: string, hideFields?: Record<string,boolean>)` - Opens edit modal
- `importSshConfig()` - Triggers SSH config import
- `archiveRemote(remoteId: string)` - Archives a connection

## Data Types

### RemoteType

The primary data structure for remote connections:

```typescript
interface RemoteType {
    remoteid: string;           // Unique identifier
    remotetype: string;         // Connection type (ssh, local, etc.)
    remotealias: string;        // User-friendly name
    remotecanonicalname: string; // Full connection string
    remoteuser: string;         // Username
    remotehost: string;         // Hostname/IP
    status: string;             // Connection status
    connectmode: string;        // Connection method
    autoinstall: boolean;       // Auto-install Wave
    archived: boolean;          // Soft delete flag
    remoteopts: RemoteOptsType; // Additional options
    sshconfigsrc: string;       // SSH config source
    shellpref: string;          // Preferred shell
    initpk: string;             // Initial packet
}
```

### RemoteEditType

Modal state for add/edit operations:

```typescript
interface RemoteEditType {
    remoteid?: string;          // Remote being edited
    errorstr?: string;          // Error message
    infostr?: string;           // Info message
    haspassword?: boolean;      // Password field state
    showpassword?: boolean;     // Password visibility
    hidefields?: Record<string, boolean>; // Field visibility
}
```

## Usage Patterns

### Adding a New Connection

1. User clicks "New Connection" button
2. `ConnectionsView.handleAddConnection()` is called
3. `RemotesModel.openAddModal()` opens the modal
4. User fills in connection details
5. Form submission triggers `remote set` command
6. Backend creates connection and sends update
7. UI refreshes with new connection

### Importing SSH Config

1. User clicks "Import Config" button
2. `ConnectionsView.handleImportSshConfig()` is called
3. `GlobalCommandRunner.importSshConfig()` triggers import
4. Backend parses SSH config file
5. New connections are created for each host
6. UI updates with imported connections

### Viewing Connection Details

1. User clicks on a connection row
2. `ConnectionsView.handleRead()` is called
3. `RemotesModel.openReadModal()` opens read-only modal
4. Connection details are displayed
5. User can edit or close modal

## Best Practices

1. **State Management**: All remote state is centralized in GlobalModel for consistency
2. **Command Pattern**: All backend operations use the command submission pattern
3. **Observable Pattern**: MobX observables ensure UI stays in sync with state
4. **Error Handling**: Connection errors are displayed with appropriate status colors
5. **Soft Delete**: Connections are archived rather than deleted for data recovery

## Future Enhancements

Based on the current implementation, potential improvements include:
- Bulk operations on connections
- Connection grouping/folders
- Connection health monitoring
- SSH key management UI
- Connection templates