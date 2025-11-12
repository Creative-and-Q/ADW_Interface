import mysql from 'mysql2/promise';

async function fixRouting() {
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
    
    // Fix the conditional routing rules
    if (steps[2] && steps[2].conditionalRouting) {
      // Rule 1: step_3.success == false
      steps[2].conditionalRouting[0].condition = {
        field: 'step_3.success',
        operator: 'equals',
        value: false
      };
      
      // Rule 2: step_3.success == true  
      steps[2].conditionalRouting[1].condition = {
        field: 'step_3.success',
        operator: 'equals',
        value: true
      };
    }
    
    // Update the database
    await connection.execute('UPDATE chain_configurations SET steps = ? WHERE id = 9', [JSON.stringify(steps)]);
    
    console.log('âœ… Fixed conditional routing rules for chain 9');
    console.log('Rule 1: step_3.success equals false â†’ jump to chain 10');
    console.log('Rule 2: step_3.success equals true â†’ jump to chain 10');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

fixRouting();
