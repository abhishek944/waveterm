-- Thread system for Wave Terminal
-- Supports agentic workflow with conversation history and command execution

CREATE TABLE IF NOT EXISTS thread (
    threadid varchar(36) PRIMARY KEY,
    sessionid varchar(36) NOT NULL,
    screenid varchar(36) NOT NULL,
    name varchar(100) NOT NULL,
    createdts bigint NOT NULL,
    updatedts bigint NOT NULL,
    archived boolean NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS thread_line (
    threadid varchar(36) NOT NULL,
    screenid varchar(36) NOT NULL,
    lineid varchar(36) NOT NULL,
    linenum int NOT NULL,
    userquery text NOT NULL DEFAULT '',
    assistantresponse text NOT NULL DEFAULT '',
    command text NOT NULL DEFAULT '',
    created_ts bigint NOT NULL DEFAULT 0,
    metadata text NOT NULL DEFAULT '{}',
    PRIMARY KEY (threadid, lineid)
);

-- Index for efficient thread line lookups
CREATE INDEX idx_thread_line_screenid ON thread_line (screenid);

-- Note: thread_line.lineid references cmd table via (screenid, lineid) for command execution details