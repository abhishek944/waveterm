# Wave Terminal Database Architecture

This document provides a comprehensive overview of Wave Terminal's database structure, schemas, and data flow.

## Database System

Wave Terminal uses **SQLite3** as its database engine with the following configuration:

-   **Mode**: WAL (Write-Ahead Logging) for better concurrency
-   **Location**: `~/.waveterm/waveterm.db` (production) or `~/.waveterm-dev/waveterm-dev.db` (development)
-   **Connection String**: `file:{dbname}?cache=shared&mode=rwc&_journal_mode=WAL&_busy_timeout=5000`
-   **Migration System**: golang-migrate (currently at version 33)

## Core Tables

### 1. `client` - Client Configuration

Stores user and client-specific settings.

```sql
CREATE TABLE client (
    clientid varchar(36) NOT NULL,
    userid varchar(36) NOT NULL,
    activesessionid varchar(36) DEFAULT '',
    userpublickeybytes blob NOT NULL,
    userprivatekeybytes blob NOT NULL,
    winsize json NOT NULL, -- {"width": int, "height": int}
    clientopts json,
    clientbuildts bigint DEFAULT 0,
    uielements json,
    uielementpos json,
    aiopts json, -- AI provider options
    PRIMARY KEY (clientid)
);
```

### 2. `session` - Terminal Sessions

Top-level container for screens/tabs.

```sql
CREATE TABLE session (
    sessionid varchar(36) NOT NULL,
    name varchar(50) NOT NULL,
    sessionidx int NOT NULL,
    activescreenid varchar(36) NOT NULL,
    sharemode varchar(12) NOT NULL DEFAULT '',
    notifynum int NOT NULL DEFAULT 0,
    archived boolean NOT NULL DEFAULT 0,
    archivedts bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (sessionid)
);
```

### 3. `screen` - Individual Screens/Tabs

Each screen represents a terminal tab within a session.

```sql
CREATE TABLE screen (
    sessionid varchar(36) NOT NULL,
    screenid varchar(36) NOT NULL,
    name varchar(50) NOT NULL,
    screenidx int NOT NULL,
    screenopts json,
    ownerid varchar(36) NOT NULL,
    sharemode varchar(12) NOT NULL DEFAULT '',
    curremoteownerid varchar(36) NOT NULL DEFAULT '',
    curremoteid varchar(36) NOT NULL DEFAULT '',
    curremotename varchar(50) NOT NULL DEFAULT '',
    nextlinenum int NOT NULL DEFAULT 1,
    selectedline int NOT NULL DEFAULT 0,
    anchor scranchor NOT NULL DEFAULT '{"anchorline":0,"anchoroffset":0}',
    focustype varchar(12) NOT NULL DEFAULT 'input',
    archived boolean NOT NULL DEFAULT 0,
    archivedts bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (sessionid, screenid)
);
```

### 4. `line` - Command and Output Lines

Core unit of terminal interaction - can be commands, text, or special modes.

```sql
CREATE TABLE line (
    sessionid varchar(36) NOT NULL,
    screenid varchar(36) NOT NULL,
    userid varchar(36) NOT NULL,
    lineid varchar(36) NOT NULL,
    ts bigint NOT NULL,
    linenum int NOT NULL,
    linenumtemp boolean NOT NULL DEFAULT 0,
    linelocal boolean NOT NULL DEFAULT 0,
    linetype varchar(10) NOT NULL DEFAULT 'cmd',
    linestate json,
    text text NOT NULL DEFAULT '',
    renderer varchar(50) NOT NULL DEFAULT '',
    contentheight int NOT NULL DEFAULT -1,
    star int NOT NULL DEFAULT 0,
    pinned boolean NOT NULL DEFAULT 0,
    pinnedts bigint,
    archived boolean NOT NULL DEFAULT 0,
    PRIMARY KEY (sessionid, screenid, lineid)
);
```

**Line Types**:

-   `cmd` - Regular command execution
-   `text` - Text/comment lines
-   `agent_mode` - AI agent responses
-   `thread_mode` - AI thread conversations

### 5. `cmd` - Command Execution Details

Detailed information about command execution.

