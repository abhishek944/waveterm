// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package sstore

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// PermissionRecord represents a permission bookmark in the database
type PermissionRecord struct {
	ID          string `db:"id" json:"id"`
	OwnerID     string `db:"ownerid" json:"ownerid"`
	Path        string `db:"path" json:"path"`
	Consent     bool   `db:"consent" json:"consent"`
	DisplayName string `db:"displayname" json:"displayname"`
	Source      string `db:"source" json:"source"`
	ScopeLevel  int    `db:"scope_level" json:"scope_level"`
	ExpiresAt   *int64 `db:"expires_at" json:"expires_at"`
	CreatedTS   int64  `db:"createdts" json:"createdts"`
	UpdatedTS   int64  `db:"updatedts" json:"updatedts"`
	Archived    bool   `db:"archived" json:"archived"`
}

// PermissionScope represents the scope level of a permission
const (
	ScopeLevelReadOnly  = 1
	ScopeLevelReadWrite = 2
	ScopeLevelFull      = 3
)

// PermissionSource represents the source of a permission
const (
	PermissionSourceUser      = "user"
	PermissionSourceSystem    = "system"
	PermissionSourceInherited = "inherited"
)

// TODO: Phase 1.1 - Database Schema Design
// The permission_bookmarks table schema is defined in the migration file:
// wavesrv/db/migrations/000038_permissions_bookmarks.up.sql

// TODO: Phase 1.3 - Persistence API Implementation

