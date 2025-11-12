import express from 'express';
import * as dotenv from 'dotenv';
import { CharacterManager } from './character-manager.js';
import { OpenRouterClient } from './openrouter-client.js';
import { MySQLStorage } from './mysql-storage.js';
import { SceneControllerClient } from './scene-client.js';
import { CLIInput } from './types.js';

dotenv.config();

console.log('Starting CharacterController...');

const app = express();
app.use(express.json());

console.log('Express app created');

// Initialize components with error handling
let storage: MySQLStorage;
let openRouter: OpenRouterClient;
let sceneClient: SceneControllerClient;
let manager: CharacterManager;

try {
  console.log('Initializing OpenRouter client...');
  openRouter = new OpenRouterClient({
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
  });

  console.log('Initializing MySQL storage...');
  storage = new MySQLStorage();

  console.log('Initializing SceneController client...');
  const sceneControllerUrl = process.env.SCENE_CONTROLLER_URL || 'http://localhost:3033';
  sceneClient = new SceneControllerClient(sceneControllerUrl);

  console.log('Initializing CharacterManager...');
  manager = new CharacterManager(openRouter, storage, sceneClient);

  console.log('All components initialized successfully');
} catch (error) {
  console.error('Failed to initialize components:');
  console.error(error);
  process.exit(1);
}

/**
 * Process character input with AI parsing
 * POST /process
 * Body: { user_id, user_character?, input, meta_data? }
 */
app.post('/process', async (req, res) => {
  try {
    const input: CLIInput = req.body;

    if (!input.user_id) {
      return res.status(400).json({
        success: false,
        message: 'user_id is required',
      });
    }

    if (!input.input) {
      return res.status(400).json({
        success: false,
        message: 'input is required',
      });
    }

    const response = await manager.processInput(input);
    return res.json(response);
  } catch (error) {
    console.error('Error processing input:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process character input',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get character by user ID and name
 * GET /character/:userId/:name
 */
app.get('/character/:userId/:name', async (req, res) => {
  try {
    const { userId, name } = req.params;

    const character = await storage.getCharacter(userId, name);

    if (!character) {
      return res.status(404).json({
        success: false,
        message: `Character "${name}" not found for user ${userId}`,
      });
    }

    return res.json({ success: true, character });
  } catch (error) {
    console.error('Error getting character:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get all characters for a user
 * GET /characters/:userId
 */
app.get('/characters/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const characters = await storage.getUserCharacters(userId);

    return res.json({ success: true, characters });
  } catch (error) {
    console.error('Error getting characters:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Check if a character name is available
 * GET /check-name/:name
 */
app.get('/check-name/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId query parameter is required',
      });
    }

    const isAvailable = await storage.isNameAvailable(userId, name);

    return res.json({ success: true, available: isAvailable });
  } catch (error) {
    console.error('Error checking name:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get character name history
 * GET /name-history/:userId/:name
 */
app.get('/name-history/:userId/:name', async (req, res) => {
  try {
    const { userId, name } = req.params;

    const history = await storage.getNameHistory(userId, name);

    return res.json({ success: true, history });
  } catch (error) {
    console.error('Error getting name history:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Delete a character
 * DELETE /character/:userId/:name
 */
app.delete('/character/:userId/:name', async (req, res) => {
  try {
    const { userId, name } = req.params;

    const success = await storage.deleteCharacter(userId, name);

    if (!success) {
      return res.status(404).json({
        success: false,
        message: `Character "${name}" not found for user ${userId}`,
      });
    }

    return res.json({ success: true, message: `Character "${name}" deleted` });
  } catch (error) {
    console.error('Error deleting character:', error);
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
  return res.json({ success: true, status: 'healthy', service: 'CharacterController' });
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
const PORT = Number(process.env.PORT) || 3031;
const HOST = '0.0.0.0'; // Bind to all IPv4 interfaces for WSL2 compatibility
console.log(`Starting server on ${HOST}:${PORT}...`);

app.listen(PORT, HOST, () => {
  console.log(`👤 CharacterController running on ${HOST}:${PORT}`);
  console.log(`   POST   /process - Process character input with AI`);
  console.log(`   GET    /character/:userId/:name - Get character`);
  console.log(`   GET    /characters/:userId - Get all user characters`);
  console.log(`   GET    /check-name/:name - Check name availability`);
  console.log(`   GET    /name-history/:userId/:name - Get name history`);
  console.log(`   DELETE /character/:userId/:name - Delete character`);
  console.log(`   GET    /health - Health check`);
}).on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing connections...');
  await storage.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing connections...');
  await storage.close();
  process.exit(0);
});