```sql
CREATE TABLE cmd (
    sessionid varchar(36) NOT NULL,
    screenid varchar(36) NOT NULL,
    lineid varchar(36) NOT NULL,
    remoteownerid varchar(36) NOT NULL,
    remoteid varchar(36) NOT NULL,
    remotename varchar(50) NOT NULL,
    cmdstr text NOT NULL,
    rawcmdstr text NOT NULL,
    festate json, -- Frontend state including cwd (current working directory)
    statebasehash varchar(36) NOT NULL,
    statediffhasharr json,
    termopts json NOT NULL DEFAULT '{"rows": 25, "cols": 80}',
    origtermopts json NOT NULL,
    status varchar(10) NOT NULL,
    cmdpid int NOT NULL,
    remotepid int NOT NULL,
    donets bigint NOT NULL,
    restartts bigint,
    exitcode int,
    durationms int,
    rtnstate boolean NOT NULL DEFAULT 0,
    runout json NOT NULL DEFAULT '{}',
    PRIMARY KEY (sessionid, screenid, lineid)
);
```

**Command Status Values**:

-   `running` - Currently executing
-   `done` - Completed successfully
-   `error` - Failed with error
-   `detached` - Running in background
-   `hangup` - Connection lost

### 6. `remote` - Remote Connection Configurations

SSH and remote connection settings.

```sql
CREATE TABLE remote (
    remoteid varchar(36) NOT NULL,
    remotetype varchar(10) NOT NULL,
    remotealias varchar(50) NOT NULL DEFAULT '',
    remotecanonicalname varchar(200) NOT NULL,
    remoteuser varchar(50) NOT NULL,
    remotehost varchar(200) NOT NULL,
    connectmode varchar(20) NOT NULL,
    autoinstall boolean NOT NULL DEFAULT 0,
    sshdopts json, -- SSH connection options
    remoteopts json,
    lastconnectts bigint NOT NULL DEFAULT 0,
    archived boolean NOT NULL DEFAULT 0,
    shellpref varchar(50) NOT NULL DEFAULT 'bash',
    PRIMARY KEY (remoteid)
);
```

### 7. `history` - Command History

Global command history tracking.

```sql
CREATE TABLE history (
    historyid varchar(36) NOT NULL,
    ts bigint NOT NULL,
    userid varchar(36) NOT NULL,
    sessionid varchar(36) NOT NULL,
    screenid varchar(36) NOT NULL,
    lineid varchar(36) NOT NULL,
    linenum int NOT NULL,
    haderror boolean NOT NULL DEFAULT 0,
    cmdstr text NOT NULL,
    remoteownerid varchar(36) NOT NULL,
    remoteid varchar(36) NOT NULL,
    remotename varchar(50) NOT NULL,
    ismetacmd boolean,
    incognito boolean NOT NULL DEFAULT 0,
    PRIMARY KEY (historyid)
);
CREATE INDEX idx_history_ts ON history (ts);
CREATE INDEX idx_history_sessionid ON history (sessionid);
CREATE INDEX idx_history_screenid ON history (screenid);
```

### 8. `thread` - AI Thread Conversations

Manages AI conversation threads (new in v33).

```sql
CREATE TABLE thread (
    threadid varchar(36) NOT NULL,
    sessionid varchar(36) NOT NULL,
    screenid varchar(36) NOT NULL,
    name varchar(100) NOT NULL,
    createdts bigint NOT NULL,
    updatedts bigint NOT NULL,
    archived boolean NOT NULL DEFAULT 0,
    PRIMARY KEY (threadid)
);
CREATE INDEX idx_thread_screenid ON thread (screenid);
```

### 9. `thread_line` - Thread Conversation Lines

Individual messages within a thread.

```sql
CREATE TABLE thread_line (
    threadid varchar(36) NOT NULL,
    screenid varchar(36) NOT NULL,
    lineid varchar(36) NOT NULL,
    linenum int NOT NULL,
    userquery text,
    assistantresponse text,
    command text,
    cmdlineid varchar(36),    -- References cmd.lineid for command execution
    PRIMARY KEY (threadid, screenid, lineid)
);
```

### 10. `bookmark` - Saved Commands

User-saved command bookmarks.

```sql
CREATE TABLE bookmark (
    bookmarkid varchar(36) NOT NULL,
    userid varchar(36) NOT NULL,
    createts bigint NOT NULL,
    cmdstr text NOT NULL,
    alias varchar(50) NOT NULL DEFAULT '',
    tags json,
    description text NOT NULL DEFAULT '',
    PRIMARY KEY (bookmarkid)
);
CREATE INDEX idx_bookmark_userid ON bookmark (userid);
CREATE INDEX idx_bookmark_alias ON bookmark (alias);
```

### 11. `state_base` & `state_diff` - Shell State Management

Tracks shell environment state changes.

```sql
CREATE TABLE state_base (
    basehash varchar(36) NOT NULL,
    ts bigint NOT NULL,
    version varchar(200) NOT NULL,
    data json,
    PRIMARY KEY (basehash)
);

CREATE TABLE state_diff (
    diffhash varchar(36) NOT NULL,
    ts bigint NOT NULL,
    basehash varchar(36) NOT NULL,
    diffhasharr json,
    data json,
    PRIMARY KEY (diffhash)
);
```

