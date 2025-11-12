import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupDatabase() {
  console.log('Connecting to MySQL...');
  console.log(`Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
  console.log(`Database: ${process.env.DB_NAME}`);

  try {
    // Create connection without database
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    });

    // Create database if it doesn't exist
    const dbName = process.env.DB_NAME || 'item_controller';
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`✓ Database '${dbName}' ready`);

    // Switch to the database
    await connection.query(`USE \`${dbName}\``);

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Remove comments and split by semicolons
    const cleanedSchema = schema
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    const statements = cleanedSchema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 10); // Filter out empty or very short statements

    console.log(`Executing ${statements.length} statements...`);
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`  [${i + 1}/${statements.length}] Executing...`);
      await connection.query(statement);
    }

    console.log('✓ Schema created successfully');

    // Get list of created tables
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('\nTables created:');
    (tables as any[]).forEach((row) => {
      const tableName = Object.values(row)[0];
      console.log(`  - ${tableName}`);
    });

    await connection.end();
    console.log('\n✅ Database setup complete!');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

setupDatabase();
