import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MySQLStorage } from './mysql-storage.js';
import { ModuleClients } from './module-clients.js';
import { ExecutionEngine } from './execution-engine.js';
import { ChainManager } from './chain-manager.js';
import { ModuleProcessManager } from './module-process-manager.js';
import { AIAgent } from './ai-agent.js';
import {
  CreateChainRequestSchema,
  UpdateChainRequestSchema,
  ExecuteChainRequestSchema,
  ExecuteAdHocChainRequestSchema,
  ApiResponse,
  ModuleName,
} from './types.js';
import { ZodError } from 'zod';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3035');

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Initialize components
const storage = new MySQLStorage();
const moduleClients = new ModuleClients();
const executionEngine = new ExecutionEngine(moduleClients);
executionEngine.setStorage(storage); // Enable chain invocation support
const chainManager = new ChainManager(storage, executionEngine);
const processManager = new ModuleProcessManager();
const aiAgent = new AIAgent(chainManager);

// ============================================================================
// Chain Configuration Endpoints
// ============================================================================

/**
 * Create a new chain configuration
 */
app.post('/chain', async (req: Request, res: Response) => {
  try {
    console.log('Received chain creation request:', JSON.stringify(req.body, null, 2));
    const request = CreateChainRequestSchema.parse(req.body);
    console.log('Validation passed, creating chain...');
    const chain = await chainManager.createChain(request);
    console.log('Chain created successfully:', chain.id);

    const response: ApiResponse = {
      success: true,
      data: chain,
      message: 'Chain created successfully',
    };
    res.status(201).json(response);
  } catch (error: any) {
    console.error('Error creating chain:', error);
    handleError(res, error);
  }
});

/**
 * Get chain by ID
 */
app.get('/chain/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.query.userId as string | undefined;

    const chain = await chainManager.getChain(id, userId);

    const response: ApiResponse = {
      success: true,
      data: chain,
    };
    res.json(response);
  } catch (error: any) {
    handleError(res, error);
  }
});

/**
 * Get all chains for a user
 */
app.get('/chains/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const chains = await chainManager.getUserChains(userId);

    const response: ApiResponse = {
      success: true,
      data: chains,
    };
    res.json(response);
  } catch (error: any) {
    handleError(res, error);
  }
});

/**
 * Get all chains (admin)
 */
app.get('/chains', async (_req: Request, res: Response) => {
  try {
    const chains = await chainManager.getAllChains();

    const response: ApiResponse = {
      success: true,
      data: chains,
    };
    res.json(response);
  } catch (error: any) {
    handleError(res, error);
  }
});

/**
 * Update chain
 */
app.patch('/chain/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.query.userId as string | undefined;
    const updates = UpdateChainRequestSchema.parse(req.body);

    const chain = await chainManager.updateChain(id, updates, userId);

    const response: ApiResponse = {
      success: true,
      data: chain,
      message: 'Chain updated successfully',
    };
    res.json(response);
  } catch (error: any) {
    handleError(res, error);
  }
});

/**
 * Delete chain
 */
app.delete('/chain/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.query.userId as string | undefined;

    await chainManager.deleteChain(id, userId);

    const response: ApiResponse = {
      success: true,
      message: 'Chain deleted successfully',
    };
    res.json(response);
  } catch (error: any) {
    handleError(res, error);
  }
});

// ============================================================================
// Chain Execution Endpoints
// ============================================================================

/**
 * Execute a saved chain
 */
app.post('/execute/:chainId', async (req: Request, res: Response) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const { input, env } = ExecuteChainRequestSchema.parse(req.body);
    const userId = req.query.userId as string;

    if (!userId) {
      throw new Error('userId query parameter is required');
    }

    const result = await chainManager.executeChain(chainId, input, userId, env);

    const response: ApiResponse = {
      success: result.success,
      data: result,
      message: result.success ? 'Chain executed successfully' : 'Chain execution failed',
      error: result.error,
    };

    res.status(result.success ? 200 : 500).json(response);
  } catch (error: any) {
    handleError(res, error);
  }
});

