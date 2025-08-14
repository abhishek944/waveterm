-- SQLite doesn't support DROP COLUMN directly, need to recreate table
CREATE TABLE thread_line_new (
    threadid varchar(36) NOT NULL,
    screenid varchar(36) NOT NULL,
    lineid varchar(36) NOT NULL,
    linenum int NOT NULL,
    userquery text,
    assistantresponse text,
    command text,
    PRIMARY KEY (threadid, screenid, lineid)
);

INSERT INTO thread_line_new SELECT threadid, screenid, lineid, linenum, userquery, assistantresponse, command FROM thread_line;
DROP TABLE thread_line;
ALTER TABLE thread_line_new RENAME TO thread_line;