// SavePermission saves a new permission record to the database
func SavePermission(ctx context.Context, permission *PermissionRecord) error {
	// Validate the permission path for security concerns
	if err := ValidatePermissionPath(permission.Path); err != nil {
		return fmt.Errorf("invalid permission path: %w", err)
	}

	// Set defaults
	if permission.DisplayName == "" {
		permission.DisplayName = filepath.Base(permission.Path)
	}
	if permission.Source == "" {
		permission.Source = PermissionSourceUser
	}

	if permission.ID == "" {
		permission.ID = uuid.New().String()
	}

	now := time.Now().Unix()
	if permission.CreatedTS == 0 {
		permission.CreatedTS = now
	}
	permission.UpdatedTS = now

	query := `
		INSERT INTO permission_bookmarks 
		(id, ownerid, path, consent, displayname, source, scope_level, expires_at, createdts, updatedts, archived)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	db, err := GetDB(ctx)
	if err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, query,
		permission.ID, permission.OwnerID, permission.Path, permission.Consent,
		permission.DisplayName, permission.Source, permission.ScopeLevel,
		permission.ExpiresAt, permission.CreatedTS, permission.UpdatedTS, permission.Archived)

	return err
}

// GetPermissionByID retrieves a permission record by its ID
func GetPermissionByID(ctx context.Context, id string) (*PermissionRecord, error) {
	// TODO: Phase 4.20 - Permission Debug Mode
	// Add caching layer for frequently accessed permissions

	var permission PermissionRecord
	query := `SELECT * FROM permission_bookmarks WHERE id = ? AND archived = 0`
	db, err := GetDB(ctx)
	if err != nil {
		return nil, err
	}
	err = db.GetContext(ctx, &permission, query, id)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	// Cache the permission for future lookups
	if permission.ID != "" {
		cache := GetPermissionCache()
		cache.Set(permission.Path, &permission)
	}

	return &permission, nil
}

// FindPermissionForPath finds the most specific permission for a given path
func FindPermissionForPath(ctx context.Context, path string) (*PermissionRecord, error) {
	// TODO: Phase 1.3 - Persistence API Implementation
	// Check cache first, then database, then inheritance

	// Normalize the path
	normalizedPath := filepath.Clean(path)

	// Check cache first
	cache := GetPermissionCache()
	if cachedPermission, exists := cache.Get(normalizedPath); exists {
		return cachedPermission, nil
	}

	// First try exact match from database
	var permission PermissionRecord
	query := `SELECT * FROM permission_bookmarks WHERE path = ? AND archived = 0 AND consent = 1 ORDER BY scope_level DESC LIMIT 1`
	db, err := GetDB(ctx)
	if err != nil {
		return nil, err
	}
	err = db.GetContext(ctx, &permission, query, normalizedPath)
	if err == nil {
		// Cache the found permission
		cache.Set(normalizedPath, &permission)
		return &permission, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}

	// If no exact match, check for inherited permissions
	inheritedPermission, err := GetInheritedPermission(ctx, normalizedPath)
	if err != nil {
		return nil, err
	}

	// Cache inherited permission if found
	if inheritedPermission != nil {
		cache.Set(normalizedPath, inheritedPermission)
	}

	return inheritedPermission, nil
}

// DeletePermission marks a permission as archived
func DeletePermission(ctx context.Context, id string) error {
	// TODO: Add audit logging for permission deletion

	query := `UPDATE permission_bookmarks SET archived = 1, updatedts = ? WHERE id = ?`
	db, err := GetDB(ctx)
	if err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, query, time.Now().Unix(), id)
	return err
}

// ListPermissions lists all permissions for a given owner
func ListPermissions(ctx context.Context, ownerID string) ([]*PermissionRecord, error) {
	// TODO: Add pagination support
	// TODO: Add filtering options (by source, scope, etc.)

	var permissions []*PermissionRecord
	query := `SELECT * FROM permission_bookmarks WHERE ownerid = ? AND archived = 0 ORDER BY createdts DESC`
	db, err := GetDB(ctx)
	if err != nil {
		return nil, err
	}
	err = db.SelectContext(ctx, &permissions, query, ownerID)
	return permissions, err
}

// HasPermissionForPath checks if there's a valid permission for the given path
func HasPermissionForPath(ctx context.Context, path string) (allowed bool, record *PermissionRecord, err error) {
	// TODO: Phase 4.20 - Permission Debug Mode
	// Permission caching implemented, add performance monitoring

	permission, err := FindPermissionForPath(ctx, path)
	if err != nil {
		DebugPermissionCheck(ctx, path, false, nil)
		return false, nil, err
	}

	if permission == nil {
		DebugPermissionCheck(ctx, path, false, nil)
		return false, nil, nil
	}

	// Check if permission has expired
	if permission.ExpiresAt != nil && *permission.ExpiresAt < time.Now().Unix() {
		// TODO: Phase 4.13 - Permission Expiration Mechanism
		// Auto-cleanup expired permissions
		cache := GetPermissionCache()
		cache.Invalidate(path)
		DebugPermissionCheck(ctx, path, false, permission)
		return false, nil, nil
	}

	result := permission.Consent
	DebugPermissionCheck(ctx, path, result, permission)
	return result, permission, nil
}

// TODO: Phase 4.11 - Permission Scope Validation

// ValidatePermissionPath validates a path for security concerns
func ValidatePermissionPath(path string) error {
	// TODO: Phase 4.11 - Permission Scope Validation
	// Comprehensive path validation for security

	normalizedPath := filepath.Clean(path)

	// Check for path traversal
	if strings.Contains(normalizedPath, "..") {
		return fmt.Errorf("path traversal not allowed: %s", path)
	}

	// Check for system directories (macOS specific)
	systemDirs := []string{
		"/System", "/Library", "/bin", "/sbin", "/usr/bin", "/usr/sbin",
		"/private/var", "/private/etc", "/private/tmp",
	}

	for _, sysDir := range systemDirs {
		if strings.HasPrefix(normalizedPath, sysDir) {
			return fmt.Errorf("access to system directory not allowed: %s", path)
		}
	}

	// Check path depth limits (prevent extremely deep paths)
	pathParts := strings.Split(normalizedPath, string(filepath.Separator))
	if len(pathParts) > 50 {
		return fmt.Errorf("path too deep: %s", path)
	}

	// Check for absolute paths only (relative paths could be problematic)
	if !filepath.IsAbs(normalizedPath) {
		return fmt.Errorf("only absolute paths are allowed: %s", path)
	}

	// Check for empty or root path
	if normalizedPath == "" || normalizedPath == "/" {
		return fmt.Errorf("invalid path: %s", path)
	}

	return nil
}

// TODO: Phase 4.12 - Permission Inheritance Model

// GetInheritedPermission checks if a path inherits permission from a parent directory
func GetInheritedPermission(ctx context.Context, path string) (*PermissionRecord, error) {
	// TODO: Phase 4.12 - Permission Inheritance Model
	// Check parent directories for permissions

	normalizedPath := filepath.Clean(path)

	// Get all parent directories
	parentDirs := getParentDirectories(normalizedPath)

	// Check each parent directory for permissions, starting from closest parent
	for _, parentDir := range parentDirs {
		permission, err := FindPermissionForPath(ctx, parentDir)
		if err != nil {
			return nil, err
		}
		if permission != nil && permission.Consent {
			// Found a parent with permission, return inherited permission
			inheritedPermission := *permission
			inheritedPermission.ID = uuid.New().String()
			inheritedPermission.Path = normalizedPath
			inheritedPermission.Source = PermissionSourceInherited
			inheritedPermission.DisplayName = filepath.Base(normalizedPath)
			return &inheritedPermission, nil
		}
	}

	return nil, nil
}

// getParentDirectories returns all parent directories of a given path
func getParentDirectories(path string) []string {
	var parents []string
	current := path

	for {
		parent := filepath.Dir(current)
		if parent == current || parent == "." || parent == "/" {
			break
		}
		parents = append(parents, parent)
		current = parent
	}

	return parents
}

// TODO: Phase 4.13 - Permission Expiration Mechanism

// CleanupExpiredPermissions removes expired permissions from the database
func CleanupExpiredPermissions(ctx context.Context) error {
	// TODO: Phase 4.13 - Permission Expiration Mechanism
	// Automatic cleanup of expired permissions

	now := time.Now().Unix()
	query := `UPDATE permission_bookmarks SET archived = 1, updatedts = ? WHERE expires_at IS NOT NULL AND expires_at < ? AND archived = 0`
	db, err := GetDB(ctx)
	if err != nil {
		return err
	}

	result, err := db.ExecContext(ctx, query, now, now)
	if err != nil {
		return err
	}

	// Get number of affected rows
	rowsAffected, err := result.RowsAffected()
	if err == nil && rowsAffected > 0 {
		fmt.Printf("[PERMISSION_CLEANUP] Cleaned up %d expired permissions\n", rowsAffected)
	}

	return nil
}

// StartPermissionCleanup starts a background goroutine to periodically clean up expired permissions
func StartPermissionCleanup(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(1 * time.Hour) // Run cleanup every hour
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := CleanupExpiredPermissions(ctx); err != nil {
					fmt.Printf("[PERMISSION_CLEANUP] Error cleaning up expired permissions: %v\n", err)
				}
			}
		}
	}()
}

// TODO: Phase 4.14 - Permission Audit Trail
// Audit trail functionality removed as requested

// TODO: Phase 4.20 - Permission Debug Mode

// DebugPermissionCheck logs detailed information about permission checks
func DebugPermissionCheck(ctx context.Context, path string, result bool, record *PermissionRecord) {
	// TODO: Phase 4.20 - Permission Debug Mode
	// Debug logging implementation

	// Check if debug mode is enabled
	if os.Getenv("WAVETERM_PERMISSION_DEBUG") != "1" {
		return
	}

	debugInfo := fmt.Sprintf("[PERMISSION_DEBUG] Path: %s, Result: %t", path, result)
	if record != nil {
		debugInfo += fmt.Sprintf(", PermissionID: %s, Scope: %d, Source: %s",
			record.ID, record.ScopeLevel, record.Source)
	} else {
		debugInfo += ", No permission found"
	}

	// Log to standard output for now
	fmt.Println(debugInfo)
}

// TODO: Phase 4.23 - Developer Documentation
// Documentation should be created in docs/macos-permissions.md

// PermissionCache provides in-memory caching for frequently accessed permissions
type PermissionCache struct {
	cache map[string]*PermissionRecord
	mutex sync.RWMutex
	ttl   time.Duration
}

var (
	globalPermissionCache *PermissionCache
	cacheOnce             sync.Once
)

// GetPermissionCache returns the global permission cache instance
func GetPermissionCache() *PermissionCache {
	cacheOnce.Do(func() {
		globalPermissionCache = &PermissionCache{
			cache: make(map[string]*PermissionRecord),
			ttl:   5 * time.Minute, // Cache for 5 minutes
		}
	})
	return globalPermissionCache
}

// Get retrieves a permission from cache
func (pc *PermissionCache) Get(path string) (*PermissionRecord, bool) {
	pc.mutex.RLock()
	defer pc.mutex.RUnlock()

	permission, exists := pc.cache[path]
	if !exists {
		return nil, false
	}

	// Check if permission has expired
	if permission.ExpiresAt != nil && *permission.ExpiresAt < time.Now().Unix() {
		// Remove expired permission from cache
		delete(pc.cache, path)
		return nil, false
	}

	return permission, true
}

// Set stores a permission in cache
func (pc *PermissionCache) Set(path string, permission *PermissionRecord) {
	pc.mutex.Lock()
	defer pc.mutex.Unlock()

	pc.cache[path] = permission
}

// Invalidate removes a permission from cache
func (pc *PermissionCache) Invalidate(path string) {
	pc.mutex.Lock()
	defer pc.mutex.Unlock()

	delete(pc.cache, path)
}

// Clear removes all permissions from cache
func (pc *PermissionCache) Clear() {
	pc.mutex.Lock()
	defer pc.mutex.Unlock()

	pc.cache = make(map[string]*PermissionRecord)
}
