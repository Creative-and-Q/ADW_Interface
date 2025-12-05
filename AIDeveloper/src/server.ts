/**
 * AIDeveloper Server
 * Main entry point for the AI-powered development workflow orchestrator
 */

import express, { Express, Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import * as logger from './utils/logger.js';
import { initializeDatabase, checkDatabaseHealth, query } from './database.js';
import { setSocketIo } from './websocket-emitter.js';
import apiRoutes from './api-routes.js';
import { deploymentManager } from './utils/deployment-manager.js';
import { cleanupStuckAgents, getRunningAgentCount, resumeInterruptedWorkflows, cleanupStuckWorkflows, cleanupOrphanWorkflows } from './workflow-state.js';
import { discoverModules, readModuleManifest, getModulesPath } from './utils/module-manager.js';
import { getAllModuleEnvVarValues, writeEnvFile } from './utils/module-env-manager.js';
import { startAutoUpdateCheck, stopAutoUpdateCheck } from './utils/module-auto-updater.js';

// ES Module dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app: Express = express();
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Cleanup job interval
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Configure Express middleware
 */
function setupMiddleware() {
  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false, // Disable for development
  }));

  // CORS
  app.use(cors({
    origin: '*',
    credentials: true,
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging middleware
  app.use((req: Request, _res: Response, next) => {
    logger.debug(`${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      query: req.query,
    });
    next();
  });
}

/**
 * Configure API routes
 */
function setupRoutes() {
  // Health check endpoint
  app.get('/health', async (_req: Request, res: Response) => {
    try {
      const dbHealthy = await checkDatabaseHealth();

      const health = {
        status: dbHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dbHealthy ? 'connected' : 'disconnected',
      };

      res.status(dbHealthy ? 200 : 503).json(health);
    } catch (error) {
      logger.error('Health check failed', error as Error);
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      });
    }
  });

  // API routes
  app.use('/api', apiRoutes);

  // DEPRECATED: Webhook routes (workflow functionality moved to WorkflowOrchestrator module)
  app.post('/webhooks/:source', async (_req: Request, res: Response) => {
    res.status(501).json({
      success: false,
      error: 'Webhook functionality has been moved to the WorkflowOrchestrator module',
      message: 'Please use the WorkflowOrchestrator module for workflow management',
    });
  });

  // Serve static files from frontend/dist
  // Note: Compiled code is in dist/, so we need to go up 1 level to AIDeveloper root
  const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendDistPath));

  // SPA fallback - serve index.html for all other routes
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });

  // Error handler
  app.use((error: Error, _req: Request, res: Response, _next: any) => {
    logger.error('Unhandled error', error);
    res.status(500).json({
      error: 'Internal server error',
      message: config.nodeEnv === 'development' ? error.message : undefined,
    });
  });
}

/**
 * Load environment variables from database into process.env and .env file
 * This ensures agents can access database-stored environment variables
 */
async function loadDatabaseEnvVars() {
  try {
    logger.info('Loading environment variables from database...');

    const envVars = await getAllModuleEnvVarValues();

    // Create a map of environment variables
    const envMap: Record<string, string> = {};
    let loadedCount = 0;

    for (const envVar of envVars) {
      if (envVar.value) {
        envMap[envVar.key] = envVar.value;
        // Also set in process.env
        process.env[envVar.key] = envVar.value;
        loadedCount++;
      }
    }

    // Write to .env file so agents can load them with dotenv.config()
    if (loadedCount > 0) {
      await writeEnvFile(envMap);
      logger.info(`Loaded ${loadedCount} environment variables from database and wrote to .env file`);
    } else {
      logger.info('No environment variables to load from database');
    }
  } catch (error) {
    logger.error('Failed to load database environment variables', error as Error);
    // Don't throw - this shouldn't prevent server startup
  }
}

/**
 * Auto-start modules that have auto_load enabled
 */
async function autoStartModules() {
  try {
    logger.info('Checking for auto-load modules...');

    const autoLoadModules = await query(
      'SELECT module_name FROM module_settings WHERE auto_load = TRUE'
    );

    if (autoLoadModules.length === 0) {
      logger.info('No auto-load modules configured');
      return;
    }

    logger.info(`Found ${autoLoadModules.length} auto-load module(s)`, {
      modules: autoLoadModules.map((m: any) => m.module_name)
    });

    // Start each module with a delay between starts
    for (const row of autoLoadModules) {
      const moduleName = row.module_name;
      try {
        // Check if module is a library type (should not be auto-started)
        const manifest = await readModuleManifest(moduleName);
        if (manifest?.type === 'library') {
          logger.info(`Skipping library module: ${moduleName}`);
          continue;
        }

        logger.info(`Auto-starting module: ${moduleName}`);
        await deploymentManager.startModule(moduleName);
        logger.info(`Auto-started module: ${moduleName}`);

        // Wait a bit before starting the next module
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        logger.error(`Failed to auto-start module: ${moduleName}`, error as Error);
        // Continue with other modules even if one fails
      }
    }

    logger.info('Auto-load complete');
  } catch (error) {
    logger.error('Failed to auto-start modules', error as Error);
  }
}

/**
 * Clear stale Redis workflow locks from previous server instances
 * This prevents locks from blocking workflow execution after restart
 */
async function clearStaleWorkflowLocks() {
  try {
    const { createClient } = await import('redis');
    const client = createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`,
      password: config.redis.password || undefined,
    });
    await client.connect();

    const keys = await client.keys('workflow_tree_lock:*');

    if (keys.length > 0) {
      await client.del(keys);
      logger.info(`Cleared ${keys.length} stale workflow lock(s) from previous server instance`, {
        clearedLocks: keys,
      });
    }

    await client.disconnect();
  } catch (error) {
    logger.error('Failed to clear stale workflow locks', error as Error);
    // Don't throw - this shouldn't prevent server startup
  }
}

/**
 * Resume workflows that were interrupted by server restart/power outage
 * This runs after database connection is established
 */
async function resumeInterruptedWorkflowsOnStartup() {
  try {
    // First, clear any stale Redis locks from previous server instances
    await clearStaleWorkflowLocks();

    logger.info('Checking for interrupted workflows to resume...');

    const result = await resumeInterruptedWorkflows(30); // 30 minutes threshold

    if (result.recoveredWorkflows > 0) {
      console.log(`\n${'!'.repeat(60)}`);
      console.log(`⚠️  RECOVERED ${result.recoveredWorkflows} INTERRUPTED WORKFLOW(S)`);
      console.log(`${'!'.repeat(60)}`);
      console.log(`Workflows: ${result.workflowIds.join(', ')}`);
      console.log(`Agents recovered: ${result.recoveredAgents}`);
      console.log(`These workflows have been reset to 'pending' status.`);
      console.log(`Use the advance-queue API to restart execution.`);
      console.log(`${'!'.repeat(60)}\n`);

      // Auto-advance the queue for parent workflows that have recovered children
      // This will restart the execution chain
      await autoAdvanceRecoveredWorkflows(result.workflowIds);
    } else {
      logger.info('No interrupted workflows found - clean startup');
    }
  } catch (error) {
    logger.error('Failed to resume interrupted workflows', error as Error);
    // Don't throw - we still want the server to start
  }
}

/**
 * Auto-advance the sub-workflow queue for recovered workflows
 * This restarts execution for workflows that were interrupted mid-execution
 */
async function autoAdvanceRecoveredWorkflows(workflowIds: number[]) {
  if (workflowIds.length === 0) return;

  try {
    // Import the advance function dynamically to avoid circular imports
    const { advanceSubWorkflowQueue } = await import('./sub-workflow-queue.js');
    const { getWorkflow } = await import('./workflow-state.js');

    // Find parent workflows that need their queues advanced
    const parentWorkflowIds = new Set<number>();

    for (const workflowId of workflowIds) {
      const workflow = await getWorkflow(workflowId);
      if (!workflow) continue;

      // Check if this workflow has a parent (it's a sub-workflow)
      const parentResult = await query<any[]>(
        `SELECT parent_workflow_id FROM sub_workflow_queue WHERE child_workflow_id = ?`,
        [workflowId]
      );

      if (parentResult.length > 0 && parentResult[0].parent_workflow_id) {
        parentWorkflowIds.add(parentResult[0].parent_workflow_id);
      }
    }

    // Advance the queue for each parent workflow
    for (const parentId of parentWorkflowIds) {
      try {
        logger.info(`Auto-advancing queue for parent workflow ${parentId} after recovery`);
        const nextWorkflowId = await advanceSubWorkflowQueue(parentId);

        if (nextWorkflowId) {
          logger.info(`Advanced to next workflow in queue`, {
            parentWorkflowId: parentId,
            nextWorkflowId,
          });
        } else {
          logger.info(`No pending workflows to advance for parent ${parentId}`);
        }
      } catch (advanceError) {
        logger.error(`Failed to advance queue for parent ${parentId}`, advanceError as Error);
        // Continue with other parents
      }
    }
  } catch (error) {
    logger.error('Failed to auto-advance recovered workflows', error as Error);
  }
}

/**
 * Check all modules for missing module.json and trigger ModuleImportAgent
 */
async function checkModuleManifests() {
  try {
    logger.info('Checking modules for missing manifests...');

    const modules = await discoverModules();
    const modulesWithoutManifest: string[] = [];

    for (const module of modules) {
      // Skip the ModuleImportAgent itself to avoid circular dependency
      if (module.name === 'ModuleImportAgent') {
        continue;
      }

      const manifest = await readModuleManifest(module.name);
      if (!manifest) {
        modulesWithoutManifest.push(module.name);
      }
    }

    if (modulesWithoutManifest.length === 0) {
      logger.info('All modules have manifests');
      return;
    }

    logger.info(`Found ${modulesWithoutManifest.length} module(s) without manifest`, {
      modules: modulesWithoutManifest,
    });

    // Trigger ModuleImportAgent for each module without manifest
    for (const moduleName of modulesWithoutManifest) {
      try {
        logger.info(`Triggering ModuleImportAgent for ${moduleName}`);

        const modulesPath = getModulesPath();
        const agentPath = `file://${modulesPath}/ModuleImportAgent/index.js`;
        const { default: ModuleImportAgent } = await import(agentPath);

        const agent = new ModuleImportAgent();
        const modulePath = path.join(modulesPath, moduleName);

        const result = await agent.execute({
          modulePath,
          moduleName,
          workingDir: modulePath,
        });

        if (result.success) {
          if (result.validation?.allPassed) {
            logger.info(`Generated and validated manifest for ${moduleName}`);
          } else {
            logger.warn(`Generated manifest for ${moduleName} but validation failed - bugfix workflow triggered`, {
              workflowId: result.validation?.workflowId,
            });
          }
        } else {
          logger.error(`Failed to generate manifest for ${moduleName}: ${result.error}`);
        }

        // Wait a bit before processing next module
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(`Failed to process module ${moduleName}`, error as Error);
      }
    }

    logger.info('Module manifest check complete');
  } catch (error) {
    logger.error('Failed to check module manifests', error as Error);
  }
}

/**
 * Start periodic cleanup of stuck agents, workflows, and orphans
 * Runs every 15 minutes to clean up:
 * - Agents that have been running for over 60 minutes
 * - Workflows stuck in 'running' for over 2 hours without progress
 * - Pending children of failed parent workflows (orphans)
 */
function startPeriodicCleanup() {
  const cleanupIntervalMs = 15 * 60 * 1000; // 15 minutes
  const agentTimeoutMinutes = 60; // Mark agents as stuck after 60 minutes
  const workflowTimeoutHours = 2; // Mark workflows as stuck after 2 hours

  logger.info('Starting periodic cleanup job', {
    intervalMinutes: 15,
    agentTimeoutMinutes,
    workflowTimeoutHours,
  });

  // Run initial cleanup
  runAllCleanups(agentTimeoutMinutes, workflowTimeoutHours).catch(error => {
    logger.error('Initial cleanup failed', error as Error);
  });

  // Schedule periodic cleanup
  cleanupInterval = setInterval(async () => {
    await runAllCleanups(agentTimeoutMinutes, workflowTimeoutHours);
  }, cleanupIntervalMs);

  logger.info('Periodic cleanup job started');
}

/**
 * Run all cleanup tasks
 */
async function runAllCleanups(agentTimeoutMinutes: number, workflowTimeoutHours: number) {
  try {
    // 1. Clean up stuck agents
    const runningCount = await getRunningAgentCount();
    if (runningCount > 0) {
      logger.debug('Running periodic agent cleanup check', {
        runningAgents: runningCount,
      });

      const cleanedAgents = await cleanupStuckAgents(agentTimeoutMinutes);
      if (cleanedAgents > 0) {
        logger.warn(`Periodic cleanup: marked ${cleanedAgents} stuck agent(s) as failed`);
      }
    }

    // 2. Clean up stuck workflows (running for too long without progress)
    const cleanedWorkflows = await cleanupStuckWorkflows(workflowTimeoutHours);
    if (cleanedWorkflows > 0) {
      logger.warn(`Periodic cleanup: cleaned up ${cleanedWorkflows} stuck workflow(s)`);
    }

    // 3. Clean up orphan workflows (pending children of failed parents)
    const cleanedOrphans = await cleanupOrphanWorkflows();
    if (cleanedOrphans > 0) {
      logger.warn(`Periodic cleanup: marked ${cleanedOrphans} orphan workflow(s) as skipped`);
    }
  } catch (error) {
    logger.error('Periodic cleanup failed', error as Error);
  }
}

/**
 * Stop periodic cleanup
 */
function stopPeriodicCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Periodic agent cleanup job stopped');
  }
}

