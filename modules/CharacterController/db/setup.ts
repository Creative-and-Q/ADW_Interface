#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Setup database and run schema
 */
async function setupDatabase(): Promise<void> {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'rootpass',
    database: process.env.DB_NAME || 'character_controller',
  };

  console.log('Connecting to MySQL...');
  console.log(`Host: ${config.host}:${config.port}`);
  console.log(`Database: ${config.database}`);

  // Connect without database first to create it if needed
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
  });

  try {
    // Create database if it doesn't exist
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\``);
    console.log(`✓ Database '${config.database}' ready`);

    // Switch to database
    await connection.query(`USE \`${config.database}\``);

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split by semicolon and execute each statement
    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await connection.query(statement);
    }

    console.log('✓ Schema created successfully');

    // Verify tables
    const [tables] = await connection.query('SHOW TABLES');
    console.log('\nTables created:');
    for (const table of tables as any[]) {
      const tableName = Object.values(table)[0];
      console.log(`  - ${tableName}`);
    }

    console.log('\n✅ Database setup complete!');
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

// Run setup
setupDatabase().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