/**
 * Execute an ad-hoc chain (without saving)
 */
app.post('/execute', async (req: Request, res: Response) => {
  try {
    const { user_id, name, steps, input, output_template, env } = ExecuteAdHocChainRequestSchema.parse(req.body);

    const result = await chainManager.executeAdHocChain(
      name || 'Ad-hoc Chain',
      steps,
      input,
      user_id,
      output_template,
      env
    );

    const response: ApiResponse = {
      success: result.success,
      data: result,
      message: result.success ? 'Chain executed successfully' : 'Chain execution failed',
      error: result.error,
    };

    res.status(result.success ? 200 : 500).json(response);
  } catch (error: any) {
    handleError(res, error);
  }
});

/**
 * Get execution result by ID
 */
app.get('/execution/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.query.userId as string | undefined;

    const execution = await chainManager.getExecution(id, userId);

    const response: ApiResponse = {
      success: true,
      data: execution,
    };
    res.json(response);
  } catch (error: any) {
    handleError(res, error);
  }
});

/**
 * Get execution history for a user
 */
app.get('/executions/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const limit = parseInt(req.query.limit as string) || 100;

    const executions = await chainManager.getUserExecutions(userId, limit);

    const response: ApiResponse = {
      success: true,
      data: executions,
    };
    res.json(response);
  } catch (error: any) {
    handleError(res, error);
  }
});

/**
 * Get execution history for a chain
 */
app.get('/chain/:chainId/executions', async (req: Request, res: Response) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const limit = parseInt(req.query.limit as string) || 100;

    const executions = await chainManager.getChainExecutions(chainId, limit);

    const response: ApiResponse = {
      success: true,
      data: executions,
    };
    res.json(response);
  } catch (error: any) {
    handleError(res, error);
  }
});

// ============================================================================
// Module Metadata Endpoints
// ============================================================================

/**
 * Get available modules
 */
app.get('/modules', async (_req: Request, res: Response) => {
  try {
    const modules = chainManager.getModules();

    const response: ApiResponse = {
      success: true,
      data: modules,
    };
    res.json(response);
  } catch (error: any) {
    handleError(res, error);
  }
});

/**
 * Get module by type
 */
app.get('/modules/:type', async (req: Request, res: Response) => {
  try {
    const type = req.params.type as any;
    const module = chainManager.getModule(type);

    if (!module) {
      throw new Error(`Module ${type} not found`);
    }

    const response: ApiResponse = {
      success: true,
      data: module,
    };
    res.json(response);
  } catch (error: any) {
    handleError(res, error);
  }
});

// ============================================================================
// Module Process Control Endpoints
// ============================================================================

/**
 * Get all module process statuses
 */
app.get('/module-processes', async (_req: Request, res: Response) => {
  try {
    const modules = await processManager.getAllModulesInfo();

    // Enhance with health check status
    const moduleHealth = await moduleClients.healthCheck();
    const enhancedModules = modules.map((module) => {
      // Map module name to module type for health check
      const typeMap: Record<string, string> = {
        CharacterController: 'character',
        ItemController: 'item',
        SceneController: 'scene',
        IntentInterpreter: 'intent',
        StoryTeller: 'storyteller',
      };
      const moduleType = typeMap[module.name];
      return {
        ...module,
        healthy: moduleHealth[moduleType as keyof typeof moduleHealth] || false,
      };
    });

    const response: ApiResponse = {
      success: true,
      data: enhancedModules,
    };
    res.json(response);
  } catch (error: any) {
    handleError(res, error);
  }
});

/**
 * Get single module process status
 */
