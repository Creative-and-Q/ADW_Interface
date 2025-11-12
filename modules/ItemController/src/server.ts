import express from 'express';
import * as dotenv from 'dotenv';
import { MySQLItemStorage } from './mysql-storage.js';
import { ItemManager } from './item-manager.js';
import {
  CreateItemRequestSchema,
  UpdateItemRequestSchema,
  SearchItemsRequestSchema,
  AddToContainerRequestSchema,
  RemoveFromContainerRequestSchema,
} from './types.js';

dotenv.config();

const app = express();
app.use(express.json());

// Initialize components
let storage: MySQLItemStorage;
let manager: ItemManager;

async function initializeServer() {
  try {
    console.log('Initializing ItemController...');

    console.log('1. Creating MySQL storage...');
    storage = new MySQLItemStorage();

    console.log('2. Testing database connection...');
    await storage.getStats();
    console.log('   ✓ Database connection successful');

    console.log('3. Creating item manager...');
    manager = new ItemManager(storage);

    console.log('✓ Initialization complete!\n');
  } catch (error) {
    console.error('❌ Failed to initialize ItemController:');
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
    console.error('\n💡 Make sure:');
    console.error('  1. MySQL is running');
    console.error('  2. Database "item_controller" exists (run: npm run db:setup)');
    console.error('  3. Database credentials in .env are correct');
    process.exit(1);
  }
}

await initializeServer();

/**
 * Item Endpoints
 */

// Create item
app.post('/item', async (req, res) => {
  try {
    const request = CreateItemRequestSchema.parse(req.body);
    const item = await manager.createItem(request);
    res.json({ success: true, item });
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get item by ID
app.get('/item/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const item = await manager.getItem(id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    return res.json({ success: true, item });
  } catch (error) {
    console.error('Error getting item:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Update item
app.patch('/item/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const request = UpdateItemRequestSchema.parse(req.body);
    const item = await manager.updateItem(id, request);
    res.json({ success: true, item });
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Delete item
app.delete('/item/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await manager.deleteItem(id);
    res.json({ success: true, message: 'Item deleted' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Search items by name
app.get('/items/search', async (req, res) => {
  try {
    const request = SearchItemsRequestSchema.parse({
      name: req.query.name,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    });
    const result = await manager.searchItems(request);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error searching items:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Container Endpoints
 */

// Add item to container
app.post('/item/:itemId/add-to-container', async (req, res) => {
  try {
    const item_id = parseInt(req.params.itemId);
    const container_id = parseInt(req.body.container_id);
    const request = AddToContainerRequestSchema.parse({ item_id, container_id });
    const item = await manager.addToContainer(request);
    res.json({ success: true, item, message: `Item ${item_id} added to container ${container_id}` });
  } catch (error) {
    console.error('Error adding item to container:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Remove item from container
app.post('/item/:itemId/remove-from-container', async (req, res) => {
  try {
    const item_id = parseInt(req.params.itemId);
    const request = RemoveFromContainerRequestSchema.parse({ item_id });
    const item = await manager.removeFromContainer(request);
    res.json({ success: true, item, message: `Item ${item_id} removed from container` });
  } catch (error) {
    console.error('Error removing item from container:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get container contents
app.get('/item/:containerId/contents', async (req, res) => {
  try {
    const containerId = parseInt(req.params.containerId);
    const recursive = req.query.recursive === 'true';
    const container = await manager.getContainerContents(containerId, recursive);
    res.json({ success: true, container });
  } catch (error) {
    console.error('Error getting container contents:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get item total weight
app.get('/item/:itemId/weight', async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const totalWeight = await manager.calculateTotalWeight(itemId);
    res.json({ success: true, item_id: itemId, total_weight: totalWeight });
  } catch (error) {
    console.error('Error calculating weight:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * System Endpoints
 */

// Get statistics
app.get('/stats', async (_req, res) => {
  try {
    const stats = await storage.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Health check
app.get('/health', async (_req, res) => {
  try {
    await storage.getStats();
    res.json({ status: 'healthy', service: 'item-controller' });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      service: 'item-controller',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await storage.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await storage.close();
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3034;
app.listen(PORT, () => {
  console.log(`📦 ItemController running on port ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
  console.log('\nAPI Endpoints:');
  console.log('  POST   /item                           - Create item');
  console.log('  GET    /item/:id                       - Get item by ID');
  console.log('  PATCH  /item/:id                       - Update item');
  console.log('  DELETE /item/:id                       - Delete item');
  console.log('  GET    /items/search?name              - Search items by name');
  console.log('\nContainer Operations:');
  console.log('  POST   /item/:id/add-to-container      - Add item to container');
  console.log('  POST   /item/:id/remove-from-container - Remove item from container');
  console.log('  GET    /item/:id/contents?recursive    - Get container contents');
  console.log('  GET    /item/:id/weight                - Get total weight (with contents)');
  console.log('\nSystem:');
  console.log('  GET    /stats                          - Get statistics');
  console.log('  GET    /health                         - Health check');
});
