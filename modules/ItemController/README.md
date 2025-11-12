# ItemController

A comprehensive item and inventory management system for RPG games with template-based items, world position tracking, and complete audit trails.

## Features

- **Template-Based Items**: Define base item templates with stats, properties, and metadata
- **Item Instances**: Track individual items with unique identifiers
- **Ownership System**: Items can belong to characters, POIs, or exist in the world
- **Position Tracking**: Full coordinate-based positioning with SceneController integration
- **Movement History**: Complete audit trail of all item transfers and movements
- **Crafting System**: Recipe-based crafting with ingredient requirements
- **Container Support**: Items can contain other items
- **Item Sets**: Define equipment sets with bonuses
- **Proximity Searches**: Find items near coordinates using SQL distance calculations
- **Inventory Management**: Weight, value, and equipped item tracking

## Quick Start

### 1. Setup Database

```bash
npm run db:setup
```

### 2. Start Server

```bash
npm start
```

Server runs on port **3034** by default.

### 3. Use the CLI

```bash
npm run cli
```

## API Endpoints

### Templates

- `POST /template` - Create item template
- `GET /template/:id` - Get template by ID
- `GET /templates` - Search templates (query params: query, item_type, rarity, limit, offset)

### Items

- `POST /item` - Create item instance
- `GET /item/:id` - Get item by ID
- `POST /item/:id/pickup` - Character picks up item
- `POST /item/:id/drop` - Character drops item
- `POST /item/:id/trade` - Trade item between characters
- `POST /item/:id/move` - Move item to new location/owner
- `POST /item/:id/equip` - Equip item
- `POST /item/:id/unequip` - Unequip item
- `DELETE /item/:id` - Destroy item
- `GET /item/:id/history` - Get item movement history

### Inventory

- `GET /inventory/:characterId` - Get character's inventory

### Location

- `GET /items/at-poi/:poiId` - Get items at POI
- `GET /items/nearby?x=&y=&radius=` - Get items near coordinates

### System

- `GET /stats` - Get system statistics
- `GET /health` - Health check

## Using the Client Library

Other modules can use the ItemController client to interact with items:

```typescript
import { ItemControllerClient } from './client.js';

const itemClient = new ItemControllerClient('http://localhost:3034');

// Create an item template
const swordTemplate = await itemClient.createTemplate({
  name: 'Iron Sword',
  description: 'A basic iron sword',
  item_type: 'weapon',
  rarity: 'common',
  weight: 5,
  base_value: 100,
  damage_dice: '1d8',
  is_magical: false,
});

// Give item to character
const sword = await itemClient.giveItemToCharacter(
  swordTemplate.id!,
  'character_123',
  1
);

// Get character inventory
const inventory = await itemClient.getInventory('character_123');
console.log(`Total weight: ${inventory.totalWeight}`);
console.log(`Total value: ${inventory.totalValue} gold`);

// Equip the sword
await itemClient.equipItem(sword.id!, 'character_123');

// Drop item in world
await itemClient.dropItem(sword.id!, {
  character_id: 'character_123',
  x: 100,
  y: 200,
  poi_id: 5,
});

// Find items nearby
const nearbyItems = await itemClient.getItemsNearby(100, 200, 50);
```

## Item Types

- `weapon` - Weapons (swords, bows, etc.)
- `armor` - Armor pieces
- `consumable` - Potions, food, etc.
- `tool` - Tools and equipment
- `treasure` - Valuable items
- `quest_item` - Quest-specific items
- `material` - Crafting materials
- `container` - Bags, chests, etc.
- `book` - Books and scrolls
- `key` - Keys for doors/chests
- `currency` - Coins and currency
- `misc` - Miscellaneous items

## Rarity Levels

- `common` - Basic items
- `uncommon` - Slightly rare
- `rare` - Rare items
- `epic` - Very rare
- `legendary` - Extremely rare
- `artifact` - Unique artifacts

## Owner Types

- `character` - Owned by a character
- `poi` - Located at a Point of Interest
- `world` - Dropped in the world at coordinates

## Database Schema

### item_templates
Base definitions for item types with stats and properties.

### items
Individual item instances with unique UUIDs and current state.

### item_movement_history
Complete audit trail of all item movements and transfers.

### crafting_recipes
Recipes for crafting items from materials.

### recipe_ingredients
Required ingredients for each recipe.

### container_contents
Items stored inside container items.

### item_sets
Equipment sets with bonuses.

### item_set_pieces
Individual pieces that belong to item sets.

## Environment Variables

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=item_controller
PORT=3034
SCENE_CONTROLLER_URL=http://localhost:3033
LOG_LEVEL=info
```

## Integration with SceneController

ItemController integrates with SceneController for position tracking:

- Items can be dropped at specific POIs
- Items track their world coordinates (x, y)
- Proximity searches find items near locations
- Movement history tracks position changes

## Architecture

```
ItemController (Port 3034)
├── Templates (Base definitions)
│   └── Items (Instances with UUIDs)
│       ├── Ownership (character/poi/world)
│       ├── Position (x, y, poi_id)
│       └── Movement History (Audit trail)
├── Crafting (Recipes & ingredients)
├── Containers (Items in items)
└── Item Sets (Equipment bonuses)
```

## TypeScript Types

All entities are fully typed with Zod validation:

```typescript
import {
  ItemTemplate,
  Item,
  ItemWithTemplate,
  ItemMovementHistory,
  CreateItemRequest,
  PickupItemRequest,
  DropItemRequest,
  TradeItemRequest,
} from './types.js';
```

## Testing

```bash
# Type checking
npm run typecheck

# Run tests (when available)
npm test

# CLI for manual testing
npm run cli
```

## Development

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Build
npm run build

# Format code
npm run format

# Lint
npm run lint
```

## API Response Format

All endpoints return JSON in this format:

```json
{
  "success": true,
  "item": { ... },      // For single item responses
  "items": [ ... ],     // For multiple item responses
  "message": "...",     // Optional message
  "error": "..."        // Only present on errors
}
```

## Error Handling

- `400` - Bad request (validation errors)
- `404` - Item/template not found
- `500` - Server error

All errors include descriptive messages in the response.