app.get('/module-processes/:name', async (req: Request, res: Response) => {
  try {
    const name = req.params.name as ModuleName;
    const moduleInfo = await processManager.getModuleInfo(name);

    // Enhance with health check
    const moduleHealth = await moduleClients.healthCheck();
    const typeMap: Record<string, string> = {
      CharacterController: 'character',
      ItemController: 'item',
      SceneController: 'scene',
      IntentInterpreter: 'intent',
      StoryTeller: 'storyteller',
    };
    const moduleType = typeMap[name];

    const response: ApiResponse = {
      success: true,
      data: {
        ...moduleInfo,
        healthy: moduleHealth[moduleType as keyof typeof moduleHealth] || false,
      },
    };
    res.json(response);
  } catch (error: any) {
    handleError(res, error);
  }
});

/**
 * Start a module
 */
app.post('/module-processes/:name/start', async (req: Request, res: Response): Promise<any> => {
  try {
    const name = req.params.name as ModuleName;
    const forceKillPort = req.body?.forceKillPort === true;
    console.log(`Received request to start ${name}${forceKillPort ? ' (force kill port)' : ''}`);

    const moduleInfo = await processManager.startModule(name, forceKillPort);

    const response: ApiResponse = {
      success: true,
      data: moduleInfo,
      message: `Module ${name} started successfully`,
    };
    return res.json(response);
  } catch (error: any) {
    console.error(`Error starting module:`, error);

    // If it's a port conflict, include that info in the response
    if (error.portConflict) {
      const response: ApiResponse = {
        success: false,
        error: error.message,
        data: error.portConflict,
      };
      return res.status(409).json(response);
    }

    return handleError(res, error);
  }
});

/**
 * Stop a module
 */
app.post('/module-processes/:name/stop', async (req: Request, res: Response) => {
  try {
    const name = req.params.name as ModuleName;
    console.log(`Received request to stop ${name}`);

    const moduleInfo = await processManager.stopModule(name);

    const response: ApiResponse = {
      success: true,
      data: moduleInfo,
      message: `Module ${name} stopped successfully`,
    };
    res.json(response);
  } catch (error: any) {
    console.error(`Error stopping module:`, error);
    handleError(res, error);
  }
});

/**
 * Restart a module
 */
app.post('/module-processes/:name/restart', async (req: Request, res: Response) => {
  try {
    const name = req.params.name as ModuleName;
    console.log(`Received request to restart ${name}`);

    const moduleInfo = await processManager.restartModule(name);

    const response: ApiResponse = {
      success: true,
      data: moduleInfo,
      message: `Module ${name} restarted successfully`,
    };
    res.json(response);
  } catch (error: any) {
    console.error(`Error restarting module:`, error);
    handleError(res, error);
  }
});

/**
 * Start all modules
 */
app.post('/module-processes/start-all', async (req: Request, res: Response) => {
  try {
    const forceKillPorts = req.body?.forceKillPorts === true;
    console.log(`Received request to start all modules${forceKillPorts ? ' (force kill ports)' : ''}`);

    const moduleNames: ModuleName[] = ['CharacterController', 'IntentInterpreter', 'SceneController', 'ItemController', 'StoryTeller'];
    const results: { name: string; success: boolean; data?: any; error?: string }[] = [];

    for (const name of moduleNames) {
      try {
        const moduleInfo = await processManager.startModule(name, forceKillPorts);
        results.push({
          name,
          success: true,
          data: moduleInfo
        });
        console.log(`✅ Started ${name}`);
      } catch (error: any) {
        results.push({
          name,
          success: false,
          error: error.message
        });
        console.error(`❌ Failed to start ${name}:`, error.message);
      }

      // Small delay between starts to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const successful = results.filter(r => r.success).length;
    const total = results.length;

    const response: ApiResponse = {
      success: successful > 0,
      data: {
        results,
        summary: {
          successful,
          failed: total - successful,
          total
        }
      },
      message: `Started ${successful}/${total} modules successfully`,
    };
    res.json(response);
  } catch (error: any) {
    console.error(`Error starting all modules:`, error);
    handleError(res, error);
  }
});

// ============================================================================
// Health & Statistics
// ============================================================================

/**
 * Health check
 */
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const dbHealth = await storage.healthCheck();
    const moduleHealth = await moduleClients.healthCheck();

    const allHealthy = dbHealth && Object.values(moduleHealth).every((h) => h);

    const response: ApiResponse = {
      success: allHealthy,
      data: {
        database: dbHealth,
        modules: moduleHealth,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      message: allHealthy ? 'All systems operational' : 'Some systems are down',
    };

    res.status(allHealthy ? 200 : 503).json(response);
  } catch (error: any) {
    handleError(res, error);
  }
});

