# Migration Guide: v1.1 → v2.0

## Breaking Changes

CharacterController v2.0 introduces MySQL storage with user management and name conflict detection. This is a **major breaking change** from the file-based storage in v1.x.

###  Summary of Changes

| Feature | v1.x | v2.0 |
|---------|------|------|
| Storage | JSON files | MySQL database |
| User Management | None | Required `user_id` field |
| Name Conflicts | Not handled | Automatic detection & prevention |
| Character Scope | Global | Per-user |
| Input Format | `{input, user_character?, meta_data?}` | `{user_id, input, user_character?, meta_data?}` |

## What's New in v2.0

### 1. MySQL Database Storage
- Persistent, reliable storage with ACID guarantees
- Better performance for multiple concurrent users
- Transaction support for atomic operations
- Structured data with proper indexing

### 2. User Management
- Each character belongs to a specific user
- Users are automatically created on first interaction
- Characters are scoped to users (User A's "Thorin" ≠ User B's "Thorin")

### 3. Name Conflict Detection
- Prevents duplicate character names across all users
- Returns error when name is already taken
- Tracks name change history

### 4. Name Change Tracking
- History table records all name changes
- Can query previous names for a character

## Migration Steps

### Step 1: Install MySQL

Ensure you have MySQL 5.7+ or MariaDB 10.2+ installed.

```bash
# Ubuntu/Debian
sudo apt-get install mysql-server

# macOS (Homebrew)
brew install mysql

# Start MySQL
sudo systemctl start mysql  # Linux
brew services start mysql   # macOS
```

### Step 2: Configure Database

Update `.env` with your MySQL credentials:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=character_controller
```

### Step 3: Run Database Setup

```bash
npm run db:setup
```

This creates:
- `users` table
- `characters` table
- `character_name_history` table
- Necessary indexes and foreign keys

### Step 4: Migrate Existing Data (Optional)

If you have existing character data in JSON files from v1.x, you can migrate it:

```bash
# Create migration script
node tools/migrate-from-v1.js
```

See `tools/migrate-from-v1.js` (example below) for data migration.

### Step 5: Update Your Code

**Before (v1.1):**
```json
{
  "input": "I attack the goblin",
  "user_character": "Thorin"
}
```

**After (v2.0):**
```json
{
  "user_id": "user123",
  "input": "I attack the goblin",
  "user_character": "Thorin"
}
```

## API Changes

### Input Format

**BREAKING**: `user_id` is now **required**.

```typescript
interface CLIInput {
  user_id: string;          // NEW: Required user identifier
  input: string;            // Unchanged
  user_character?: string;  // Unchanged
  meta_data?: any;          // Unchanged
}
```

### Response Format

Name conflicts return structured error:

```typescript
interface NameConflictError {
  code: 'NAME_CONFLICT';
  attemptedName: string;
  conflictingUserId?: string;
  message: string;
}
```

Example error response:

```json
{
  "success": false,
  "message": "Character name \"Thorin\" is already taken",
  "error": {
    "code": "NAME_CONFLICT",
    "attemptedName": "Thorin",
    "message": "Character name \"Thorin\" is already taken"
  }
}
```

### Method Signatures

**CharacterManager methods now require `userId`:**

```typescript
// Before (v1.1)
await manager.getCharacter('Thorin');
await manager.listCharacters();
await manager.deleteCharacter('Thorin');

// After (v2.0)
await manager.getCharacter('user123', 'Thorin');
await manager.listCharacters('user123');
await manager.deleteCharacter('user123', 'Thorin');
```

## Name Conflict Handling

### When Conflicts Occur

**Scenario 1: First-time character creation**

User A tries to create a character with a name already taken by User B:

```json
{
  "user_id": "userA",
  "input": "Create character Thorin, a dwarf warrior"
}
```

If User B already has "Thorin":

```json
{
  "success": false,
  "error": {
    "code": "NAME_CONFLICT",
    "attemptedName": "Thorin",
    "message": "Character name \"Thorin\" is already taken"
  }
}
```

**Scenario 2: Changing character name**

```json
{
  "user_id": "userA",
  "input": "Rename my character to Gandalf",
  "user_character": "MyOldName"
}
```

If "Gandalf" is taken → returns NAME_CONFLICT error.

### Handling in Your Application

```typescript
const result = await manager.processInput({
  user_id: userId,
  input: userMessage,
  user_character: characterName,
});

if (!result.success && typeof result.error === 'object') {
  if (result.error.code === 'NAME_CONFLICT') {
    // Prompt user to choose a different name
    return `Sorry, "${result.error.attemptedName}" is already taken. Please choose another name.`;
  }
}
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id VARCHAR(255) PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Characters Table
```sql
CREATE TABLE characters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  data JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_character (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Character Name History Table
```sql
CREATE TABLE character_name_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  character_id INT NOT NULL,
  old_name VARCHAR(255) NOT NULL,
  new_name VARCHAR(255) NOT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);
```

## Example Migration Script

Create `tools/migrate-from-v1.js`:

```javascript
import fs from 'fs';
import path from 'path';
import { MySQLStorage } from '../dist/mysql-storage.js';

async function migrate() {
  const storage = new MySQLStorage();
  const oldDataDir = './data/characters';
  const defaultUserId = 'migrated-user';

  const files = fs.readdirSync(oldDataDir);

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    const data = JSON.parse(
      fs.readFileSync(path.join(oldDataDir, file), 'utf8')
    );

    console.log(`Migrating character: ${data.name}`);

    try {
      await storage.saveCharacter(defaultUserId, data);
      console.log(`✓ Migrated ${data.name}`);
    } catch (error) {
      console.error(`✗ Failed to migrate ${data.name}:`, error.message);
    }
  }

  await storage.close();
  console.log('Migration complete!');
}

migrate();
```

Run with:
```bash
npm run build
node tools/migrate-from-v1.js
```

## Backward Compatibility

**None.** This is a major version bump (v2.0) with breaking changes.

Applications must:
1. Provide `user_id` in all requests
2. Update to MySQL database
3. Handle `NAME_CONFLICT` errors

## Testing

Update your tests to include `user_id`:

```typescript
// Before
const result = await manager.processInput({
  input: "Create Thorin",
});

// After
const result = await manager.processInput({
  user_id: "test-user",
  input: "Create Thorin",
});
```

## Rollback

If you need to rollback to v1.1:

```bash
npm install character-controller@1.1.0
```

And revert your code to not include `user_id` in requests.

## Support

For issues or questions:
- Open an issue on GitHub
- Check the updated README.md
- Review INTEGRATION.md for integration examples

## Next Steps

1. Update your application code to include `user_id`
2. Setup MySQL database
3. Run `npm run db:setup`
4. Test with a few characters
5. Handle `NAME_CONFLICT` errors in your UI
6. Deploy!
