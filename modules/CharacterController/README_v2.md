# CharacterController v2.0

AI-powered character sheet management system with **MySQL storage**, **user management**, and **automatic name conflict detection**.

## What's New in v2.0

- 🗄️ **MySQL Database Storage** - Reliable, persistent storage with ACID guarantees
- 👥 **Multi-User Support** - Each user has their own character namespace
- 🚫 **Name Conflict Detection** - Prevents duplicate character names globally
- 📜 **Name Change History** - Track all character renames
- ⚡ **Better Performance** - Optimized queries and indexing
- 🔒 **Data Integrity** - Foreign keys and transactions

## Breaking Changes from v1.x

**IMPORTANT**: This is a major version with breaking changes. See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for details.

- `user_id` is now **required** in all requests
- File-based storage replaced with MySQL
- Character names must be unique globally (not per-user)
- CLI commands updated to require user ID

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup MySQL Database

Configure database in `.env`:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=character_controller

OPENROUTER_API_KEY=your_key_here
```

Create database and tables:

```bash
npm run db:setup
```

### 3. Build and Run

```bash
npm run build
npm start
```

## Input Format

**All inputs now require `user_id`:**

```json
{
  "user_id": "user123",
  "input": "I attack the goblin with my sword",
  "user_character": "Thorin",
  "meta_data": {
    "intent": "attack",
    "confidence": 0.95
  }
}
```

## Name Conflict Handling

When a character name is already taken:

**Input:**
```json
{
  "user_id": "userA",
  "input": "Create character Thorin"
}
```

**Response** (if name is taken):
```json
{
  "success": false,
  "message": "Cannot create character: \"Thorin\" is already taken",
  "error": {
    "code": "NAME_CONFLICT",
    "attemptedName": "Thorin",
    "message": "Character name \"Thorin\" is already taken"
  }
}
```

## How It Works

### First-Time Name Declaration

When `user_character` is empty, the system:
1. Extracts character name from natural language
2. Checks if name is available globally
3. Returns error if name is taken
4. Creates character if available

**Example:**
```json
{
  "user_id": "user123",
  "input": "My character's name is Elara, she's an elf mage"
}
```

The system detects "Elara" and checks availability before creating.

### Name Changes

When a character tries to change their name:
1. Detects the name change in the input
2. Checks if new name is available
3. Returns error if name is taken
4. Records change in history if successful

**Example:**
```json
{
  "user_id": "user123",
  "input": "I want to rename my character to Gandalf",
  "user_character": "Elara"
}
```

If "Gandalf" is taken → returns `NAME_CONFLICT` error.

## Database Schema

### Users
```sql
CREATE TABLE users (
  id VARCHAR(255) PRIMARY KEY,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Characters
```sql
CREATE TABLE characters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  data JSON NOT NULL,
  UNIQUE (user_id, name)
);
```

### Name History
```sql
CREATE TABLE character_name_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  character_id INT NOT NULL,
  old_name VARCHAR(255),
  new_name VARCHAR(255),
  changed_at TIMESTAMP
);
```

## API Examples

### Create Character

```bash
curl -X POST http://localhost:3000/process \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user123",
    "input": "Create Thorin, a dwarf warrior with a battleaxe"
  }'
```

### Handle Name Conflict

```typescript
const result = await manager.processInput({
  user_id: userId,
  input: userMessage,
});

if (!result.success) {
  if (typeof result.error === 'object' && result.error.code === 'NAME_CONFLICT') {
    console.log(`Name "${result.error.attemptedName}" is already taken!`);
    // Prompt user for different name
  }
}
```

### Get Name History

```typescript
const history = await manager.getNameHistory('user123', 'Thorin');
// Returns: [{ oldName: 'Thor', newName: 'Thorin', changedAt: Date }]
```

## CLI Commands

```bash
# List characters for a user
/list user123

# Get character
/get user123 Thorin

# Get stats
/stats user123

# Global stats
/stats
```

## Integration with IntentInterpreter

See [INTEGRATION.md](./INTEGRATION.md) for detailed integration guide.

```typescript
// Full pipeline
const intent = await intentInterpreter.interpret(message);

const result = await characterManager.processInput({
  user_id: session.userId,
  input: message,
  user_character: session.characterName,
  meta_data: {
    intent: intent.primaryIntent.type,
    confidence: intent.primaryIntent.confidence,
  },
});

if (!result.success && result.error?.code === 'NAME_CONFLICT') {
  return `That name is taken! Try another.`;
}
```

## Features

### Character Management
- Automatic character creation
- Name conflict prevention
- Name change tracking
- Multi-user isolation

### Data Model
- Basic info (name, race, class, level)
- Ability scores (STR, DEX, CON, INT, WIS, CHA)
- Combat stats (HP, AC, initiative)
- Inventory with stacking
- Spells and spellcasting
- Conditions and status effects
- Relationships and social data
- Currency management

### Database Features
- ACID transactions
- Foreign key constraints
- Automatic timestamps
- Efficient indexing
- Connection pooling

## Configuration

### Environment Variables

```env
# MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=character_controller

# OpenRouter AI
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet

# AI Settings
AI_TEMPERATURE=0.3
AI_MAX_TOKENS=2000
```

## Testing

```bash
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## Development

```bash
npm run build     # Compile TypeScript
npm run typecheck # Type checking
npm run lint      # Lint code
npm run format    # Format code
```

## Migration from v1.x

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for complete migration instructions.

## Troubleshooting

### Database Connection Errors

```bash
# Check MySQL is running
mysql -u root -p

# Verify database exists
SHOW DATABASES;

# Test connection
mysql -h localhost -u root -p character_controller
```

### Name Conflicts

Names are globally unique. If you get a conflict:
1. Choose a different name
2. Add a suffix (e.g., "Thorin2", "ThorinX")
3. Use full names ("Thorin Oakenshield")

### Migration Issues

If migration fails:
```bash
# Drop and recreate database
mysql -u root -p
DROP DATABASE character_controller;
CREATE DATABASE character_controller;
exit

# Re-run setup
npm run db:setup
```

## License

MIT

## Support

- GitHub Issues: [Report bugs](https://github.com/yourrepo/character-controller/issues)
- Documentation: See docs/ folder
- Migration Guide: [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
