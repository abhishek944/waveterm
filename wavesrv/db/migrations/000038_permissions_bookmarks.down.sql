-- TODO: Phase 1.2 - Database Migration Rollback
-- Drop permission_bookmarks table and related indexes

-- Drop composite indexes first
DROP INDEX IF EXISTS idx_permission_bookmarks_ownerid_archived;
DROP INDEX IF EXISTS idx_permission_bookmarks_path_consent;

-- Drop single column indexes
DROP INDEX IF EXISTS idx_permission_bookmarks_archived;
DROP INDEX IF EXISTS idx_permission_bookmarks_expires_at;
DROP INDEX IF EXISTS idx_permission_bookmarks_source;
DROP INDEX IF EXISTS idx_permission_bookmarks_consent;
DROP INDEX IF EXISTS idx_permission_bookmarks_path;
DROP INDEX IF EXISTS idx_permission_bookmarks_ownerid;

-- Drop the table
DROP TABLE IF EXISTS permission_bookmarks;

