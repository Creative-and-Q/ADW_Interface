# Database Migrations

This directory contains SQL migration files for the AIDeveloper database schema.

## Automatic Migration System ✨

**Migrations run automatically on server startup!** The system checks database health and applies missing migrations automatically.

## Migration Naming Convention

Migrations are named with the format: `YYYYMMDD_description.sql`

Example: `20251111_add_security_lint_enums.sql`

## Running Migrations

### Automatic (Recommended)
Migrations run automatically when you start the server:
```bash
npm start
# or
npm run dev
```

### Manual Execution
To manually initialize or update the database:
```bash
npm run db:init
# or
bash scripts/check-and-migrate-db.sh
```

### Individual Migration
To apply a specific migration manually:
```bash
mysql -u root -prootpass aideveloper < migrations/20251111_add_security_lint_enums.sql
```

Or using environment variables from .env:
```bash
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < migrations/filename.sql
```

## How It Works

1. **On Startup**: `ensure-services.sh` calls `check-and-migrate-db.sh`
2. **Health Check**: Verifies all required tables exist
3. **Auto-Migrate**: Runs missing migrations in chronological order
4. **Verification**: Confirms schema is complete
5. **Server Start**: Only proceeds if database is healthy

## Required Tables

The system checks for these tables:
- `workflows` - Main workflow tracking
- `agent_executions` - Agent execution records
- `artifacts` - Generated artifacts
- `execution_logs` - Detailed execution logs
- `environment_variables` - Configuration storage
- `module_settings` - Module configuration
- `workflow_modules` - Multi-module support
- `sub_workflow_queue` - Workflow hierarchy
- `workflow_messages` - Conversation threads

## Migration History

- **00_initial_schema.sql**: Base database schema with core tables
- **20251111_add_security_lint_enums.sql**: Added security_lint and security_linting enum values
- **20251114_add_module_settings.sql**: Module configuration table
- **20251116_add_target_module_to_workflows.sql**: Target module tracking
- **20251121_add_new_module_workflow_type.sql**: New module workflow type
- **20251121_add_output_mode_to_workflows.sql**: PR vs commit output modes
- **20251121_add_pr_url_to_workflows.sql**: PR URL tracking
- **20251121_add_workflow_modules_table.sql**: Multi-module workflow support
- **20251123_add_workflow_hierarchy.sql**: Parent/child workflow relationships
- **20251124_add_scaffold_agent_type.sql**: Scaffold agent support
- **20251126_add_task_description_and_status.sql**: Task descriptions and extended statuses
- **20251129_add_checkpoint_tracking.sql**: Workflow checkpoint tracking
- **20251129_add_workflow_messages.sql**: Conversation thread system
- **20251130_add_conversation_history.sql**: Enhanced conversation history

## Best Practices

1. **Always test migrations** on a development database before applying to production
2. **Create rollback scripts** for migrations that modify data (not just schema)
3. **Document changes** in this README after creating new migrations
4. **Use transactions** when possible to ensure atomicity
5. **Version control** all migration files
6. **Use IF NOT EXISTS** for CREATE statements when possible

## Troubleshooting

### Database Connection Failed
```bash
# Check if MySQL is running
docker ps | grep mysql

# Restart MySQL
docker compose -f docker-compose.dev.yml restart mysql
```

### Migration Errors
```bash
# Check current database state
docker exec aideveloper_mysql_dev mysql -uroot -prootpassword -e "SHOW TABLES FROM aideveloper;"

# Manually run migrations
bash scripts/check-and-migrate-db.sh
```

### Reset Database (Development Only)
```bash
# WARNING: This will delete all data!
docker exec aideveloper_mysql_dev mysql -uroot -prootpassword -e "DROP DATABASE aideveloper;"
npm run db:init
```
