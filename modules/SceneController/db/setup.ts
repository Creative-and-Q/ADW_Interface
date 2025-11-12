#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupDatabase(): Promise<void> {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'scene_controller',
  };

  console.log('Connecting to MySQL...');
  console.log(`Host: ${config.host}:${config.port}`);
  console.log(`Database: ${config.database}`);

  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\``);
    console.log(`✓ Database '${config.database}' ready`);

    await connection.query(`USE \`${config.database}\``);

    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await connection.query(statement);
    }

    console.log('✓ Schema created successfully');

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

setupDatabase().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
