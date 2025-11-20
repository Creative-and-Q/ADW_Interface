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
import { cleanupStuckAgents, getRunningAgentCount } from './workflow-state.js';

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
  // Note: Compiled code is in dist/AIDeveloper/src/, so we need to go up 3 levels to project root
  const frontendDistPath = path.join(__dirname, '..', '..', '..', 'frontend', 'dist');
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
 * Start periodic cleanup of stuck agent executions
 * Runs every 15 minutes to clean up agents that have been running for over 60 minutes
 */
function startPeriodicCleanup() {
  const cleanupIntervalMs = 15 * 60 * 1000; // 15 minutes
  const agentTimeoutMinutes = 60; // Mark agents as stuck after 60 minutes

  logger.info('Starting periodic agent cleanup job', {
    intervalMinutes: 15,
    agentTimeoutMinutes,
  });

  // Run initial cleanup
  cleanupStuckAgents(agentTimeoutMinutes).catch(error => {
    logger.error('Initial agent cleanup failed', error as Error);
  });

  // Schedule periodic cleanup
  cleanupInterval = setInterval(async () => {
    try {
      const runningCount = await getRunningAgentCount();

      if (runningCount > 0) {
        logger.debug('Running periodic agent cleanup check', {
          runningAgents: runningCount,
        });

        const cleanedUp = await cleanupStuckAgents(agentTimeoutMinutes);

        if (cleanedUp > 0) {
          logger.warn(`Periodic cleanup: marked ${cleanedUp} stuck agent(s) as failed`);
        }
      }
    } catch (error) {
      logger.error('Periodic agent cleanup failed', error as Error);
    }
  }, cleanupIntervalMs);

  logger.info('Periodic agent cleanup job started');
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

      // Auto-start modules with auto_load enabled
      await autoStartModules();
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
