# Intent Interpreter

AI-powered chat message intent classifier using OpenRouter's Grok 4 Fast model. Designed for text-based role-playing games to interpret and classify user messages into various action categories.

## Features

- **19 Intent Categories**: Comprehensive classification including attack, movement, dialogue, magic, stealth, and more
- **Multi-Intent Detection**: Returns multiple intents per message, ranked by confidence
- **Permanent Caching**: Two-tier cache system (memory + disk) for instant responses and token savings
- **CLI Interface**: Interactive mode and single-message mode
- **Standardized JSON Output**: Clean, consistent response format
- **Type-Safe**: Full TypeScript implementation
- **Well-Tested**: Comprehensive unit test suite with 70+ tests
- **Configurable**: Adjustable confidence thresholds, result limits, and cache settings

## Intent Categories

| Intent | Description | Example |
|--------|-------------|---------|
| `attack` | Physical combat or aggressive actions | "I attack the goblin with my sword!" |
| `defend` | Defensive or protective actions | "I raise my shield to block" |
| `movement` | Navigation or travel actions | "I walk north" |
| `investigation` | Examining or searching | "I examine the chest" |
| `emote` | Emotional expressions | "I smile at the merchant" |
| `dialogue` | Speaking or communicating | "I ask about the quest" |
| `creation` | Crafting or building | "I craft a wooden sword" |
| `item_use` | Using, consuming, or equipping items | "I drink the potion" |
| `trade` | Trading or economic transactions | "I buy the armor" |
| `magic` | Spell casting or supernatural abilities | "I cast fireball" |
| `stealth` | Sneaking or hiding | "I sneak past the guards" |
| `rest` | Resting or recovery actions | "I rest at the campfire" |
| `interaction` | Interacting with objects | "I pull the lever" |
| `social` | Relationship-building actions | "I befriend the villager" |
| `gather` | Collecting or harvesting resources | "I mine the ore" |
| `learn` | Learning or skill development | "I study the spellbook" |
| `system_command` | Meta-game or UI commands | "show inventory" |
| `user_action` | General actions | "Hello there!" |
| `unknown` | Unclear or ambiguous intent | "asdfghjkl" |

## Installation

### Prerequisites

