/**
 * StoryTeller HTTP Server
 *
 * Express server exposing REST API for narrative generation.
 */

import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { MySQLStorage } from './mysql-storage.js';
import { StoryTellerManager } from './storyteller-manager.js';
import {
  GenerateNarrativeRequestSchema,
  StoryTemplateSchema,
  ResponseTypeEnum,
} from './types.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3036');

// Middleware
app.use(express.json({ limit: '10mb' }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
});

// Request logging middleware
app.use((req, _res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Initialize storage and manager
const storage = new MySQLStorage();
const manager = new StoryTellerManager(storage);

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /health - Health check
 */
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await manager.healthCheck();

    res.status(health.healthy ? 200 : 503).json({
      success: health.healthy,
      data: {
        status: health.healthy ? 'healthy' : 'unhealthy',
        service: 'storyteller',
        components: health.components,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Health check failed',
    });
  }
});

/**
 * POST /generate - Generate narrative response
 */
app.post('/generate', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request
    const validation = GenerateNarrativeRequestSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: validation.error.errors,
      });
      return;
    }

    const request = validation.data;

    // Generate narrative
    const result = await manager.generateNarrative(request);

    const statusCode = result.success ? 200 : 500;
    res.status(statusCode).json(result);
  } catch (error) {
    console.error('Error in /generate:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /interactions/:user_id - Get interaction history for a user
 */
app.get('/interactions/:user_id', async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const character_id = req.query.character_id
      ? parseInt(req.query.character_id as string)
      : undefined;

    const response_type = req.query.response_type
      ? ResponseTypeEnum.parse(req.query.response_type)
      : undefined;

    const interactions = await manager.getInteractionHistory(user_id, {
      limit,
      character_id,
      response_type,
    });

    res.json({
      success: true,
      data: {
        user_id,
        count: interactions.length,
        interactions,
      },
    });
  } catch (error) {
    console.error('Error in /interactions/:user_id:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /interactions/detail/:id - Get specific interaction
 */
app.get('/interactions/detail/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);

    const interaction = await manager.getInteraction(id);

    if (!interaction) {
      res.status(404).json({
        success: false,
        error: 'Interaction not found',
      });
      return;
    }

    res.json({
      success: true,
      data: interaction,
    });
  } catch (error) {
    console.error('Error in /interactions/detail/:id:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /templates - Get all templates
 */
app.get('/templates', async (_req: Request, res: Response) => {
  try {
    const templates = await manager.getAllTemplates();

    res.json({
      success: true,
      data: {
        count: templates.length,
        templates,
      },
    });
  } catch (error) {
    console.error('Error in /templates:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /templates/:name - Get template by name
 */
app.get('/templates/:name', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.params;

    const template = await manager.getTemplateByName(name);

    if (!template) {
      res.status(404).json({
        success: false,
        error: 'Template not found',
      });
      return;
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Error in /templates/:name:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /templates - Create or update template
 */
app.post('/templates', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request
    const validation = StoryTemplateSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid template data',
        details: validation.error.errors,
      });
      return;
    }

    const template = validation.data;
    const id = await manager.saveTemplate(template);

    res.json({
      success: true,
      data: {
        id,
        message: template.id ? 'Template updated' : 'Template created',
      },
    });
  } catch (error) {
    console.error('Error in POST /templates:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * DELETE /templates/:id - Delete template
 */
app.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    await manager.deleteTemplate(id);

    res.json({
      success: true,
      data: {
        message: 'Template deleted successfully',
      },
    });
  } catch (error) {
    console.error('Error in DELETE /templates/:id:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /cache/clear - Clear cache
 */
app.post('/cache/clear', async (req: Request, res: Response) => {
  try {
    const clearAll = req.query.all === 'true';

    const count = clearAll
      ? await manager.clearAllCache()
      : await manager.clearExpiredCache();

    res.json({
      success: true,
      data: {
        cleared: count,
        message: `${count} cache entries cleared`,
      },
    });
  } catch (error) {
    console.error('Error in /cache/clear:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// =============================================================================
// Error Handling
// =============================================================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: `${req.method} ${req.path} is not a valid endpoint`,
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
  });
});

// =============================================================================
// Server Lifecycle
// =============================================================================

let server: any;

// Graceful shutdown handler
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
    });
  }

  try {
    await storage.close();
    console.log('Database connections closed');
  } catch (error) {
    console.error('Error closing database:', error);
  }

  process.exit(0);
};

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
server = app.listen(PORT, () => {
  console.log('\n🎭 ============================================');
  console.log('   StoryTeller Module Started');
  console.log('============================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  console.log('============================================\n');
});

export default app;
