-- This migration drops the cmd_execution_status column from thread_line table
-- This operation may fail if the column contains data that would be lost

-- First try to drop the column
BEGIN;

-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- This is the standard approach for SQLite column removal

-- Create temporary table without the column
CREATE TABLE thread_line_temp (
    threadid varchar(36) NOT NULL,
    screenid varchar(36) NOT NULL,
    lineid varchar(36) NOT NULL,
    linenum int NOT NULL,
    userquery text,
    assistantresponse text,
    command text,
    cmdlineid varchar(36),
    created_ts bigint NOT NULL,
    metadata text,
    PRIMARY KEY (threadid, lineid)
);

-- Copy data from original table
INSERT INTO thread_line_temp
SELECT threadid, screenid, lineid, linenum, userquery, assistantresponse, command, cmdlineid, created_ts, metadata
FROM thread_line;

-- Drop original table
DROP TABLE thread_line;

-- Rename temp table to original name
ALTER TABLE thread_line_temp RENAME TO thread_line;

COMMIT;