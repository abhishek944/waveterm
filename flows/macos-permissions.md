# macOS Permissions System Documentation

## Overview

The macOS Permissions System in Wave Terminal addresses the issue of repeated permission dialogs by implementing a comprehensive permission management system that caches user consent and provides granular control over file system access.

## Architecture

### Core Components

1. **Database Layer** (`wavesrv/pkg/sstore/permissions.go`)

    - Permission storage and retrieval
    - Path validation and security checks
    - Permission inheritance logic
    - Audit trail and logging

2. **API Layer** (`wavesrv/cmd/main-server.go`)

    - REST endpoints for permission management
    - Permission validation and enforcement
    - Integration with existing authentication

3. **Shell Integration** (`waveshell/pkg/server/permissions.go`)

    - Permission checking before file operations
    - Structured error codes for permission failures
    - Integration with existing file operation handlers

4. **UI Layer** (`src_new/components/permissions/`)

    - Permission request dialogs
    - Settings page for permission management
    - Modern, accessible user interface

5. **Electron Integration** (`src_new/electron/emain.ts`)
    - IPC handlers for permission management
    - Native folder selection dialogs
    - Integration with wavesrv API

## Database Schema

### permission_bookmarks Table

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
```

### Indexes

-   `idx_permission_bookmarks_ownerid` - Fast user permission queries
-   `idx_permission_bookmarks_path` - Fast path-based lookups
-   `idx_permission_bookmarks_consent` - Filter by consent status
-   `idx_permission_bookmarks_path_consent` - Composite index for permission checks
-   `idx_permission_bookmarks_ownerid_archived` - User's active permissions

## API Endpoints

### POST /api/permissions

Create a new permission record.

**Request Body:**

```json
{
    "path": "/path/to/folder",
    "consent": true,
    "displayName": "My Documents",
    "source": "user",
    "scopeLevel": 2,
    "expiresAt": 1640995200
}
```

**Response:**

```json
{
    "success": true,
    "data": {
        "id": "uuid",
        "path": "/path/to/folder",
        "consent": true,
        "displayName": "My Documents",
        "source": "user",
        "scopeLevel": 2,
        "createdTS": 1640995200,
        "updatedTS": 1640995200
    }
}
```

### GET /api/permissions

List all permissions for the current user.

**Query Parameters:**

-   `path` (optional) - Filter by specific path
-   `source` (optional) - Filter by permission source
-   `scope` (optional) - Filter by scope level

**Response:**

```json
{
    "success": true,
    "data": [
        {
            "id": "uuid",
            "path": "/path/to/folder",
            "consent": true,
            "displayName": "My Documents",
            "source": "user",
            "scopeLevel": 2,
            "createdTS": 1640995200,
            "updatedTS": 1640995200
        }
    ]
}
```

### DELETE /api/permissions/{id}

Revoke a permission by marking it as archived.

**Response:**

```json
{
    "success": true
}
```

## Permission Scope Levels

1. **Read Only (1)** - Can read files and list directories
2. **Read & Write (2)** - Can read, write, and create files
3. **Full Access (3)** - Can read, write, delete, and modify permissions

## Permission Sources

-   **user** - Explicitly granted by user
-   **system** - Automatically granted by system
-   **inherited** - Inherited from parent directory

## Integration Guide

### Adding Permission Checks to File Operations

1. **In waveshell server functions:**

```go
func (m *MServer) streamFile(pk *packet.StreamFilePacketType) {
    // Check permission before file access
    err := m.CheckStreamFilePermission(context.Background(), pk.Path)
    if err != nil {
        resp := packet.MakeStreamFileResponse(pk.ReqId)
        resp.Error = fmt.Sprintf("permission denied: %v", err)
        m.Sender.SendPacket(resp)
        return
    }

    // Proceed with file operation
    // ... existing code ...
}
```

2. **In frontend components:**

```typescript
import { PermissionRequest } from "@/components/permissions";

