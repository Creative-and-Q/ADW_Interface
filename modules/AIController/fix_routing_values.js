import mysql from 'mysql2/promise';

async function fixRoutingValues() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'rootpass',
    database: 'ai_controller'
  });

  try {
    // Get current steps
    const [rows] = await connection.execute('SELECT steps FROM chain_configurations WHERE id = 9');
    const steps = rows[0].steps;

    // Fix the conditional routing rule values
    if (steps[2] && steps[2].conditionalRouting) {
      // Rule 1: change "false" to false
      steps[2].conditionalRouting[0].condition.value = false;

      // Rule 2: change "true" to true
      steps[2].conditionalRouting[1].condition.value = true;
    }

    // Update the database
    await connection.execute('UPDATE chain_configurations SET steps = ? WHERE id = 9', [JSON.stringify(steps)]);

    console.log('✅ Fixed routing rule values to use booleans');
    console.log('Rule 1 value: false (boolean)');
    console.log('Rule 2 value: true (boolean)');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

fixRoutingValues();


