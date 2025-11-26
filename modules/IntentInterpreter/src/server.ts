import express from 'express';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { IntentInterpreter } from './interpreter.js';
import { OpenRouterConfig } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env'), override: true });

const app = express();
app.use(express.json());

// Initialize IntentInterpreter
const openRouterConfig: OpenRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: process.env.OPENROUTER_MODEL || 'x-ai/grok-2-1212',
  baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
};

let interpreter: IntentInterpreter;
try {
  interpreter = new IntentInterpreter(openRouterConfig, {
    minConfidenceThreshold: 0.3,
    maxIntentsReturned: 5,
    includeAllIntents: false,
    cacheEnabled: true,
  });
} catch (error) {
  console.error('Failed to initialize IntentInterpreter:');
  console.error(error);
  process.exit(1);
}

/**
 * Interpret user message intent
 * POST /interpret
 * Body: { message: string, context?: any, includeAllIntents?: boolean }
 */
app.post('/interpret', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'message is required and must be a string',
      });
    }

    const result = await interpreter.interpret(message);

    return res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Error interpreting message:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Batch interpret multiple messages
 * POST /interpret/batch
 * Body: { messages: string[], context?: any }
 */
app.post('/interpret/batch', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: 'messages must be an array of strings',
      });
    }

    const results = await Promise.all(
      messages.map((message) => interpreter.interpret(message))
    );

    return res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Error interpreting batch:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get cache statistics
 * GET /cache/stats
 */
app.get('/cache/stats', (_req, res) => {
  try {
    const stats = (interpreter as any).cacheManager?.getStats();

    if (!stats) {
      return res.status(404).json({
        success: false,
        message: 'Cache statistics not available',
      });
    }

    return res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Clear cache
 * DELETE /cache
 */
app.delete('/cache', async (_req, res) => {
  try {
    await (interpreter as any).cacheManager?.clear();

    return res.json({
      success: true,
      message: 'Cache cleared',
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Health check
 * GET /health
 */
app.get('/health', (_req, res) => {
  // Log environment variable status for debugging
  const envStatus = {
    PORT: process.env.PORT || '(default: 3032)',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ? '✓ set' : '✗ missing',
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || '(default)',
    OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL || '(default)',
  };
  console.log('[IntentInterpreter] Health check - Environment variables:', envStatus);

  return res.json({
    success: true,
    status: 'healthy',
    service: 'IntentInterpreter',
    model: openRouterConfig.model,
    env: envStatus,
  });
});

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message,
  });
});

// Start server
const PORT = Number(process.env.PORT) || 3032;
const HOST = '0.0.0.0'; // Bind to all IPv4 interfaces for WSL2 compatibility
app.listen(PORT, HOST, () => {
  console.log(`🧠 IntentInterpreter running on ${HOST}:${PORT}`);
  console.log(`   Model: ${openRouterConfig.model}`);
  console.log(`   POST   /interpret - Interpret message intent`);
  console.log(`   POST   /interpret/batch - Batch interpret messages`);
  console.log(`   GET    /cache/stats - Get cache statistics`);
  console.log(`   DELETE /cache - Clear cache`);
  console.log(`   GET    /health - Health check`);
}).on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