/**
 * Get statistics
 */
app.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await chainManager.getStatistics();

    const response: ApiResponse = {
      success: true,
      data: stats,
    };
    res.json(response);
  } catch (error: any) {
    handleError(res, error);
  }
});

// ============================================================================
// Error Handling
// ============================================================================

function handleError(res: Response, error: any): Response {
  console.error('Error:', error);

  let status = 500;
  let message = 'Internal server error';

  if (error instanceof ZodError) {
    status = 400;
    message = 'Validation error';
    const response: ApiResponse = {
      success: false,
      error: message,
      data: error.errors,
    };
    return res.status(status).json(response);
  }

  if (error.message.includes('not found')) {
    status = 404;
    message = error.message;
  } else if (error.message.includes('Unauthorized')) {
    status = 403;
    message = error.message;
  } else if (error.message) {
    message = error.message;
  }

  const response: ApiResponse = {
    success: false,
    error: message,
  };

  return res.status(status).json(response);
}

// ============================================================================
// AI Agent Endpoints
// ============================================================================

/**
 * POST /ai/chat
 * Chat with the AI agent to create, modify, and manage chains
 */
app.post('/ai/chat', async (req: Request, res: Response) => {
  console.log('📨 AI Chat request received');
  console.log('📨 Request body:', JSON.stringify(req.body, null, 2));

  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      console.log('❌ Invalid request - no messages array');
      const response: ApiResponse = {
        success: false,
        error: 'Invalid request: messages array required',
      };
      return res.status(400).json(response);
    }

    console.log(`📨 Processing ${messages.length} messages`);
    const aiResponse = await aiAgent.chat(messages);

    console.log('✅ AI response ready');
    const response: ApiResponse = {
      success: true,
      data: aiResponse,
    };

    return res.json(response);
  } catch (error: any) {
    console.error('❌ AI chat error:', error);
    const response: ApiResponse = {
      success: false,
      error: error.message || 'Failed to process AI request',
    };
    return res.status(500).json(response);
  }
});

// 404 handler
app.use((_req: Request, res: Response) => {
  const response: ApiResponse = {
    success: false,
    error: 'Not found',
  };
  res.status(404).json(response);
});

// ============================================================================
// Server Startup
// ============================================================================

app.listen(PORT, () => {
  console.log('\n🤖 AIController Server');
  console.log('='.repeat(50));
  console.log(`🌐 Server running on http://localhost:${PORT}`);
  console.log(`📊 Database: ${process.env.DB_NAME || 'ai_controller'}`);
  console.log(`🔌 Modules:`);
  console.log(`   - IntentInterpreter: ${process.env.INTENT_INTERPRETER_URL || 'http://localhost:3032'}`);
  console.log(`   - CharacterController: ${process.env.CHARACTER_CONTROLLER_URL || 'http://localhost:3031'}`);
  console.log(`   - SceneController: ${process.env.SCENE_CONTROLLER_URL || 'http://localhost:3033'}`);
  console.log(`   - ItemController: ${process.env.ITEM_CONTROLLER_URL || 'http://localhost:3034'}`);
  console.log('='.repeat(50));
  console.log('✨ Ready to orchestrate chains!\n');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await processManager.cleanup();
  await storage.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await processManager.cleanup();
  await storage.close();
  process.exit(0);
});
