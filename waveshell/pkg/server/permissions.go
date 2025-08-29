// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/abhishek944/waveterm/wavesrv/pkg/scbase"
)

// TODO: Phase 2.6 - Waveshell Permission Integration
// This file integrates permission checking into waveshell file operations

// PermissionError represents permission-related errors
type PermissionError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Path    string `json:"path"`
}

func (e *PermissionError) Error() string {
	return fmt.Sprintf("permission error [%s]: %s (path: %s)", e.Code, e.Message, e.Path)
}

// Permission error codes as defined in the plan
const (
	ErrPermissionRequired     = "ERR_PERMISSION_REQUIRED"
	ErrPermissionNotGranted   = "ERR_PERMISSION_NOT_GRANTED"
	ErrPermissionExpired      = "ERR_PERMISSION_EXPIRED"
	ErrPermissionScopeLimited = "ERR_PERMISSION_SCOPE_LIMITED"
)

// TODO: Phase 2.7 - Structured Error Codes

// CheckFilePermission checks if the current operation has permission to access the file
func (m *MServer) CheckFilePermission(ctx context.Context, path string, operation string) error {
	normalizedPath := filepath.Clean(path)

	// Only absolute paths are considered for permission checks
	if !filepath.IsAbs(normalizedPath) {
		return nil
	}

	// Build request to wavesrv permissions list endpoint
	// We rely on the local wavesrv HTTP server address; use dev vs prod port based on env
	serverAddr := os.Getenv("WAVETERM_SRV_ADDR")
	if serverAddr == "" {
		// default to dev/prod address based on WAVETERM_DEV
		if scbase.IsDevMode() {
			serverAddr = "http://127.0.0.1:8090"
		} else {
			serverAddr = "http://127.0.0.1:1619"
		}
	} else {
		// ensure scheme present
		if !(len(serverAddr) >= 7 && (serverAddr[:7] == "http://" || serverAddr[:8] == "https://")) {
			serverAddr = "http://" + serverAddr
		}
	}

	q := url.Values{}
	q.Set("path", normalizedPath)
	// call the dedicated check endpoint for a compact response
	reqUrl := fmt.Sprintf("%s/api/permissions/check?%s", serverAddr, q.Encode())

	client := &http.Client{Timeout: 1 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", reqUrl, nil)
	if err != nil {
		return fmt.Errorf("permission check request create failed: %w", err)
	}

	// Read auth key from WAVETERM_HOME/waveterm.authkey
	authKeyFile := filepath.Join(scbase.GetWaveHomeDir(), scbase.WaveAuthKeyFileName)
	authKeyBytes, err := os.ReadFile(authKeyFile)
	if err == nil {
		req.Header.Set("X-AuthKey", string(authKeyBytes))
	}

	resp, err := client.Do(req)
	if err != nil {
		// If server is unavailable, allow operation (fail-open) to avoid blocking
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("permission API returned status %d", resp.StatusCode)
	}

	var body struct {
		Success bool                   `json:"success"`
		Data    map[string]interface{} `json:"data"`
		Error   string                 `json:"error"`
	}
	dec := json.NewDecoder(resp.Body)
	if err := dec.Decode(&body); err != nil {
		return fmt.Errorf("failed to decode permission API response: %w", err)
	}

	if !body.Success {
		return &PermissionError{Code: ErrPermissionRequired, Message: "permission required (empty)", Path: normalizedPath}
	}

	data := body.Data
	allowed := false
	if v, ok := data["allowed"]; ok {
		if b, ok := v.(bool); ok {
			allowed = b
		}
	}
	if !allowed {
		return &PermissionError{Code: ErrPermissionRequired, Message: "no permission found", Path: normalizedPath}
	}

	// If op provided, validate scope using scopeLevel
	if v, ok := data["scopeLevel"]; ok {
		if f, ok := v.(float64); ok {
			scopeLevel := int(f)
			if err := m.ValidateOperationScope(ctx, normalizedPath, operation, scopeLevel); err != nil {
				return err
			}
		}
	}

	return nil
}

// TODO: Implement permission API integration
// func (m *MServer) queryPermissionAPI(ctx context.Context, path string, operation string) (bool, *PermissionRecord, error) {
//     // TODO: Make HTTP request to wavesrv /api/permissions endpoint
//     // TODO: Handle authentication and authorization
//     // TODO: Parse response and return permission status
//     return false, nil, fmt.Errorf("not implemented")
// }

// TODO: Phase 2.6 - Integration points

// CheckStreamFilePermission checks permission before streaming a file
func (m *MServer) CheckStreamFilePermission(ctx context.Context, path string) error {
	return m.CheckFilePermission(ctx, path, "read")
}

// CheckWriteFilePermission checks permission before writing to a file
func (m *MServer) CheckWriteFilePermission(ctx context.Context, path string) error {
	return m.CheckFilePermission(ctx, path, "write")
}

// CheckFileInfoPermission checks permission before getting file info
func (m *MServer) CheckFileInfoPermission(ctx context.Context, path string) error {
	return m.CheckFilePermission(ctx, path, "stat")
}

// CheckFileMovePermission checks permission before moving a file
func (m *MServer) CheckFileMovePermission(ctx context.Context, sourcePath, destPath string) error {
	// Check permissions for both source and destination
	err := m.CheckFilePermission(ctx, sourcePath, "read")
	if err != nil {
		return err
	}
	return m.CheckFilePermission(ctx, destPath, "write")
}

// TODO: Phase 4.11 - Permission Scope Validation

// ValidateOperationScope validates if the requested operation is within the granted scope
func (m *MServer) ValidateOperationScope(ctx context.Context, path string, operation string, scopeLevel int) error {
	// TODO: Implement scope validation
	// - Check if operation is allowed for the given scope level
	// - Validate path boundaries
	// - Check for operation restrictions

	switch operation {
	case "read":
		// Read operations are allowed for all scope levels
		return nil
	case "write":
		// Write operations require at least read-write scope
		if scopeLevel < 2 {
			return &PermissionError{
				Code:    ErrPermissionScopeLimited,
				Message: "Write operation requires read-write or full scope",
				Path:    path,
			}
		}
	case "delete":
		// Delete operations require full scope
		if scopeLevel < 3 {
			return &PermissionError{
				Code:    ErrPermissionScopeLimited,
				Message: "Delete operation requires full scope",
				Path:    path,
			}
		}
	default:
		return fmt.Errorf("unknown operation: %s", operation)
	}

	return nil
}

// TODO: Phase 4.12 - Permission Inheritance Model

// CheckInheritedPermission checks if a path inherits permission from a parent directory
func (m *MServer) CheckInheritedPermission(ctx context.Context, path string, operation string) (bool, error) {
	// TODO: Implement permission inheritance logic
	// - Check parent directories for permissions
	// - Handle inheritance conflicts
	// - Consider scope level inheritance

	// For now, return false (no inheritance implemented)
	return false, nil
}

// TODO: Phase 4.20 - Permission Debug Mode

// DebugPermissionCheck logs detailed information about permission checks
func (m *MServer) DebugPermissionCheck(ctx context.Context, path string, operation string, result bool, error error) {
	// TODO: Implement debug logging
	// - Log permission decision details
	// - Log path matching information
	// - Log cache hit/miss information
	// - Log performance timing

	// For now, this is a no-op
}
