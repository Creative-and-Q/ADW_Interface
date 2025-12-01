#!/bin/bash
# Initialize database with migrations (wrapper for check-and-migrate-db.sh)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Initializing AIDeveloper database..."
echo ""

# Run the comprehensive database check and migration script
bash "$SCRIPT_DIR/check-and-migrate-db.sh"

exit $?

