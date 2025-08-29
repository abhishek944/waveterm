-- TODO: Phase 1.2 - Database Migration
-- Create permission_bookmarks table for macOS permissions system

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

-- TODO: Add indexes for performance optimization
CREATE INDEX idx_permission_bookmarks_ownerid ON permission_bookmarks (ownerid);
CREATE INDEX idx_permission_bookmarks_path ON permission_bookmarks (path);
CREATE INDEX idx_permission_bookmarks_consent ON permission_bookmarks (consent);
CREATE INDEX idx_permission_bookmarks_source ON permission_bookmarks (source);
CREATE INDEX idx_permission_bookmarks_expires_at ON permission_bookmarks (expires_at);
CREATE INDEX idx_permission_bookmarks_archived ON permission_bookmarks (archived);

-- TODO: Add composite indexes for common query patterns
CREATE INDEX idx_permission_bookmarks_path_consent ON permission_bookmarks (path, consent);
CREATE INDEX idx_permission_bookmarks_ownerid_archived ON permission_bookmarks (ownerid, archived);

