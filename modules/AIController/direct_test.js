import { config } from 'dotenv';
config(); // Load .env file

import { ChainManager } from './src/chain-manager.js';
import { MySQLStorage } from './src/mysql-storage.js';
import { ModuleClients } from './src/module-clients.js';
import { ExecutionEngine } from './src/execution-engine.js';

async function testChainExecution() {
  console.log('Testing chain 9 execution directly...\n');

  // Initialize components
  const storage = new MySQLStorage();
  const moduleClients = new ModuleClients();
  const executionEngine = new ExecutionEngine(moduleClients);
  executionEngine.setStorage(storage);
  const chainManager = new ChainManager(storage, executionEngine);
  
  // Wait for storage to initialize
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    // Execute chain 9
    const result = await chainManager.executeChain(9, { userId: 'testuser' }, 'admin');
    
    console.log('Execution result:');
    console.log('- Success:', result.success);
    console.log('- Chain:', result.chain_name);
    console.log('- Output:', JSON.stringify(result.output, null, 2));
    console.log('- Steps:', result.steps.length);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await storage.close();
  }
}

testChainExecution();
