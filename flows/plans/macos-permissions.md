# macOS Permissions Implementation Plan

## Problem Description

### The Issue

Wave Terminal users on macOS experience repeated folder access permission dialogs that appear every time the application tries to access a folder, even after the user has already granted permission. This creates a poor user experience and interrupts workflow.

### Root Cause Analysis

The issue stems from several architectural problems in the old Wave Terminal implementation:

1. **Missing macOS Entitlements**: The application lacked proper macOS entitlements configuration, causing each file system operation to trigger a new permission dialog.

2. **Multiple Process Architecture**: The old architecture used separate Go processes (`waveshell` and `wavesrv`) that each requested file access permissions independently, leading to multiple permission dialogs.

3. **No Permission Caching**: Each `os.Stat()`, `os.Open()`, or `os.Chdir()` call triggered a new macOS security check without any caching mechanism.

4. **Improper Sandbox Configuration**: The Electron app wasn't properly configured for macOS sandboxing, causing the system to treat each file access as a new permission request.

5. **Direct File System Calls**: The backend code made direct file system calls without checking if permissions were already granted.

### Technical Details

The problematic code patterns in the old architecture:

```go
// Old problematic patterns that triggered permission dialogs
err := os.Chdir(cdPk.Dir)  // Direct system call
finfo, err := os.Stat(pk.Path)  // Direct file access
fd, err := os.Open(pk.Path)  // Direct file opening
```

## Solution Summary

### New Architecture Approach

The new Wave Terminal architecture solves this problem through several key improvements:

1. **Proper macOS Entitlements**: Configured proper entitlements in `build/entitlements.mac.plist` and `electron-builder.config.cjs`.

2. **Single Process Architecture**: Consolidated to a single `wavesrv` process with proper permission inheritance.

3. **Permission-Aware File Access**: Implemented smart permission checking that caches results and avoids repeated system calls.

4. **Modern Build System**: Upgraded to Electron Vite, TypeScript, and Jotai for better performance and development experience.

5. **Sandbox-Aware Patterns**: Used sandbox-aware file access patterns that respect macOS security model.

### Key Technical Solutions

#### Entitlements Configuration

```xml
<!-- build/entitlements.mac.plist -->
<key>com.apple.security.cs.allow-jit</key>
<true/>
<key>com.apple.security.cs.allow-unsigned-executable-memory</key>
<true/>
<key>com.apple.security.cs.disable-library-validation</key>
<true/>
```

#### Smart Permission Checking

```go
// New permission-aware pattern
func checkIsReadOnly(path string, fileInfo fs.FileInfo, exists bool) bool {
    if !exists || fileInfo.Mode().IsDir() {
        // Test write access by creating a temporary file
        tmpFileName := filepath.Join(dirName, "wsh-tmp-"+randHexStr)
        fd, err := os.Create(tmpFileName)
        if err != nil {
            return true
        }
        utilfn.GracefulClose(fd, "checkIsReadOnly", tmpFileName)
        os.Remove(tmpFileName)
        return false
    }
    // Test existing file write access
    file, err := os.OpenFile(path, os.O_WRONLY|os.O_APPEND, 0666)
    if err != nil {
        return true
    }
    utilfn.GracefulClose(file, "checkIsReadOnly", path)
    return false
}
```

## Implementation Plan

### Phase 1: Core Permission System (High Priority)

#### 1. Database Schema Design

**File**: `wavesrv/pkg/sstore/permissions.go`
**Description**: Design and implement the canonical permission table schema
**Requirements**:

-   Reference existing database patterns from `flows/databases.md`
-   Plan migrations under `wavesrv/db/migrations/`
-   Include columns: id, ownerid, path, consent, displayname, source, createdts, updatedts, expires_at, scope_level

```sql
CREATE TABLE permission_bookmarks (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    ownerid VARCHAR(36) NOT NULL,
    path TEXT NOT NULL,
    consent BOOLEAN NOT NULL DEFAULT 0,
    displayname VARCHAR(255) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'user',
    scope_level INTEGER NOT NULL DEFAULT 1,
    expires_at BIGINT,
    createdts BIGINT NOT NULL,
    updatedts BIGINT NOT NULL,
    archived BOOLEAN NOT NULL DEFAULT 0
);
CREATE INDEX idx_permission_bookmarks_ownerid ON permission_bookmarks (ownerid);
CREATE INDEX idx_permission_bookmarks_path ON permission_bookmarks (path);
CREATE INDEX idx_permission_bookmarks_consent ON permission_bookmarks (consent);
```

#### 2. Database Migration

**File**: `wavesrv/db/migrations/000000_permissions_bookmarks.up.sql`
**Description**: Create migration to add permission_bookmarks table
**Requirements**:

-   Add table creation SQL
-   Add indexes for performance
-   Include rollback migration in `.down.sql`

#### 3. Persistence API Implementation

**File**: `wavesrv/pkg/sstore/permissions.go`
**Description**: Implement permission storage and retrieval functions
**Functions to implement**:

-   `SavePermission(ctx, permission) error`
-   `GetPermissionByID(ctx, id) (*PermissionRecord, error)`
-   `FindPermissionForPath(ctx, path) (*PermissionRecord, error)`
-   `DeletePermission(ctx, id) error`
-   `ListPermissions(ctx, ownerid) ([]*PermissionRecord, error)`
-   `HasPermissionForPath(ctx, path) (allowed bool, record *PermissionRecord, err error)`

#### 4. HTTP/RPC Endpoints

