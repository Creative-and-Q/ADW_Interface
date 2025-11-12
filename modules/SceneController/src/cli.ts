#!/usr/bin/env node

import * as readline from 'readline';
import * as dotenv from 'dotenv';
import { MySQLSceneStorage } from './mysql-storage.js';
import { SceneAIParser } from './ai-parser.js';
import { SceneManager } from './scene-manager.js';
import { OpenRouterClient } from './openrouter-client.js';
import { CoordinateUtils } from './coordinate-utils.js';

dotenv.config();

// Initialize components
const storage = new MySQLSceneStorage();
const aiClient = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
});
const aiParser = new SceneAIParser(aiClient);
const manager = new SceneManager(storage, aiParser);

// CLI state
let currentUserId: string | null = null;
let currentEntityId: string | null = null;

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '🌍 > ',
});

console.log('🌍 SceneController CLI');
console.log('='.repeat(50));
console.log('Commands:');
console.log('  /user <user_id>        - Set current user ID');
console.log('  /entity <entity_id>    - Set current entity ID');
console.log('  /position              - Show current position');
console.log('  /nearby [radius]       - Show nearby locations (default: 50)');
console.log('  /location <name>       - Get location by name');
console.log('  /create-location       - Create a new location');
console.log('  /create-poi            - Create a new POI');
console.log('  /move <x> <y>          - Move to coordinates');
console.log('  /stats                 - Show system statistics');
console.log('  /help                  - Show this help message');
console.log('  /exit                  - Exit CLI');
console.log('');
console.log('Or enter natural language scene commands like:');
console.log('  "I move north to the tavern"');
console.log('  "I walk 50 units east"');
console.log('  "I look around"');
console.log('='.repeat(50));
console.log('');

rl.prompt();

