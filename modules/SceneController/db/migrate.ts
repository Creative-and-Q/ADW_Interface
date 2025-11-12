import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration(migrationFile: string) {
  console.log(`\nRunning migration: ${migrationFile}...`);
  console.log(`Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
  console.log(`Database: ${process.env.DB_NAME}`);

  try {
    // Create connection
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'scene_controller',
      multipleStatements: true,
    });

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    const migration = fs.readFileSync(migrationPath, 'utf-8');

    // Remove comments and split by semicolons
    const cleanedMigration = migration
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    const statements = cleanedMigration
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    console.log(`Executing ${statements.length} statements...`);
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        console.log(`  [${i + 1}/${statements.length}] Executing...`);
        await connection.query(statement);
      } catch (error: any) {
        // Ignore "Duplicate column" errors (migration already ran)
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log(`  ⚠ Column already exists, skipping...`);
        } else {
          throw error;
        }
      }
    }

    console.log('✓ Migration completed successfully');

    // Show updated tables
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('\nCurrent tables:');
    (tables as any[]).forEach((row) => {
      const tableName = Object.values(row)[0];
      console.log(`  - ${tableName}`);
    });

    await connection.end();
    console.log('\n✅ Migration complete!');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Get migration file from command line or default to hierarchy migration
const migrationFile = process.argv[2] || '002_add_hierarchy.sql';
runMigration(migrationFile);