**File**: `wavesrv/cmd/main-server.go`
**Description**: Add REST API endpoints for permission management
**Endpoints**:

-   `POST /api/permissions` - Create new permission
-   `GET /api/permissions?path=...` - Query permissions by path
-   `DELETE /api/permissions/:id` - Remove permission
-   `GET /api/permissions` - List all permissions for user

#### 5. Permission Check Integration

**File**: `pkg/wshrpc/wshremote/wshremote.go`
**Description**: Integrate permission checking into file operations
**Integration points**:

-   `fileInfoInternal()` function
-   `RemoteStreamFileCommand()`
-   `RemoteFileInfoCommand()`
-   `RemoteFileTouchCommand()`
-   `RemoteFileMoveCommand()`

### Phase 2: Shell Integration (High Priority)

#### 6. Waveshell Permission Integration

**File**: `waveshell/pkg/server/server.go`
**Description**: Update waveshell to consult permission API before file operations
**Integration points**:

-   `streamFile()` function
-   `writeFile()` function
-   `ProcessRpcPacket()` function
-   Directory change operations

**Status update**:

- Implemented: `waveshell/pkg/server/permissions.go` now calls `GET /api/permissions?path=...` on the local wavesrv server, reads `WAVETERM_HOME/waveterm.authkey` for `X-AuthKey`, enforces scope via `ValidateOperationScope`, and uses a short timeout (1s). The implementation currently fails-open if the server is unreachable to avoid blocking I/O; this can be changed to fail-closed.

#### 7. Structured Error Codes

**File**: `pkg/wshrpc/wshremote/wshremote.go`
**Description**: Add structured permission error codes
**Error codes to implement**:

-   `ERR_PERMISSION_REQUIRED` - Permission needed but not granted
-   `ERR_PERMISSION_NOT_GRANTED` - Permission explicitly denied
-   `ERR_PERMISSION_EXPIRED` - Permission has expired
-   `ERR_PERMISSION_SCOPE_LIMITED` - Permission scope insufficient

### Phase 3: UI and User Experience (Medium Priority)

#### 8. Electron Permission UI

**File**: `emain/emain.ts`
**Description**: Implement permission request UI flow
**Requirements**:

-   Add `ipcMain.handle("permissions:grant-folder", ...)`
-   Show `dialog.showOpenDialog` for user selection
-   POST permission record to wavesrv API
-   Handle permission denied scenarios

#### 9. Permission Management UI

**File**: `frontend/app/settings/permissions.tsx`
**Description**: Create settings page for permission management
**Features**:

-   List all granted permissions
-   Allow users to revoke permissions
-   Show permission details (path, granted date, scope)
-   Bulk permission operations

#### 10. Permission Request UX

**File**: `frontend/app/components/permission-request.tsx`
**Description**: Improve permission request user experience
**Features**:

-   Clear explanation of why permission is needed
-   Preview of affected directories
-   Option to grant limited scope
-   Remember user preference

### Phase 4: Security and Validation (High Priority)

#### 11. Permission Scope Validation

**File**: `wavesrv/pkg/sstore/permissions.go`
**Description**: Implement path validation to prevent permission escalation
**Validation rules**:

-   Prevent access to system directories (`/System`, `/Library`, etc.)
-   Validate path depth limits
-   Check for path traversal attacks
-   Validate permission inheritance

#### 12. Permission Inheritance Model

**File**: `wavesrv/pkg/sstore/permissions.go`
**Description**: Implement parent/child directory permission inheritance
**Logic**:

-   If parent directory has permission, child directories inherit
-   Allow explicit overrides for child directories
-   Handle permission conflicts (parent granted, child denied)

#### 13. Permission Expiration Mechanism

**File**: `wavesrv/pkg/sstore/permissions.go`
**Description**: Implement TTL for permissions
**Features**:

-   Set expiration time for permissions
-   Automatic cleanup of expired permissions
-   User notification before expiration
-   Option to extend permissions

#### 14. Permission Audit Trail

**File**: `wavesrv/pkg/sstore/permissions.go`
**Description**: Implement logging for security auditing
**Log events**:

-   Permission granted/denied
-   Permission revoked
-   Permission expired
-   Failed permission attempts

#### 20. Permission Debug Mode

**File**: `wavesrv/pkg/sstore/permissions.go`
**Description**: Add detailed logging for debugging
**Features**:

-   Detailed permission decision logging
-   Path matching debug info
-   Cache hit/miss logging
-   Performance timing

#### 23. Developer Documentation

**File**: `docs/macos-permissions.md`
**Description**: Document permission system for developers
**Content**:

-   Architecture overview
-   API documentation
-   Integration guide
-   Troubleshooting guide

## Success Criteria

1. **No Repeated Permission Dialogs**: Users should only see permission dialogs once per folder
2. **Proper Permission Persistence**: Permissions should persist across app restarts
3. **Security Compliance**: System should prevent unauthorized access
4. **Performance**: Permission checks should not significantly impact performance
5. **User Experience**: Permission requests should be clear and non-intrusive
6. **Cross-Platform**: System should work on macOS, Windows, and Linux
7. **Maintainability**: Code should be well-documented and testable

## Risk Mitigation

5. **User Communication**: Clear communication about permission system changes to users

## Conclusion

This implementation plan addresses the macOS permissions issue comprehensively by creating a robust, secure, and user-friendly permission system. The phased approach ensures that core functionality is implemented first, followed by security enhancements, testing, and platform compatibility. The solution maintains backward compatibility while providing a significantly improved user experience.