### 12. `remote_instance` - Remote Shell Instances

Active remote connection instances.

```sql
CREATE TABLE remote_instance (
    riid varchar(36) NOT NULL,
    sessionid varchar(36) NOT NULL,
    screenid varchar(36) NOT NULL,
    remoteownerid varchar(36) NOT NULL,
    remoteid varchar(36) NOT NULL,
    name varchar(50) NOT NULL,
    festate json,
    shelltype varchar(50) NOT NULL,
    sessionopts json,
    statevars json,
    status varchar(12) NOT NULL DEFAULT 'unknown',
    rishareopts json,
    PRIMARY KEY (riid)
);
CREATE INDEX idx_remote_instance_sessionid ON remote_instance (sessionid);
CREATE INDEX idx_remote_instance_remoteid ON remote_instance (remoteid);
```

## Data Relationships

### Primary Relationships

1. **Session � Screen**: One-to-many (a session contains multiple screens/tabs)
2. **Screen � Line**: One-to-many (a screen contains multiple command/output lines)
3. **Line � Cmd**: One-to-one (command lines have execution details)
4. **Thread � ThreadLine**: One-to-many (a thread contains multiple conversation lines)
5. **Remote � RemoteInstance**: One-to-many (a remote config can have multiple active instances)

### Key Concepts

#### Line Types and Their Purpose

-   **cmd**: Regular shell commands that get executed
-   **text**: User comments or notes (not executed)
-   **agent_mode**: AI agent responses (markdown formatted)
-   **thread_mode**: AI thread conversations with structured responses

#### Command Lifecycle

1. User types command � Creates `line` entry with `linetype='cmd'`
2. Command executes � Creates/updates `cmd` entry with status='running'
3. Command completes � Updates `cmd` status to 'done' or 'error'
4. Output stored � PTY output saved to file system, referenced by line

#### Thread Mode Flow

1. User activates thread mode and sends query
2. Creates `line` with `linetype='thread_mode'`
3. Creates or updates `thread` entry
4. AI response saved to `thread_line` with user query and assistant response
5. If command suggested, saved in `thread_line.command`
6. When command is executed:
   - New `cmd` line created with separate UUID
   - Command execution lineId stored in `thread_line.cmdlineid`
   - Clicking command in UI opens the command execution line in sidebar

## Storage Locations

### Database Files

-   **Production**: `~/.waveterm/waveterm.db`
-   **Development**: `~/.waveterm-dev/waveterm.db`

### PTY Output Files

-   Stored separately from database: `~/.waveterm/ptydata/`
-   Referenced by `(screenid, lineid)` combination
-   Allows efficient storage of large terminal outputs

### Block Storage

-   Large content blocks: `~/.waveterm/blockdata/`
-   Used for file contents, large outputs

## Migration System

Wave Terminal uses golang-migrate for schema management:

-   Migration files: `wavesrv/db/migrations/`
-   Format: `NNNNNN_description.up.sql` and `.down.sql`
-   Current version: 34 (added cmdlineid to thread_line)
-   Special data migrations handle complex transformations

## Performance Optimizations

1. **Indexes**: Strategic indexes on frequently queried columns
2. **JSON Columns**: Flexible schema for optional/varying data
3. **WAL Mode**: Better concurrency for read/write operations
4. **Separate PTY Storage**: Large outputs stored in filesystem, not database
5. **Composite Primary Keys**: Efficient lookups for hierarchical data

## Common Queries Patterns

### Get Active Screen

```sql
SELECT * FROM screen
WHERE sessionid = ? AND screenid = ?
AND archived = 0;
```

### Get Thread Conversation

```sql
SELECT tl.* FROM thread_line tl
WHERE tl.threadid = ?
ORDER BY tl.linenum;
```

### Get Command History

```sql
SELECT * FROM history
WHERE sessionid = ? AND screenid = ?
ORDER BY ts DESC
LIMIT 100;
```

### Get Screen Lines with Commands

```sql
SELECT l.*, c.* FROM line l
LEFT JOIN cmd c ON l.lineid = c.lineid
WHERE l.sessionid = ? AND l.screenid = ?
AND l.archived = 0
ORDER BY l.linenum;
```

## Data Integrity

1. **Foreign Keys**: Not enforced at database level (SQLite limitation)
2. **Application-level Constraints**: Enforced in Go code
3. **Soft Deletes**: Most entities use `archived` flag instead of hard deletes
4. **Tombstones**: Track deleted sessions/screens for sync purposes
