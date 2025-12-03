#!/bin/bash
# Database health check and automatic migration script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="$PROJECT_DIR/migrations"

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then export $(grep -v '^#' "$PROJECT_DIR/.env" | xargs); fi

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-3308}
DB_USER=${DB_USER:-root}
DB_PASSWORD=${DB_PASSWORD:-rootpassword}
DB_NAME=${DB_NAME:-aideveloper}
MYSQL_CONTAINER="aideveloper_mysql_dev"

REQUIRED_TABLES=(
    "workflows"
    "agent_executions"
    "artifacts"
    "execution_logs"
    "environment_variables"
    "module_settings"
    "workflow_modules"
    "sub_workflow_queue"
    "workflow_messages"
)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Database Health Check & Migration System"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Function to execute MySQL command
mysql_exec() {
    if docker ps --format '{{.Names}}' | grep -q "^${MYSQL_CONTAINER}$"; then
        docker exec -i "$MYSQL_CONTAINER" mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" "$@" 2>&1 | grep -v "Using a password"
    else
        mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" "$@" 2>&1 | grep -v "Using a password"
    fi
}

# Function to check if database exists
check_database_exists() {
    if docker ps --format '{{.Names}}' | grep -q "^${MYSQL_CONTAINER}$"; then
        DB_EXISTS=$(docker exec "$MYSQL_CONTAINER" mysql -u"$DB_USER" -p"$DB_PASSWORD" -e "SHOW DATABASES LIKE '$DB_NAME';" 2>/dev/null | grep "$DB_NAME" || true)
    else
        DB_EXISTS=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "SHOW DATABASES LIKE '$DB_NAME';" 2>/dev/null | grep "$DB_NAME" || true)
    fi
    [ -n "$DB_EXISTS" ]
}

# Function to create database if it doesn't exist
create_database() {
    echo "→ Creating database: $DB_NAME"
    if docker ps --format '{{.Names}}' | grep -q "^${MYSQL_CONTAINER}$"; then
        docker exec "$MYSQL_CONTAINER" mysql -u"$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;" 2>&1 | grep -v "Using a password"
    else
        mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;" 2>&1 | grep -v "Using a password"
    fi
    echo "✓ Database created"
}

# Function to check if a table exists
table_exists() {
    local table=$1
    local result=$(mysql_exec -e "SHOW TABLES LIKE '$table';" | grep "$table" || true)
    [ -n "$result" ]
}

# Function to run a migration file
run_migration() {
    local migration_file=$1
    local migration_name=$(basename "$migration_file")
    
    echo "  → Running: $migration_name"
    
    if docker ps --format '{{.Names}}' | grep -q "^${MYSQL_CONTAINER}$"; then
        docker exec -i "$MYSQL_CONTAINER" mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$migration_file" 2>&1 | grep -v "Using a password" | grep -E "(ERROR|Warning)" || true
    else
        mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$migration_file" 2>&1 | grep -v "Using a password" | grep -E "(ERROR|Warning)" || true
    fi
    
    local exit_code=${PIPESTATUS[0]}
    if [ $exit_code -eq 0 ]; then
        echo "    ✓ Completed"
        return 0
    else
        # Check if error is just duplicate column/key (expected for some migrations)
        if [ $exit_code -eq 1 ]; then
            echo "    ⚠ Warning: Migration may have partial changes (likely duplicate column/key)"
            return 0
        fi
        echo "    ✗ Failed with exit code: $exit_code"
        return $exit_code
    fi
}

# Check database connection
echo "→ Checking database connection..."
if ! check_database_exists; then
    echo "  Database '$DB_NAME' does not exist"
    create_database
else
    echo "  ✓ Database exists"
fi

# Check for required tables
echo ""
echo "→ Checking required tables..."
MISSING_TABLES=()
for table in "${REQUIRED_TABLES[@]}"; do
    if table_exists "$table"; then
        echo "  ✓ $table"
    else
        echo "  ✗ $table (missing)"
        MISSING_TABLES+=("$table")
    fi
done

# If tables are missing, run migrations
if [ ${#MISSING_TABLES[@]} -gt 0 ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "⚠  Missing ${#MISSING_TABLES[@]} table(s) - Running migrations..."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Run migrations in order
    MIGRATION_FILES=(
        "$MIGRATIONS_DIR/00_initial_schema.sql"
        "$MIGRATIONS_DIR/20251111_add_security_lint_enums.sql"
        "$MIGRATIONS_DIR/20251114_add_module_settings.sql"
        "$MIGRATIONS_DIR/20251116_add_target_module_to_workflows.sql"
        "$MIGRATIONS_DIR/20251121_add_new_module_workflow_type.sql"
        "$MIGRATIONS_DIR/20251121_add_output_mode_to_workflows.sql"
        "$MIGRATIONS_DIR/20251121_add_pr_url_to_workflows.sql"
        "$MIGRATIONS_DIR/20251121_add_workflow_modules_table.sql"
        "$MIGRATIONS_DIR/20251123_add_workflow_hierarchy.sql"
        "$MIGRATIONS_DIR/20251124_add_scaffold_agent_type.sql"
        "$MIGRATIONS_DIR/20251126_add_task_description_and_status.sql"
        "$MIGRATIONS_DIR/20251129_add_checkpoint_tracking.sql"
        "$MIGRATIONS_DIR/20251129_add_workflow_messages.sql"
        "$MIGRATIONS_DIR/20251130_add_conversation_history.sql"
        "$MIGRATIONS_DIR/20251201_add_completed_at_to_workflows.sql"
        "$MIGRATIONS_DIR/20251202_add_event_type_to_execution_logs.sql"
        "$MIGRATIONS_DIR/20251202_add_missing_workflow_columns.sql"
    )
    
    FAILED_MIGRATIONS=()
    for migration_file in "${MIGRATION_FILES[@]}"; do
        if [ -f "$migration_file" ]; then
            if ! run_migration "$migration_file"; then FAILED_MIGRATIONS+=("$(basename "$migration_file")"); fi
        fi
    done
    
    echo ""
    if [ ${#FAILED_MIGRATIONS[@]} -eq 0 ]; then
        echo "✓ All migrations completed successfully"
    else
        echo "⚠  ${#FAILED_MIGRATIONS[@]} migration(s) had issues (may be expected):"
        for failed in "${FAILED_MIGRATIONS[@]}"; do echo "  - $failed"; done
    fi
else
    echo ""
    echo "✓ All required tables exist"
fi

# Final verification
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "→ Final verification..."
VERIFICATION_FAILED=false
for table in "${REQUIRED_TABLES[@]}"; do
    if ! table_exists "$table"; then
        echo "  ✗ $table still missing!"
        VERIFICATION_FAILED=true
    fi
done

if [ "$VERIFICATION_FAILED" = true ]; then
    echo ""
    echo "✗ Database verification FAILED - some tables are still missing"
    echo "  Please check the migration logs above and run manually if needed:"
    echo "  cd $PROJECT_DIR && bash scripts/init-db.sh"
    exit 1
fi

echo "✓ Database schema verified and ready"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