rl.on('line', async (line: string) => {
  const input = line.trim();

  if (!input) {
    rl.prompt();
    return;
  }

  try {
    // Handle commands
    if (input.startsWith('/')) {
      await handleCommand(input);
    } else {
      // Handle natural language scene input
      await handleSceneInput(input);
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }

  rl.prompt();
});

rl.on('close', async () => {
  console.log('\n👋 Goodbye!');
  await storage.close();
  process.exit(0);
});

async function handleCommand(input: string) {
  const parts = input.split(/\s+/);
  const command = parts[0];
  const args = parts.slice(1);

  switch (command) {
    case '/user':
      if (args.length === 0) {
        console.log('❌ Usage: /user <user_id>');
        return;
      }
      currentUserId = args[0];
      console.log(`✅ User ID set to: ${currentUserId}`);
      break;

    case '/entity':
      if (args.length === 0) {
        console.log('❌ Usage: /entity <entity_id>');
        return;
      }
      currentEntityId = args[0];
      console.log(`✅ Entity ID set to: ${currentEntityId}`);
      break;

    case '/position':
      if (!currentEntityId) {
        console.log('❌ No entity ID set. Use /entity <id> first.');
        return;
      }
      await showPosition();
      break;

    case '/nearby':
      if (!currentEntityId) {
        console.log('❌ No entity ID set. Use /entity <id> first.');
        return;
      }
      const radius = args.length > 0 ? parseFloat(args[0]) : 50;
      await showNearby(radius);
      break;

    case '/location':
      if (args.length === 0) {
        console.log('❌ Usage: /location <name>');
        return;
      }
      const locationName = args.join(' ');
      await showLocation(locationName);
      break;

    case '/create-location':
      await createLocation();
      break;

    case '/create-poi':
      await createPOI();
      break;

    case '/move':
      if (!currentEntityId) {
        console.log('❌ No entity ID set. Use /entity <id> first.');
        return;
      }
      if (args.length < 2) {
        console.log('❌ Usage: /move <x> <y>');
        return;
      }
      const x = parseFloat(args[0]);
      const y = parseFloat(args[1]);
      if (isNaN(x) || isNaN(y)) {
        console.log('❌ Invalid coordinates');
        return;
      }
      await moveEntity(x, y);
      break;

    case '/stats':
      await showStats();
      break;

    case '/help':
      showHelp();
      break;

    case '/exit':
      rl.close();
      break;

    default:
      console.log(`❌ Unknown command: ${command}`);
      console.log('Type /help for available commands');
  }
}

async function handleSceneInput(input: string) {
  if (!currentUserId || !currentEntityId) {
    console.log('❌ Please set user ID (/user) and entity ID (/entity) first.');
    return;
  }

  console.log('\n⏳ Processing scene input...\n');

  const response = await manager.processInput({
    user_id: currentUserId,
    entity_id: currentEntityId,
    input,
  });

  if (response.success) {
    console.log(`✅ ${response.message}`);

    if (response.entity_position) {
      const pos = response.entity_position;
      console.log(`\n📍 Position: ${CoordinateUtils.formatCoordinate({ x: pos.x_coord, y: pos.y_coord })}`);
      if (pos.location_id) {
        console.log(`   Location ID: ${pos.location_id}`);
      }
    }

    if (response.scene_context) {
      const ctx = response.scene_context;

      if (ctx.current_location) {
        console.log(`\n🏛️  Current Location: ${ctx.current_location.name}`);
        if (ctx.current_location.description) {
          console.log(`   ${ctx.current_location.description}`);
        }
      }

      if (ctx.nearby_locations.length > 0) {
        console.log('\n🗺️  Nearby Locations:');
        ctx.nearby_locations.slice(0, 5).forEach((loc) => {
          console.log(`   - ${loc.item.name} (${loc.distance.toFixed(1)} units away)`);
        });
      }

      if (ctx.nearby_pois.length > 0) {
        console.log('\n📌 Nearby POIs:');
        ctx.nearby_pois.slice(0, 5).forEach((poi) => {
          console.log(`   - ${poi.item.name} [${poi.item.poi_type}] (${poi.distance.toFixed(1)} units)`);
        });
      }

      if (ctx.nearby_entities.length > 0) {
        console.log('\n👥 Nearby Entities:');
        ctx.nearby_entities.slice(0, 5).forEach((entity) => {
          console.log(`   - ${entity.item.entity_name} [${entity.item.entity_type}] (${entity.distance.toFixed(1)} units)`);
        });
      }

      if (ctx.connections.length > 0) {
        console.log('\n🚪 Connections:');
        ctx.connections.forEach((conn) => {
          console.log(`   - ${conn.connection_type}: Location ${conn.to_location_id}`);
        });
      }
    }
  } else {
    console.log(`❌ Failed: ${response.message}`);
    if (response.error) {
      console.log(`   Error: ${response.error}`);
    }
  }

  console.log('');
}

async function showPosition() {
  const position = await manager.getEntityPosition(currentEntityId!, 'player_character');

  if (!position) {
    console.log('❌ Entity not found. Position not initialized yet.');
    return;
  }

  console.log('\n📍 Current Position:');
  console.log(`   Entity: ${position.entity_name} (${position.entity_type})`);
  console.log(`   Coordinates: ${CoordinateUtils.formatCoordinate({ x: position.x_coord, y: position.y_coord })}`);
  if (position.location_id) {
    const location = await storage.getLocation(position.location_id);
    if (location) {
      console.log(`   Location: ${location.name}`);
    }
  }
  if (position.facing_direction !== null) {
    console.log(`   Facing: ${position.facing_direction}°`);
  }
  console.log(`   Active: ${position.is_active ? 'Yes' : 'No'}`);
  console.log('');
}

async function showNearby(radius: number) {
  const position = await manager.getEntityPosition(currentEntityId!, 'player_character');

  if (!position) {
    console.log('❌ Entity not found.');
    return;
  }

  const locations = await storage.getNearbyLocations(position.x_coord, position.y_coord, radius);
  const pois = await storage.getNearbyPOIs(position.x_coord, position.y_coord, radius);
  const entities = await storage.getNearbyEntities(position.x_coord, position.y_coord, radius);

  console.log(`\n🔍 Searching within ${radius} units of ${CoordinateUtils.formatCoordinate({ x: position.x_coord, y: position.y_coord })}\n`);

  if (locations.length > 0) {
    console.log('🗺️  Locations:');
    locations.forEach((loc) => {
      console.log(`   - ${loc.item.name} [${loc.item.location_type}] (${loc.distance.toFixed(1)} units)`);
    });
    console.log('');
  }

  if (pois.length > 0) {
    console.log('📌 POIs:');
    pois.forEach((poi) => {
      console.log(`   - ${poi.item.name} [${poi.item.poi_type}] (${poi.distance.toFixed(1)} units)`);
    });
    console.log('');
  }

  if (entities.length > 0) {
    console.log('👥 Entities:');
    entities.forEach((entity) => {
      if (entity.item.entity_id !== currentEntityId) {
        console.log(`   - ${entity.item.entity_name} [${entity.item.entity_type}] (${entity.distance.toFixed(1)} units)`);
      }
    });
    console.log('');
  }

  if (locations.length === 0 && pois.length === 0 && entities.length === 0) {
    console.log('   Nothing found nearby.\n');
  }
}

async function showLocation(name: string) {
  const location = await storage.getLocationByName(name);

  if (!location) {
    console.log(`❌ Location "${name}" not found.`);
    return;
  }

  console.log('\n🏛️  Location Details:');
  console.log(`   Name: ${location.name}`);
  console.log(`   Type: ${location.location_type}`);
  console.log(`   Coordinates: ${CoordinateUtils.formatCoordinate({ x: location.x_coord, y: location.y_coord })}`);
  if (location.description) {
    console.log(`   Description: ${location.description}`);
  }
  if (location.parent_location_id) {
    console.log(`   Parent Location ID: ${location.parent_location_id}`);
  }

  // Get POIs in this location
  if (location.id) {
    const pois = await storage.getPOIsByLocation(location.id);
    if (pois.length > 0) {
      console.log('\n   📌 POIs:');
      pois.forEach((poi) => {
        console.log(`      - ${poi.name} [${poi.poi_type}]`);
      });
    }

    // Get connections
    const connections = await storage.getConnectionsFromLocation(location.id);
    if (connections.length > 0) {
      console.log('\n   🚪 Connections:');
      connections.forEach((conn) => {
        console.log(`      - ${conn.connection_type} to location ${conn.to_location_id}`);
      });
    }
  }

  console.log('');
}

async function createLocation() {
  console.log('\n📝 Create New Location');

  const name = await question('   Name: ');
  if (!name) {
    console.log('❌ Name is required');
    return;
  }

  const description = await question('   Description (optional): ');

  const locationType = await question('   Type (city/town/village/dungeon/wilderness/building/room/region/other): ');
  if (!locationType) {
    console.log('❌ Type is required');
    return;
  }

  const xStr = await question('   X coordinate: ');
  const yStr = await question('   Y coordinate: ');
  const x = parseFloat(xStr);
  const y = parseFloat(yStr);

  if (isNaN(x) || isNaN(y)) {
    console.log('❌ Invalid coordinates');
    return;
  }

  const parentIdStr = await question('   Parent location ID (optional): ');
  const parentLocationId = parentIdStr ? parseInt(parentIdStr) : undefined;

  const locationId = await storage.createLocation({
    name,
    description: description || undefined,
    location_type: locationType as any,
    x_coord: x,
    y_coord: y,
    parent_location_id: parentLocationId,
  });

  console.log(`\n✅ Location created with ID: ${locationId}\n`);
}

async function createPOI() {
  console.log('\n📝 Create New POI');

  const name = await question('   Name: ');
  if (!name) {
    console.log('❌ Name is required');
    return;
  }

  const description = await question('   Description (optional): ');

  const poiType = await question('   Type (shop/inn/temple/landmark/npc/quest/danger/resource/other): ');
  if (!poiType) {
    console.log('❌ Type is required');
    return;
  }

  const locationIdStr = await question('   Location ID: ');
  const locationId = parseInt(locationIdStr);
  if (isNaN(locationId)) {
    console.log('❌ Invalid location ID');
    return;
  }

  const xStr = await question('   X coordinate: ');
  const yStr = await question('   Y coordinate: ');
  const x = parseFloat(xStr);
  const y = parseFloat(yStr);

  if (isNaN(x) || isNaN(y)) {
    console.log('❌ Invalid coordinates');
    return;
  }

  const poiId = await storage.createPOI({
    name,
    description: description || undefined,
    poi_type: poiType as any,
    location_id: locationId,
    x_coord: x,
    y_coord: y,
  });

  console.log(`\n✅ POI created with ID: ${poiId}\n`);
}

async function moveEntity(x: number, y: number) {
  const position = await manager.moveEntity(currentEntityId!, 'player_character', x, y, 'walk');

  if (!position) {
    console.log('❌ Failed to move entity');
    return;
  }

  console.log(`\n✅ Moved to ${CoordinateUtils.formatCoordinate({ x: position.x_coord, y: position.y_coord })}`);
  if (position.location_id) {
    const location = await storage.getLocation(position.location_id);
    if (location) {
      console.log(`   Now at: ${location.name}`);
    }
  }
  console.log('');
}

async function showStats() {
  const stats = await manager.getStats();

  console.log('\n📊 System Statistics:');
  console.log(`   Total Locations: ${stats.totalLocations}`);
  console.log(`   Total POIs: ${stats.totalPOIs}`);
  console.log(`   Active Entities: ${stats.activeEntities}`);
  console.log(`   Total Movements: ${stats.totalMovements}`);
  console.log('');
}

function showHelp() {
  console.log('\n🌍 SceneController CLI Help');
  console.log('='.repeat(50));
  console.log('Commands:');
  console.log('  /user <user_id>        - Set current user ID');
  console.log('  /entity <entity_id>    - Set current entity ID');
  console.log('  /position              - Show current position');
  console.log('  /nearby [radius]       - Show nearby locations (default: 50)');
  console.log('  /location <name>       - Get location by name');
  console.log('  /create-location       - Create a new location');
  console.log('  /create-poi            - Create a new POI');
  console.log('  /move <x> <y>          - Move to coordinates');
  console.log('  /stats                 - Show system statistics');
  console.log('  /help                  - Show this help message');
  console.log('  /exit                  - Exit CLI');
  console.log('');
  console.log('Natural Language Commands:');
  console.log('  "I move north to the tavern"');
  console.log('  "I walk 50 units east"');
  console.log('  "I look around"');
  console.log('  "I teleport to coordinates 100, 200"');
  console.log('='.repeat(50));
  console.log('');
}

// Helper function for prompting
function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}
