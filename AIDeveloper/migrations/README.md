# Database Migrations

This directory contains SQL migration files for the AIDeveloper database schema.

## Migration Naming Convention

Migrations are named with the format: `YYYYMMDD_description.sql`

Example: `20251111_add_security_lint_enums.sql`

## Running Migrations

To apply a migration manually:

```bash
mysql -u root -prootpass aideveloper < migrations/20251111_add_security_lint_enums.sql
```

Or using the environment variables from .env:

```bash
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < migrations/filename.sql
```

## Migration History

- **20251111_add_security_lint_enums.sql**: Added security_lint and security_linting enum values to support SecurityLintAgent in the workflow pipeline.

## Best Practices

1. **Always test migrations** on a development database before applying to production
2. **Create rollback scripts** for migrations that modify data (not just schema)
3. **Document changes** in this README after creating new migrations
4. **Use transactions** when possible to ensure atomicity
5. **Version control** all migration files

## Future Improvements

Consider implementing:
- Automated migration runner (e.g., using Knex.js migrations)
- Migration tracking table to record applied migrations
- Rollback scripts for each migration
- CI/CD integration for automatic migration application
