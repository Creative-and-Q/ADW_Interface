import express from 'express';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { MySQLSceneStorage } from './mysql-storage.js';
import { SceneAIParser } from './ai-parser.js';
import { SceneManager } from './scene-manager.js';
import { OpenRouterClient } from './openrouter-client.js';
import { SceneInputSchema, CoordinateSchema } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env'), override: true });

const app = express();
app.use(express.json());

// Initialize storage and AI components
let storage: MySQLSceneStorage;
let aiClient: OpenRouterClient;
let aiParser: SceneAIParser;
let manager: SceneManager;

async function initializeServer() {
  try {
    console.log('Initializing SceneController...');

    console.log('1. Creating MySQL storage...');
    storage = new MySQLSceneStorage();

    console.log('2. Testing database connection...');
    await storage.getStats();
    console.log('   ✓ Database connection successful');

    console.log('3. Creating OpenRouter client...');
    aiClient = new OpenRouterClient({
      apiKey: process.env.OPENROUTER_API_KEY!,
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
    });

    console.log('4. Creating AI parser...');
    aiParser = new SceneAIParser(aiClient);

    console.log('5. Creating scene manager...');
    manager = new SceneManager(storage, aiParser);

    console.log('✓ Initialization complete!\n');
  } catch (error) {
    console.error('❌ Failed to initialize SceneController:');
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
    console.error('\n💡 Make sure:');
    console.error('  1. MySQL is running');
    console.error('  2. Database "scene_controller" exists (run: npm run db:setup)');
    console.error('  3. Database credentials in .env are correct');
    console.error('  4. OPENROUTER_API_KEY is set in .env');
    process.exit(1);
  }
}

// Initialize before defining routes
await initializeServer();

/**
 * Process scene input with AI parsing
 * POST /process
 * Body: { user_id, entity_id, input, meta_data? }
 */
