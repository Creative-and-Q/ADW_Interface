# SceneController v1.0

AI-powered scene and location management system with **coordinate grid**, **position tracking**, and **POI management**.

## Features

- 🗺️ **Coordinate Grid System** - X/Y coordinate-based world map
- 📍 **Location Management** - Named places with hierarchical structure
- 🎯 **Points of Interest** - Shops, inns, landmarks, NPCs, etc.
- 👥 **Position Tracking** - Real-time character and NPC positions
- 🔍 **Proximity Search** - Find nearby locations and POIs
- 🤖 **AI-Powered** - Natural language scene understanding
- 🔗 **Location Connections** - Roads, paths, portals between locations
- 📊 **Movement History** - Track entity movements over time
- 🌐 **HTTP API** - RESTful API on port 3033
- 💾 **MySQL Storage** - Persistent database with spatial indexing

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env`:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=scene_controller

OPENROUTER_API_KEY=your_key
PORT=3033
```

### 3. Setup Database

```bash
npm run db:setup
```

### 4. Start Server

```bash
npm start
```

Server will run on `http://localhost:3033`

## API Endpoints

### Process Scene Input (AI-Powered)

```http
POST /process
Content-Type: application/json

{
  "user_id": "user123",
  "entity_id": "char_thorin",
  "input": "I move north to the tavern",
  "meta_data": {
    "intent": "movement",
    "confidence": 0.95
  }
}
```

### Get Entity Position

```http
GET /position/:entityId
```

### Get Nearby Locations

```http
GET /nearby?x=100&y=200&radius=50&type=poi
```

### Get Location Details

```http
GET /location/:locationId
```

### Move Entity

```http
POST /move
{
  "entity_id": "char_thorin",
  "x": 150.5,
  "y": 225.0,
  "movement_type": "walk"
}
```

## Database Schema

### Tables

- **locations** - Named places (cities, dungeons, rooms)
- **pois** - Points of interest (shops, NPCs, landmarks)
- **entity_positions** - Current positions of characters/NPCs
- **movement_history** - Historical movement data
- **location_connections** - Paths between locations

### Coordinate System

- Grid-based X/Y coordinates
- Decimal precision (10, 2) for sub-unit positioning
- Spatial indexing for fast proximity queries
- Hierarchical locations (e.g., "Tavern" inside "Village")

## Integration with CharacterController

SceneController provides location context to CharacterController:

```typescript
// CharacterController fetches current location
const position = await sceneController.getEntityPosition(characterId);
const location = await sceneController.getLocation(position.location_id);
const nearby = await sceneController.getNearbyPOIs(position.x, position.y, 50);

// Include in character context
characterContext.location = location.name;
characterContext.nearbyPOIs = nearby.map(poi => poi.name);
```

## Module Ports

- **CharacterController**: Port 3031
- **IntentInterpreter**: Port 3032
- **SceneController**: Port 3033

## CLI Usage

```bash
# Start CLI
npm run cli

# Example commands
/position char_thorin
/nearby 100 200 50
/move char_thorin 150 225
/location town_square
```

## Examples

### Create Location

```json
{
  "name": "Misty Mountains Tavern",
  "description": "A warm tavern at the foot of the mountains",
  "location_type": "building",
  "x_coord": 100.0,
  "y_coord": 200.0
}
```

### Track Character Position

```json
{
  "entity_id": "char_thorin",
  "entity_type": "player_character",
  "entity_name": "Thorin",
  "x_coord": 100.5,
  "y_coord": 200.2,
  "user_id": "user123"
}
```

### Find Nearby POIs

```bash
GET /nearby?x=100&y=200&radius=50&type=poi

Response:
{
  "success": true,
  "results": [
    {
      "id": 1,
      "name": "Blacksmith Shop",
      "distance": 12.5,
      "x_coord": 105,
      "y_coord": 210
    }
  ]
}
```

## Documentation

- **README.md** - This file
- **API.md** - Complete API documentation
- **INTEGRATION.md** - Integration with other modules
- **examples/** - Example requests and responses

## License

MIT