- Node.js 18.x or higher
- npm or yarn
- OpenRouter API key ([Get one here](https://openrouter.ai/))

### Setup

1. **Clone or navigate to the project directory:**
   ```bash
   cd IntentInterpreter
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` and add your OpenRouter API key:**
   ```bash
   OPENROUTER_API_KEY=your_api_key_here
   OPENROUTER_MODEL=xai/grok-2-1212
   OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
   MIN_CONFIDENCE_THRESHOLD=0.3
   MAX_INTENTS_RETURNED=5

   # Cache configuration (permanent persistence)
   CACHE_ENABLED=true
   CACHE_MEMORY_ENABLED=true
   CACHE_MEMORY_MAX_SIZE=1000
   CACHE_FILE_ENABLED=true
   CACHE_FILE_DIR=./.cache
   ```

5. **Build the project (optional):**
   ```bash
   npm run build
   ```

## Usage

### Interactive Mode

Start an interactive REPL session where you can test multiple messages:

```bash
npm start
# or
npm start -- --interactive
```

Available commands in interactive mode:
- `/quit`, `/exit`, `/q` - Exit the program
- `/help` - Show help message
- `/config` - Show current configuration
- `/stats` - Show cache statistics (hits, misses, tokens saved)
- `/clear-cache` - Clear all cached entries

### Single Message Mode

Interpret a single message and output the result:

```bash
npm start -- -m "I attack the goblin with my sword!"
```

Output (JSON format):
```json
{
  "rawMessage": "I attack the goblin with my sword!",
  "intents": [
    {
      "intent": "attack",
      "confidence": 0.98,
      "reasoning": "Explicit combat action with clear target and weapon",
      "metadata": {
        "target": "goblin",
        "weapon": "sword"
      }
    },
    {
      "intent": "item_use",
      "confidence": 0.65,
      "reasoning": "Using a sword implies equipment/item usage",
      "metadata": {
        "item": "sword"
      }
    }
  ],
  "timestamp": "2025-10-28T17:45:00.000Z",
  "processingTimeMs": 1250,
  "model": "xai/grok-2-1212"
}
```

### Colored Output (Single Message)

For human-readable colored output instead of JSON:

```bash
npm start -- -m "I attack the goblin" --no-json
```

## Output Format

### InterpretationResult

The standard response structure:

```typescript
{
  rawMessage: string;           // The original user message
  intents: ClassifiedIntent[];  // Array of identified intents (ordered by confidence)
  timestamp: string;            // ISO 8601 timestamp
  processingTimeMs: number;     // Processing time in milliseconds
  model: string;                // Model used (e.g., "xai/grok-2-1212")
  fromCache?: boolean;          // Whether result was served from cache
  error?: string;               // Error message (if any)
}
```

### ClassifiedIntent

Individual intent structure:

```typescript
{
  intent: IntentType;                    // The intent category
  confidence: number;                    // Confidence score (0.0 - 1.0)
  reasoning: string;                     // Brief explanation
  metadata?: Record<string, unknown>;    // Additional context
}
```

## Caching System

The IntentInterpreter features a sophisticated two-tier caching system designed to save API tokens and provide instant responses for common messages.

### Cache Architecture

1. **Memory Cache (Tier 1)**:
   - Fast LRU (Least Recently Used) cache
   - Stores recently used interpretations in RAM
   - Default size: 1000 entries
   - Automatic eviction of least recently used items

2. **File Cache (Tier 2)**:
   - **Permanent persistence** - never expires
   - Each entry stored as a JSON file on disk
   - Survives application restarts
   - Default location: `./.cache`

### How It Works

```
User Message → Check Memory Cache → Check File Cache → API Call
                    ↓ (hit)             ↓ (hit)         ↓ (miss)
                Return cached      Return cached    Call API &
                instantly          instantly        cache result
```

### Cache Benefits

- ⚡ **Instant Responses**: Cached results return in <10ms vs 800-1500ms for API calls
- 💰 **Token Savings**: Each cache hit saves ~700+ tokens (system prompt + message + response)
- 🔄 **Permanent Storage**: Common messages cached forever
- 🧠 **Smart Normalization**: "Hello" and "hello" hit the same cache entry

### Cache Statistics

View cache performance in interactive mode:

```bash
npm start
> /stats

Cache Statistics:
  Hits: 45
  Misses: 12
  Hit Rate: 78.95%
  Cache Size: 32 entries
  Tokens Saved: ~31,500
```

### Cache Management

**In Interactive Mode:**
```bash
/stats        # View cache statistics
/clear-cache  # Clear all cached entries
```

**Programmatically:**
```typescript
const interpreter = new IntentInterpreter(config);

// Get statistics
const stats = interpreter.getCacheStats();
console.log(`Hit rate: ${stats.hitRate}%`);
console.log(`Tokens saved: ${stats.tokensSaved}`);

// Clear cache
await interpreter.clearCache();

// Check if message is cached
const isCached = await interpreter.isCached('attack goblin');

// Remove specific entry
await interpreter.removeCachedMessage('attack goblin');
```

### Cache Configuration

Configure caching behavior via environment variables or code:

**Environment Variables:**
```bash
CACHE_ENABLED=true                # Enable/disable caching
CACHE_MEMORY_ENABLED=true         # Enable memory cache
CACHE_MEMORY_MAX_SIZE=1000        # Max memory cache entries
CACHE_FILE_ENABLED=true           # Enable permanent file cache
CACHE_FILE_DIR=./.cache           # Cache directory path
```

**Programmatic Configuration:**
```typescript
const interpreter = new IntentInterpreter(
  { apiKey, model, baseUrl },
  {
    cacheEnabled: true,
    cacheMemoryEnabled: true,
    cacheMemoryMaxSize: 2000,
    cacheFileEnabled: true,
    cacheFileCacheDir: './my-cache',
  }
);
```

### Cache Key Generation

Messages are normalized before hashing to maximize cache hits:

- Converted to lowercase
- Whitespace trimmed and normalized
- SHA-256 hash generated

Examples:
```javascript
"Attack the goblin!"  → same key
"ATTACK THE GOBLIN!"  → same key
"  attack    the  goblin  " → same key
```

### Disabling Cache

To disable caching entirely:

```bash
# In .env
CACHE_ENABLED=false
```

Or programmatically:
```typescript
const interpreter = new IntentInterpreter(config, {
  cacheEnabled: false,
});
```

## Development

### Project Structure

```
IntentInterpreter/
├── src/
│   ├── types.ts              # TypeScript interfaces and types
│   ├── openrouter.ts         # OpenRouter API client
│   ├── interpreter.ts        # Main interpreter class
│   ├── index.ts              # CLI entry point
│   ├── cache/                # Caching system
│   │   ├── cache-interface.ts    # Cache interface and types
│   │   ├── cache-utils.ts        # Hashing and normalization
│   │   ├── memory-cache.ts       # In-memory LRU cache
│   │   ├── file-cache.ts         # Persistent file cache
│   │   └── cache-manager.ts      # Unified cache manager
│   └── prompts/
│       └── system-prompt.ts  # System prompt for Grok
├── tests/
│   ├── openrouter.test.ts    # API client tests
│   ├── interpreter.test.ts   # Interpreter tests
│   ├── prompts.test.ts       # Prompt utility tests
│   ├── cache/                # Cache tests
│   │   ├── cache-utils.test.ts
│   │   └── memory-cache.test.ts
│   └── fixtures/
│       └── test-cases.ts     # Test data and examples
├── .cache/                   # Persistent cache storage (gitignored)
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Code Quality

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format

# Check formatting
npm run format:check
```

### Building

```bash
# Compile TypeScript to JavaScript
npm run build
```

The compiled output will be in the `dist/` directory.

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key | *Required* |
| `OPENROUTER_MODEL` | Model to use | `xai/grok-2-1212` |
| `OPENROUTER_BASE_URL` | OpenRouter API base URL | `https://openrouter.ai/api/v1` |
| `MIN_CONFIDENCE_THRESHOLD` | Minimum confidence to include intent | `0.3` |
| `MAX_INTENTS_RETURNED` | Maximum intents per response | `5` |
| `LOG_LEVEL` | Logging level | `info` |

### Programmatic Usage

You can also use the interpreter programmatically in your own code:

```typescript
import { IntentInterpreter } from './src/interpreter.js';
import { IntentType } from './src/types.js';

// Create interpreter instance
const interpreter = new IntentInterpreter(
  {
    apiKey: 'your-api-key',
    model: 'xai/grok-2-1212',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  {
    minConfidenceThreshold: 0.3,
    maxIntentsReturned: 5,
  }
);

// Interpret a single message
const result = await interpreter.interpret('I attack the goblin');
console.log(result.intents[0].intent); // "attack"
console.log(result.intents[0].confidence); // 0.98

// Interpret multiple messages
const results = await interpreter.interpretBatch([
  'I walk north',
  'I examine the chest',
  'I cast fireball',
]);
```

## Testing Guide

### Test Coverage

The project includes comprehensive tests covering:

- **OpenRouter API Client**: Configuration validation, request creation, error handling
- **Intent Interpreter**: Message validation, result structure, intent filtering, batch processing
- **System Prompt**: Prompt generation, intent type validation
- **Test Fixtures**: 60+ example messages covering all intent categories

### Running Specific Tests

```bash
# Run only interpreter tests
npm test -- interpreter.test.ts

# Run with verbose output
npm test -- --verbose

# Run in watch mode for development
npm run test:watch
```

### Test Data

The `tests/fixtures/test-cases.ts` file contains a comprehensive set of test cases for all intent types. Use these as examples when integrating the interpreter into your application.

## Error Handling

The interpreter provides detailed error types:

- `API_ERROR`: OpenRouter API errors (auth, rate limiting, server errors)
- `VALIDATION_ERROR`: Invalid input (empty messages, too long, etc.)
- `PARSING_ERROR`: Failed to parse Grok's JSON response
- `CONFIGURATION_ERROR`: Invalid configuration parameters
- `NETWORK_ERROR`: Network connectivity issues

Example error response:

```json
{
  "rawMessage": "test message",
  "intents": [
    {
      "intent": "unknown",
      "confidence": 0.0,
      "reasoning": "Error occurred during interpretation"
    }
  ],
  "timestamp": "2025-10-28T17:45:00.000Z",
  "processingTimeMs": 150,
  "model": "xai/grok-2-1212",
  "error": "Invalid API key or authentication failed"
}
```

## Performance

- Average processing time: 800-1500ms per message (depends on API response time)
- Batch processing: Sequential processing to avoid rate limits
- Caching: Not implemented (each message is sent to API)

## Limitations

- Requires internet connection (calls OpenRouter API)
- API rate limits apply (varies by OpenRouter plan)
- Maximum message length: 5000 characters
- Results depend on Grok model's interpretation

## Troubleshooting

### "API key is required" error

Make sure you've created a `.env` file with your `OPENROUTER_API_KEY`:

```bash
cp .env.example .env
# Edit .env and add your key
```

### "Invalid response from OpenRouter" error

This usually means:
1. The API key is invalid
2. The model identifier is incorrect
3. Network connectivity issues

Check your configuration and API key validity.

### Tests failing

Make sure you've installed dependencies and built the project:

```bash
npm install
npm run build
npm test
```

## Contributing

This is a server-only project designed for intent classification in text-based games. When contributing:

1. Follow the existing code style (enforced by ESLint/Prettier)
2. Add tests for new features
3. Update documentation for API changes
4. Ensure all tests pass before submitting

## License

MIT License - See package.json for details

## Support

For issues, questions, or feature requests, please refer to the project maintainer.

---

**Built with TypeScript, OpenRouter, and Grok 4 Fast**