app.post('/process', async (req, res) => {
  try {
    const input = SceneInputSchema.parse(req.body);
    const response = await manager.processInput(input);
    res.json(response);
  } catch (error) {
    console.error('Error processing scene input:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process scene input',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get entity position by ID
 * GET /position/:entityId
 * Query: ?type=player_character (default)
 */
app.get('/position/:entityId', async (req, res) => {
  try {
    const { entityId } = req.params;
    const entityType = (req.query.type as string) || 'player_character';
    const position = await manager.getEntityPosition(entityId, entityType);

    if (!position) {
      return res.status(404).json({
        success: false,
        message: `Entity ${entityId} not found`,
      });
    }

    res.json({ success: true, position });
  } catch (error) {
    console.error('Error getting entity position:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get nearby locations or POIs
 * GET /nearby
 * Query: ?x=0&y=0&radius=50&type=location
 */
app.get('/nearby', async (req, res) => {
  try {
    const x = parseFloat(req.query.x as string);
    const y = parseFloat(req.query.y as string);
    const radius = parseFloat((req.query.radius as string) || '50');
    const type = (req.query.type as string) || 'location';

    if (isNaN(x) || isNaN(y)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates: x and y must be numbers',
      });
    }

    let results;
    if (type === 'poi') {
      results = await storage.getNearbyPOIs(x, y, radius);
    } else if (type === 'entity') {
      results = await storage.getNearbyEntities(x, y, radius);
    } else {
      results = await storage.getNearbyLocations(x, y, radius);
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Error getting nearby items:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get location by ID
 * GET /location/:locationId
 */
app.get('/location/:locationId', async (req, res) => {
  try {
    const locationId = parseInt(req.params.locationId);
    if (isNaN(locationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid location ID',
      });
    }

    const location = await storage.getLocation(locationId);
    if (!location) {
      return res.status(404).json({
        success: false,
        message: `Location ${locationId} not found`,
      });
    }

    // Get connections from this location
    const connections = await storage.getConnectionsFromLocation(locationId);

    res.json({ success: true, location, connections });
  } catch (error) {
    console.error('Error getting location:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get location by name
 * GET /location/name/:name
 */
app.get('/location/name/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const location = await storage.getLocationByName(name);

    if (!location) {
      return res.status(404).json({
        success: false,
        message: `Location "${name}" not found`,
      });
    }

    // Get connections from this location
    const connections = location.id
      ? await storage.getConnectionsFromLocation(location.id)
      : [];

    res.json({ success: true, location, connections });
  } catch (error) {
    console.error('Error getting location by name:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Move entity to specific coordinates
 * POST /move
 * Body: { entity_id, entity_type, x, y, movement_type? }
 */
app.post('/move', async (req, res) => {
  try {
    const { entity_id, entity_type, x, y, movement_type } = req.body;

    if (!entity_id || !entity_type) {
      return res.status(400).json({
        success: false,
        message: 'entity_id and entity_type are required',
      });
    }

    if (typeof x !== 'number' || typeof y !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'x and y must be numbers',
      });
    }

    const position = await manager.moveEntity(
      entity_id,
      entity_type,
      x,
      y,
      movement_type || 'walk'
    );

    if (!position) {
      return res.status(404).json({
        success: false,
        message: `Entity ${entity_id} not found`,
      });
    }

    res.json({ success: true, position });
  } catch (error) {
    console.error('Error moving entity:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Create a new location
 * POST /location
 * Body: { name, description?, location_type, x_coord, y_coord, parent_location_id? }
 */
app.post('/location', async (req, res) => {
  try {
    const { name, description, location_type, x_coord, y_coord, parent_location_id } = req.body;

    if (!name || !location_type || typeof x_coord !== 'number' || typeof y_coord !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'name, location_type, x_coord, and y_coord are required',
      });
    }

    const locationId = await storage.createLocation({
      name,
      description,
      location_type,
      x_coord,
      y_coord,
      parent_location_id,
    });

    const location = await storage.getLocation(locationId);

    res.json({ success: true, location });
  } catch (error) {
    console.error('Error creating location:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Create a new POI
 * POST /poi
 * Body: { name, description?, poi_type, location_id, x_coord, y_coord, metadata? }
 */
app.post('/poi', async (req, res) => {
  try {
    const { name, description, poi_type, location_id, x_coord, y_coord, metadata } = req.body;

    if (
      !name ||
      !poi_type ||
      !location_id ||
      typeof x_coord !== 'number' ||
      typeof y_coord !== 'number'
    ) {
      return res.status(400).json({
        success: false,
        message: 'name, poi_type, location_id, x_coord, and y_coord are required',
      });
    }

    const poiId = await storage.createPOI({
      name,
      description,
      poi_type,
      location_id,
      x_coord,
      y_coord,
      metadata,
    });

    const poi = await storage.getPOI(poiId);

    res.json({ success: true, poi });
  } catch (error) {
    console.error('Error creating POI:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get POIs by location
 * GET /location/:locationId/pois
 */
app.get('/location/:locationId/pois', async (req, res) => {
  try {
    const locationId = parseInt(req.params.locationId);
    if (isNaN(locationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid location ID',
      });
    }

    const pois = await storage.getPOIsByLocation(locationId);
    res.json({ success: true, pois });
  } catch (error) {
    console.error('Error getting POIs:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get entities in location
 * GET /location/:locationId/entities
 * Query: ?activeOnly=true (default)
 */
app.get('/location/:locationId/entities', async (req, res) => {
  try {
    const locationId = parseInt(req.params.locationId);
    if (isNaN(locationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid location ID',
      });
    }

    const activeOnly = req.query.activeOnly !== 'false';
    const entities = await storage.getEntitiesInLocation(locationId, activeOnly);
    res.json({ success: true, entities });
  } catch (error) {
    console.error('Error getting entities:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get movement history for entity
 * GET /movement-history/:entityPositionId
 * Query: ?limit=100 (default)
 */
app.get('/movement-history/:entityPositionId', async (req, res) => {
  try {
    const entityPositionId = parseInt(req.params.entityPositionId);
    if (isNaN(entityPositionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid entity position ID',
      });
    }

    const limit = parseInt((req.query.limit as string) || '100');
    const history = await storage.getMovementHistory(entityPositionId, limit);
    res.json({ success: true, history });
  } catch (error) {
    console.error('Error getting movement history:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get system statistics
 * GET /stats
 */
app.get('/stats', async (req, res) => {
  try {
    const stats = await manager.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Health check
 * GET /health
 */
app.get('/health', (req, res) => {
  // Log environment variable status for debugging
  const envStatus = {
    PORT: process.env.PORT || '(default: 3033)',
    DB_HOST: process.env.DB_HOST ? '✓ set' : '✗ missing',
    DB_USER: process.env.DB_USER ? '✓ set' : '✗ missing',
    DB_NAME: process.env.DB_NAME ? '✓ set' : '✗ missing',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ? '✓ set' : '✗ missing',
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || '(default)',
  };
  console.log('[SceneController] Health check - Environment variables:', envStatus);

  res.json({ success: true, status: 'healthy', service: 'SceneController', env: envStatus });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message,
  });
});

// Start server
const PORT = process.env.PORT || 3033;
app.listen(PORT, () => {
  console.log(`🌍 SceneController running on port ${PORT}`);
  console.log(`   POST   /process - Process scene input with AI`);
  console.log(`   GET    /position/:entityId - Get entity position`);
  console.log(`   GET    /nearby - Get nearby locations/POIs`);
  console.log(`   GET    /location/:locationId - Get location details`);
  console.log(`   POST   /move - Move entity to coordinates`);
  console.log(`   POST   /location - Create location`);
  console.log(`   POST   /poi - Create POI`);
  console.log(`   GET    /stats - Get system statistics`);
  console.log(`   GET    /health - Health check`);
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
