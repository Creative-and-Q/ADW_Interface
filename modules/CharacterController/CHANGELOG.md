# Changelog

All notable changes to the CharacterController project.

## [2.0.0] - 2025-10-28

### 🚨 BREAKING CHANGES
- **MySQL Storage**: File-based storage replaced with MySQL database
- **User Management**: `user_id` is now required in all requests
- **Name Conflicts**: Character names must be unique globally
- **API Changes**: All manager methods now require `userId` parameter

### Added
- **MySQL database** storage with connection pooling
- **User management** system with automatic user creation
- **Name conflict detection** - prevents duplicate character names
- **Name change history** tracking in database
- Database schema with proper foreign keys and indexes
- `MySQLStorage` class for database operations
- `NameConflictError` type for structured error responses
- Database setup script (`npm run db:setup`)
- `MIGRATION_GUIDE.md` for v1.x → v2.0 migration
- Character name history API (`getNameHistory()`)
- Transaction support for atomic operations
- User-scoped character lists and searches

### Changed
- **BREAKING**: Input format now requires `user_id` field
- **BREAKING**: Storage layer completely rewritten for MySQL
- **BREAKING**: CharacterManager constructor no longer accepts `storageDir`
- **BREAKING**: All character operations scoped to user ID
- CLI commands updated to require user ID
- Cache keys now include user ID for isolation
- Error responses include structured `NameConflictError` for name conflicts

### Removed
- File-based JSON storage (`CharacterStorage` class)
- `CHARACTERS_DIR` environment variable (replaced with MySQL config)

### Database Schema
- `users` table for user management
- `characters` table with user_id and unique constraints
- `character_name_history` table for rename tracking
- Indexes on user_id, name, and timestamps

### Migration
- See `MIGRATION_GUIDE.md` for detailed migration instructions
- Data migration script example provided
- No automatic migration - manual migration required

## [1.1.0] - 2025-10-28

### Added
- **Enhanced input format** with `user_character`, `input`, and `meta_data` fields
- **IntentInterpreter integration** support via `meta_data` field
- Metadata passthrough in responses (echoes `meta_data` back)
- User character override to explicitly specify which character to update
- Context generation now includes metadata for more accurate responses
- Integration guide (INTEGRATION.md) with examples
- Example input files showing various use cases
- Support for arbitrary metadata from external systems

### Changed
- **BREAKING**: Input format changed from `{"input": "..."}` to `{"input": "...", "user_character": "...", "meta_data": {...}}`
- AI parser now accepts optional `userCharacter` and `metaData` parameters
- Context generation includes metadata in AI prompts
- Response format now includes `meta_data` field
- CLI help text updated to show new input format

### Technical
- Updated `CLIInput` interface with new fields
- Updated `CLIResponse` interface to include metadata
- Updated `AIParser.parseInput()` signature
- Updated `AIParser.generateContext()` signature
- Updated `CharacterManager.processInput()` to use `CLIInput`
- Character name resolution now prefers `user_character` over AI detection

## [1.0.0] - 2025-10-28

### Added
- Initial release
- AI-powered character sheet management
- Natural language parsing using OpenRouter
- Persistent JSON storage for characters
- Comprehensive character data model (stats, inventory, spells, etc.)
- Intelligent data merging (items stack, arrays combine)
- CLI interface with interactive and single-input modes
- Character context generation for actions
- 16 comprehensive tests
- Full TypeScript support with Zod validation

### Features
- Character creation from natural language
- Automatic item stacking and inventory management
- Ability score tracking with modifier calculation
- Spell management and tracking
- Condition and status effect tracking
- Currency management
- Relationship and social tracking
- Equipment management
- Proficiency and skill tracking
