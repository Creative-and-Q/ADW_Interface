import mysql from 'mysql2/promise';

async function testDB() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'rootpass',
    database: 'ai_controller'
  });

  try {
    const [rows] = await connection.execute('SELECT id, name, description FROM chain_configurations');
    console.log('Chains in database:', rows.length);
    rows.forEach(row => {
      console.log(`- ${row.id}: ${row.name} - ${row.description || 'No description'}`);
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

testDB();
