# Database Migration System

## Overview

AIDeveloper includes an automatic database migration system that ensures the database schema is always up-to-date. Migrations run automatically on every server startup, making database management seamless.

## Features

- ✅ **Automatic Health Checks**: Validates database schema on startup
- ✅ **Auto-Migration**: Applies missing migrations automatically
- ✅ **Safe Execution**: Handles duplicate columns/keys gracefully
- ✅ **Detailed Logging**: Clear output of migration status
- ✅ **Failure Protection**: Server won't start if database is unhealthy

## How It Works

### Startup Flow

```
npm start
  ↓
ensure-services.sh
  ↓
check-and-migrate-db.sh
  ↓
1. Check database exists → Create if missing
2. Check required tables → List missing tables
3. Run migrations → Apply in order
4. Verify schema → Ensure all tables exist
5. Continue startup → Server starts only if DB is healthy
```

### Migration Process

1. **Database Connection Check**: Verifies connection to MySQL
2. **Table Verification**: Checks for 9 required tables
3. **Migration Execution**: Runs SQL files in chronological order
4. **Final Verification**: Confirms all tables exist
5. **Status Report**: Shows detailed success/failure information

## Required Tables

| Table | Purpose |
|-------|---------|
| `workflows` | Main workflow tracking and state |
| `agent_executions` | Individual agent execution records |
| `artifacts` | Generated code, tests, docs, etc. |
| `execution_logs` | Detailed execution logging |
| `environment_variables` | System configuration |
| `module_settings` | Module-specific settings |
| `workflow_modules` | Multi-module workflow support |
| `sub_workflow_queue` | Workflow hierarchy management |
| `workflow_messages` | Conversation thread system |

## Usage

### Automatic (Default)

Just start the server - migrations run automatically:

```bash
npm start
```

### Manual Execution

Force a database check and migration:

```bash
npm run db:init
```

Or directly:

```bash
bash scripts/check-and-migrate-db.sh
```

### Check Database Status

```bash
# View all tables
docker exec aideveloper_mysql_dev mysql -uroot -prootpassword -e "SHOW TABLES FROM aideveloper;"

# Check specific table structure
docker exec aideveloper_mysql_dev mysql -uroot -prootpassword -e "DESCRIBE aideveloper.workflows;"
```

## Creating New Migrations

### Step 1: Create Migration File

```bash
cd migrations/
touch YYYYMMDD_description.sql
```

**Naming Convention**: `YYYYMMDD_description.sql` (e.g., `20251201_add_user_roles.sql`)

### Step 2: Write Migration SQL

```sql
-- Migration: Add user roles support
-- Date: 2025-12-01
-- Description: Adds role-based access control

ALTER TABLE workflows
ADD COLUMN created_by VARCHAR(255) NULL AFTER target_module;

CREATE TABLE IF NOT EXISTS user_roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  role ENUM('admin', 'developer', 'viewer') NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Step 3: Update Migration Script

Add your migration to the `MIGRATION_FILES` array in `scripts/check-and-migrate-db.sh`:

```bash
MIGRATION_FILES=(
    # ... existing migrations ...
    "$MIGRATIONS_DIR/20251201_add_user_roles.sql"
)
```

### Step 4: Test Migration

```bash
# Test on development database
npm run db:init

# Or test in isolation
docker exec -i aideveloper_mysql_dev mysql -uroot -prootpassword aideveloper < migrations/20251201_add_user_roles.sql
```

### Step 5: Document Migration

Update `migrations/README.md` with the new migration details.

## Best Practices

### ✅ Do

- Use `IF NOT EXISTS` for CREATE statements
- Use `ADD COLUMN IF NOT EXISTS` (MySQL 8.0.12+) or handle errors gracefully
- Include descriptive comments at the top of each migration
- Test migrations on a development database first
- Document schema changes in README
- Use transactions for complex migrations

### ❌ Don't

- Modify existing migration files (create new ones instead)
- Use DROP statements without backups
- Hard-code values that should be configurable
- Skip documenting breaking changes
- Apply migrations directly in production

## Migration File Template

```sql
-- Migration: Brief description
-- Date: YYYY-MM-DD
-- Description: Detailed explanation of what this migration does
--              and why it's needed

-- Add your SQL statements here
-- Use comments to explain complex changes

-- Example: Add new column
ALTER TABLE workflows
ADD COLUMN new_field VARCHAR(255) NULL AFTER existing_field;

-- Example: Create new table
CREATE TABLE IF NOT EXISTS new_table (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## Troubleshooting

### Issue: "Table doesn't exist" errors

**Solution**: Run manual migration check
```bash
npm run db:init
```

### Issue: Migration fails with "Duplicate column"

**Cause**: Migration already partially applied  
**Solution**: This is usually safe - the script handles these errors gracefully

### Issue: Database connection refused

**Solution**: Ensure MySQL is running
```bash
docker ps | grep mysql
docker compose -f docker-compose.dev.yml restart mysql
```

### Issue: Migrations not being detected

**Solution**: Ensure migration file is in `migrations/` directory and listed in `check-and-migrate-db.sh`

### Issue: Need to reset database

**Development only** (⚠️ This will delete all data):
```bash
# Drop and recreate database
docker exec aideveloper_mysql_dev mysql -uroot -prootpassword -e "DROP DATABASE aideveloper;"
npm run db:init

# Or use Docker compose
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d mysql
npm run db:init
```

## Migration Logs

Check server logs for migration details:

```bash
# View recent logs
tail -f logs/combined-*.log | grep -i migration

# Or check error logs
tail -f logs/error-*.log
```

## Production Considerations

### Before Deploying Migrations

1. **Backup Database**: Always backup before applying migrations
   ```bash
   docker exec aideveloper_mysql_dev mysqldump -uroot -prootpassword aideveloper > backup.sql
   ```

2. **Test Thoroughly**: Run migrations on staging environment first

3. **Review SQL**: Ensure migrations are idempotent when possible

4. **Plan Downtime**: Some migrations may require brief downtime

5. **Prepare Rollback**: Have rollback scripts ready

### Rollback Strategy

Create rollback SQL for each migration:

```sql
-- rollback_20251201_add_user_roles.sql
ALTER TABLE workflows DROP COLUMN created_by;
DROP TABLE IF EXISTS user_roles;
```

## Advanced Usage

### Check If Specific Table Exists

```bash
docker exec aideveloper_mysql_dev mysql -uroot -prootpassword aideveloper -e "SHOW TABLES LIKE 'workflows';"
```

### View Migration History

```bash
# List all migration files
ls -lah migrations/*.sql

# View migration content
cat migrations/20251201_add_user_roles.sql
```

### Run Single Migration

```bash
docker exec -i aideveloper_mysql_dev mysql -uroot -prootpassword aideveloper < migrations/20251201_add_user_roles.sql
```

## Related Documentation

- [Migration Files README](../migrations/README.md)
- [Database Schema](./DATABASE_SCHEMA.md) (if exists)
- [Setup Guide](../SETUP.md)
- [Docker Setup](../README.docker.md)

