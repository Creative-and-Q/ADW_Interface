# CharacterController v2.0 - Release Notes

## 🎉 Major Release: MySQL Storage & Name Conflict Detection

CharacterController v2.0 is a complete rewrite of the storage layer with MySQL database, user management, and automatic name conflict detection.

## ⚠️ Breaking Changes

**This is a MAJOR version** with breaking changes. All applications must:

1. **Add `user_id` to all requests** (required field)
2. **Setup MySQL database** (replaces JSON files)
3. **Handle NAME_CONFLICT errors** (new error type)
4. **Update method calls** (now require userId parameter)

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for migration instructions.

## 🆕 What's New

### MySQL Database Storage
- Replaces file-based JSON storage
- ACID transactions for data integrity
- Connection pooling for performance
- Foreign keys and proper constraints
- Efficient indexing

### User Management
- Each character belongs to a user
- Users auto-created on first interaction
- User-scoped character operations
- Multi-user support out of the box

### Name Conflict Detection
- **Global name uniqueness** - prevents duplicate character names
- Automatic checking on character creation
- Automatic checking on name changes
- Returns structured `NAME_CONFLICT` error
- Name history tracking

### Name Change History
- Tracks all character renames in database
- Query historical names with `getNameHistory()`
- Audit trail for character evolution

## 📋 Features

### Core Functionality
- ✅ AI-powered character sheet management
- ✅ Natural language parsing
- ✅ Intelligent data merging
- ✅ IntentInterpreter integration
- ✅ Contextual responses

### New in v2.0
- ✅ MySQL database storage
- ✅ User management
- ✅ Name conflict prevention
- ✅ Name change tracking
- ✅ Transaction support
- ✅ Multi-user isolation

## 🔧 Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Database
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=character_controller
```

### 3. Initialize Database
```bash
npm run db:setup
```

### 4. Build & Run
```bash
npm run build
npm start
```

## 📝 Usage Examples

### Basic Input (v2.0)
```json
{
  "user_id": "user123",
  "input": "Create Thorin, a dwarf warrior",
  "user_character": "Thorin"
}
```

### Name Conflict Response
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

### Handling Conflicts
```typescript
const result = await manager.processInput({
  user_id: userId,
  input: message,
});

if (!result.success && result.error?.code === 'NAME_CONFLICT') {
  return `Name "${result.error.attemptedName}" is taken. Try another!`;
}
```

## 🗄️ Database Schema

### Tables Created
- `users` - User management
- `characters` - Character data with JSON storage
- `character_name_history` - Name change tracking

### Key Features
- Foreign key constraints
- Unique constraints on (user_id, name)
- Automatic timestamps
- Cascading deletes
- Optimized indexes

## 🔄 Migration from v1.x

### Required Changes

| Aspect | v1.x | v2.0 |
|--------|------|------|
| Input | `{input, user_character?}` | `{user_id, input, user_character?}` |
| Storage | JSON files | MySQL database |
| Errors | String errors | Structured `NameConflictError` |
| Methods | `getCharacter(name)` | `getCharacter(userId, name)` |

### Migration Steps
1. Review [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
2. Setup MySQL database
3. Run `npm run db:setup`
4. Optionally migrate existing data
5. Update application code
6. Test thoroughly
7. Deploy!

## 📚 Documentation

- **README_v2.md** - Complete feature documentation
- **MIGRATION_GUIDE.md** - Migration from v1.x
- **INTEGRATION.md** - IntentInterpreter integration
- **CHANGELOG.md** - Full change history
- **examples/input-examples-v2.json** - Example requests

## 🐛 Known Issues

None at release. Please report issues on GitHub.

## ⚡ Performance

- Connection pooling for efficiency
- Indexed queries for fast lookups
- Transaction support for consistency
- Caching layer for frequently accessed characters

## 🔐 Security

- SQL injection protection via parameterized queries
- Foreign key constraints prevent orphaned data
- Transaction rollback on errors
- User isolation for multi-tenant safety

## 🧪 Testing

Tests need updating for v2.0 (marked as pending).

```bash
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage
```

## 🛠️ Development

```bash
npm run build     # Compile TypeScript
npm run typecheck # Type checking
npm run lint      # Lint code
npm run format    # Format code
npm run db:setup  # Setup database
```

## 📦 Deployment

1. Ensure MySQL is available in production
2. Configure DB_* environment variables
3. Run `npm run db:setup` on first deploy
4. Build with `npm run build`
5. Start with `npm start`

## 🤝 Contributing

Contributions welcome! Please:
1. Update tests for new features
2. Follow existing code style
3. Update documentation
4. Test with MySQL before PR

## 📄 License

MIT

## 🙏 Support

- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: Complete docs in `/docs` folder
- **Migration Help**: See MIGRATION_GUIDE.md

---

**Upgrade today for better performance, data integrity, and multi-user support!**