/**
 * Configure WebSocket handlers
 */
function setupWebSocket() {
  io.on('connection', (socket) => {
    logger.info('Client connected', { socketId: socket.id });

    // Allow clients to subscribe to workflow updates
    socket.on('subscribe:workflow', (workflowId: number) => {
      socket.join(`workflow-${workflowId}`);
      logger.debug('Client subscribed to workflow', { socketId: socket.id, workflowId });
    });

    // Unsubscribe from workflow
    socket.on('unsubscribe:workflow', (workflowId: number) => {
      socket.leave(`workflow-${workflowId}`);
      logger.debug('Client unsubscribed from workflow', { socketId: socket.id, workflowId });
    });

    socket.on('disconnect', () => {
      logger.info('Client disconnected', { socketId: socket.id });
    });
  });

  // Set Socket.IO instance for the emitter module
  setSocketIo(io);
}

/**
 * Initialize the server
 */
async function initialize() {
  try {
    logger.info('Starting AIDeveloper server...', {
      nodeEnv: config.nodeEnv,
      port: config.port,
    });

    // Initialize database
    logger.info('Connecting to database...');
    initializeDatabase();
    const dbHealthy = await checkDatabaseHealth();

    if (!dbHealthy) {
      throw new Error('Database connection failed');
    }

    logger.info('Database connected successfully');

    // Load environment variables from database into process.env
    await loadDatabaseEnvVars();

    // Setup middleware and routes
    setupMiddleware();
    setupRoutes();
    setupWebSocket();

    // Start server
    httpServer.listen(config.port, async () => {
      logger.info(`=� AIDeveloper server running on port ${config.port}`, {
        port: config.port,
        nodeEnv: config.nodeEnv,
        database: config.database.name,
      });

      console.log(`\n${'='.repeat(60)}`);
      console.log(`=� AIDeveloper Server Started`);
      console.log(`${'='.repeat(60)}`);
      console.log(`Environment:  ${config.nodeEnv}`);
      console.log(`Port:         ${config.port}`);
      console.log(`Database:     ${config.database.name}@${config.database.host}`);
      console.log(`Workspace:    ${config.workspace.root}`);
      console.log(`API:          http://localhost:${config.port}/api`);
      console.log(`Health:       http://localhost:${config.port}/health`);
      console.log(`${'='.repeat(60)}\n`);

      // Start periodic cleanup of stuck agents
      startPeriodicCleanup();

      // Resume any workflows that were interrupted by server restart/power outage
      await resumeInterruptedWorkflowsOnStartup();

      // Auto-start modules with auto_load enabled
      await autoStartModules();

      // Check for modules missing manifests and trigger ModuleImportAgent
      await checkModuleManifests();

      // Start module auto-update check (every 2 minutes for modules with autoUpdate=true)
      startAutoUpdateCheck();
    });

  } catch (error) {
    logger.error('Failed to start server', error as Error);
    console.error('Fatal error during server initialization:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown() {
  logger.info('Shutting down server...');

  try {
    // Stop periodic cleanup
    stopPeriodicCleanup();

    // Stop module auto-update check
    stopAutoUpdateCheck();

    // Close HTTP server (wait for it to fully close)
    await new Promise<void>((resolve) => {
      httpServer.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
      // Force close connections after 2 seconds
      setTimeout(() => {
        resolve();
      }, 2000);
    });

    // Close Socket.IO
    await new Promise<void>((resolve) => {
      io.close(() => {
        logger.info('Socket.IO closed');
        resolve();
      });
    });

    // Close database pool
    const { getDatabase } = await import('./database.js');
    const pool = getDatabase();
    await pool.end();
    logger.info('Database pool closed');

    logger.info('Server shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error as Error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', new Error(String(reason)), {
    promise,
  });
});

// Start the server
initialize();