const handleFileAccess = async (path: string) => {
    try {
        // Attempt file operation
        await performFileOperation(path);
    } catch (error) {
        if (error.code === "ERR_PERMISSION_REQUIRED") {
            // Show permission request dialog
            setShowPermissionRequest(true);
        }
    }
};
```

### Permission Request Flow

1. User attempts file operation
2. System checks for existing permission
3. If no permission exists, show permission request dialog
4. User grants or denies permission
5. Permission is saved to database
6. File operation proceeds or fails based on user choice

## Security Considerations

### Path Validation

-   All paths are normalized using `filepath.Clean()`
-   Path traversal attacks are prevented
-   System directories are protected
-   Path depth limits are enforced

### Permission Inheritance

-   Child directories inherit parent permissions
-   Explicit child permissions override inherited ones
-   Permission conflicts are resolved in favor of more restrictive settings

### Audit Trail

-   All permission changes are logged
-   Failed permission attempts are recorded
-   Expired permissions are automatically cleaned up

## Error Codes

-   `ERR_PERMISSION_REQUIRED` - Permission needed but not granted
-   `ERR_PERMISSION_NOT_GRANTED` - Permission explicitly denied
-   `ERR_PERMISSION_EXPIRED` - Permission has expired
-   `ERR_PERMISSION_SCOPE_LIMITED` - Permission scope insufficient

## Performance Considerations

### Caching

Notes on waveshell integration:

- The waveshell `CheckFilePermission` performs an HTTP `GET /api/permissions?path=...` on the local wavesrv server (configurable via `WAVETERM_SRV_ADDR`).
- It reads the `X-AuthKey` from the file `WAVETERM_HOME/waveterm.authkey` (created or read by the server) and sets it on the request.
- The check uses a short HTTP timeout and, as a pragmatic choice, will fail-open (allow operations) if the server is unreachable to avoid blocking terminal IO. This can be changed to fail-closed if stricter security is desired.

-   Frequently accessed permissions are cached in memory
-   Cache invalidation on permission changes
-   Database queries are optimized with proper indexes

### Batch Operations

-   Multiple permission checks can be batched
-   Bulk permission operations are supported
-   Background cleanup of expired permissions

## Testing

### Unit Tests

```go
func TestPermissionValidation(t *testing.T) {
    tests := []struct {
        path    string
        wantErr bool
    }{
        {"/valid/path", false},
        {"/path/with/../traversal", true},
        {"/System/forbidden", true},
    }

    for _, tt := range tests {
        err := ValidatePermissionPath(tt.path)
        if (err != nil) != tt.wantErr {
            t.Errorf("ValidatePermissionPath(%q) = %v, wantErr %v", tt.path, err, tt.wantErr)
        }
    }
}
```

### Integration Tests

-   Test permission flow end-to-end
-   Test permission inheritance
-   Test permission expiration
-   Test UI interactions

## Troubleshooting

### Common Issues

1. **Permission dialogs still appearing**

    - Check if permission is properly saved in database
    - Verify permission path matches exactly
    - Check for permission expiration

2. **Permission denied errors**

    - Verify permission scope level is sufficient
    - Check if permission has expired
    - Verify path is within granted directory

3. **Performance issues**
    - Check database indexes are properly created
    - Monitor permission cache hit rates
    - Review permission query patterns

### Debug Mode

Enable debug logging by setting the environment variable:

```bash
export WAVETERM_PERMISSION_DEBUG=1
```

This will log detailed permission decision information to help diagnose issues.

## Migration Guide

### From Old System

1. Run database migration to create permission_bookmarks table
2. Existing file access patterns will continue to work
3. New permission system will be used for new operations
4. Gradually migrate existing code to use permission checks

### Database Migration

```bash
# Run migration
cd wavesrv
go run cmd/main-server.go --migrate-up

# Verify migration
go run cmd/main-server.go --migrate-status
```

## Future Enhancements

1. **Permission Templates** - Predefined permission sets for common scenarios
2. **Temporary Permissions** - Time-limited access for one-time operations
3. **Permission Groups** - Group permissions by project or workspace
4. **Advanced Inheritance** - More sophisticated inheritance rules
5. **Permission Analytics** - Usage statistics and insights

## Contributing

When contributing to the permissions system:

1. Follow the existing code patterns
2. Add comprehensive tests
3. Update documentation
4. Consider security implications
5. Test on multiple platforms

## Support

For issues related to the permissions system:

1. Check the troubleshooting section
2. Enable debug logging
3. Review the audit trail
4. Check system logs
5. Create an issue with detailed information
