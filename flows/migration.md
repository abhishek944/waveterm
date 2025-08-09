# Database Migration Flow in Wave Terminal

This document explains how database migrations work in Wave Terminal, including the complete flow from startup to execution.

## Overview

Wave Terminal uses the [golang-migrate](https://github.com/golang-migrate/migrate) library to manage database schema changes. Migrations ensure that the database structure is updated consistently across different versions of the application.

## Key Components

### 1. Migration Files Location
- **Directory**: `wavesrv/db/migrations/`
- **File Format**: Each migration consists of two SQL files:
  - `NNNNNN_description.up.sql` - Applied when upgrading
  - `NNNNNN_description.down.sql` - Applied when downgrading
- **Naming Convention**: 
  - `NNNNNN` is a 6-digit zero-padded number (e.g., `000001`, `000032`)
  - `description` is a short name describing the change (e.g., `client_aiopts`)

### 2. Migration Constants
**File**: `wavesrv/pkg/sstore/migrate.go`

```go
const MaxMigration = 32  // Must match the highest migration number
const MigratePrimaryScreenVersion = 9
const CmdScreenSpecialMigration = 13
const CmdLineSpecialMigration = 20
const RISpecialMigration = 30
```

### 3. Database Files
- **Development**: `~/.waveterm-dev/waveterm.db`
- **Production**: `~/.waveterm/waveterm.db`

## Migration Flow

### Step 1: Application Startup
**File**: `wavesrv/cmd/main-server.go`

When the Wave Terminal backend starts, it follows this sequence:

1. **Main Function** (`main()`)
   - Sets up the home directory
   - Calls `createMainWaveDB()`

2. **Database Creation** (`createMainWaveDB()`)
   ```go
   func createMainWaveDB() (*sqlx.DB, error) {
       // Opens or creates the SQLite database
       db, err := sqlx.Open("sqlite3", sstore.GetDBName())
       // ...
       return db, nil
   }
   ```

### Step 2: Migration Initialization
**File**: `wavesrv/pkg/sstore/sstore.go`

1. **Database Initialization** (`InitDBState()`)
   ```go
   func InitDBState() error {
       // Creates migration instance
       m, err := MakeMigrate()
       
       // Runs migrations up to MaxMigration
       err = m.Migrate(MaxMigration)
       
       // Performs special migrations if needed
       RunSpecialMigrations()
       
       return nil
   }
   ```

### Step 3: Migration Creation
**File**: `wavesrv/pkg/sstore/migrate.go`

1. **Migration Factory** (`MakeMigrate()`)
   ```go
   func MakeMigrate() (*migrate.Migrate, error) {
       // Creates file system source from embedded migrations
       fsVar, err := iofs.New(dbfs.MigrationFS, "migrations")
       
       // Creates database URL
       dbUrl := fmt.Sprintf("sqlite3://%s", GetDBName())
       
       // Creates migration instance
       m, err := migrate.NewWithSourceInstance("iofs", fsVar, dbUrl)
       
       return m, nil
   }
   ```

### Step 4: Migration Execution
**Process**: The golang-migrate library handles the execution:

1. **Check Current Version**
   - Reads from `schema_migrations` table in the database
   - Determines which migrations have been applied

2. **Apply Pending Migrations**
   - For each migration from current version to `MaxMigration`:
     - Reads the `.up.sql` file
     - Executes the SQL statements
     - Updates `schema_migrations` table

3. **Handle Errors**
   - If a migration fails, the process stops
   - The database remains at the last successful migration

### Step 5: Special Migrations
**File**: `wavesrv/pkg/sstore/sstore_migrate.go`

Some migrations require Go code in addition to SQL:

```go
func RunSpecialMigrations(curVersion int) error {
    if curVersion < MigratePrimaryScreenVersion {
        MigratePrimaryScreen()
    }
    if curVersion < CmdScreenSpecialMigration {
        MigrateCmdScreenIds()
    }
    // ... more special migrations
}
```

## When to Create a Migration

### Migrations are ONLY needed when:
1. **Adding/removing columns** to existing tables
2. **Creating/dropping tables**
3. **Creating/dropping indexes**
4. **Changing column types or constraints**
5. **Modifying existing data in bulk**

### Migrations are NOT needed when:
1. **Using JSON columns** - SQLite JSON columns are flexible and don't require migrations for internal structure changes
2. **Adding fields to existing JSON data** - The JSON structure can be modified in the application code
3. **Code-only changes** - Changes that only affect how data is interpreted, not the schema

### Important Note on JSON Columns
When using JSON columns (like `aiopts`, `clientopts`, etc.), you can add or remove fields within the JSON structure without creating a migration. The database schema remains unchanged, and the application code handles the JSON structure internally.

## Creating a New Migration

### Example: Adding the `aiopts` Column

1. **Determine the Next Migration Number**
   - Check `wavesrv/db/migrations/` for the highest number
   - If the latest is `000031_*.sql`, the next is `000032`

2. **Create the Up Migration**
   **File**: `wavesrv/db/migrations/000032_client_aiopts.up.sql`
   ```sql
   ALTER TABLE client ADD COLUMN aiopts json NOT NULL DEFAULT '{}';
   ```

3. **Create the Down Migration**
   **File**: `wavesrv/db/migrations/000032_client_aiopts.down.sql`
   ```sql
   ALTER TABLE client DROP COLUMN aiopts;
   ```

4. **Update MaxMigration**
   **File**: `wavesrv/pkg/sstore/migrate.go`
   ```go
   const MaxMigration = 32  // Changed from 31 to 32
   ```

5. **Rebuild and Run**
   ```bash
   # Rebuild the backend
   scripthaus run build-backend
   
   # The migration will run automatically on next startup
   ```

## Migration Table Structure

The `schema_migrations` table tracks applied migrations:

```sql
CREATE TABLE schema_migrations (
    version bigint PRIMARY KEY,
    dirty boolean NOT NULL
);
```

- `version`: The migration number (e.g., 32)
- `dirty`: Indicates if a migration failed mid-execution

## Common Migration Operations

### Adding a Column
```sql
ALTER TABLE table_name ADD COLUMN column_name type DEFAULT default_value;
```

### Removing a Column
```sql
ALTER TABLE table_name DROP COLUMN column_name;
```

### Creating an Index
```sql
CREATE INDEX idx_name ON table_name(column_name);
```

### Modifying Data
```sql
UPDATE table_name SET column = value WHERE condition;
```

## Troubleshooting

### Migration Failed
1. Check the error message in logs
2. The database will be marked as "dirty"
3. Fix the issue in the migration file
4. May need to manually clean up partial changes

### Reset Development Database
```bash
# Remove all database files
rm ~/.waveterm-dev/waveterm.db*

# Restart the application - migrations will run from scratch
```

### Check Current Migration Version
```sql
SELECT version FROM schema_migrations;
```

## Best Practices

1. **Always Test Migrations**
   - Test both up and down migrations
   - Ensure down migration properly reverses the up migration

2. **Keep Migrations Simple**
   - One logical change per migration
   - Avoid complex logic in SQL

3. **Use Transactions**
   - SQLite wraps each migration in a transaction automatically
   - If any statement fails, all changes are rolled back

4. **Default Values**
   - Always provide defaults for new NOT NULL columns
   - Prevents errors with existing data

5. **Version Control**
   - Commit migration files with the code that uses them
   - Never modify existing migrations after release

## Migration Lifecycle

1. **Development**: Create and test migrations locally
2. **Code Review**: Migrations reviewed with code changes
3. **Release**: Migrations included in release
4. **Production**: Users' databases automatically migrated on update

## Related Files

- `wavesrv/pkg/sstore/migrate.go` - Migration setup and configuration
- `wavesrv/pkg/sstore/sstore.go` - Database initialization
- `wavesrv/pkg/sstore/sstore_migrate.go` - Special migration logic
- `wavesrv/db/migrations/` - SQL migration files
- `wavesrv/cmd/main-server.go` - Application entry point