import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function setupDatabase() {
  console.log('🔧 Setting up AIController database...\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    console.log('📖 Reading schema file...');
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    console.log('🗄️  Executing schema...');
    await connection.query(schema);

    console.log('✅ Database setup complete!\n');
    console.log('📊 Created:');
    console.log('   - Database: ai_controller');
    console.log('   - Tables:');
    console.log('      • chain_configurations');
    console.log('      • execution_history');
    console.log('   - Views:');
    console.log('      • execution_statistics');
    console.log('   - Sample chains: 2');
    console.log('\n✨ AIController database is ready to use!');
  } catch (error) {
    console.error('❌ Error setting up database:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

setupDatabase().catch(console.error);
