# Character Controller

AI-powered character sheet management system for RPG games. Automatically extracts character information from natural language and maintains persistent character data.

## Features

- **AI-Powered Parsing**: Automatically detects character names and extracts stats, items, and abilities from natural language
- **Intelligent Merging**: Updates merge with existing data (items stack, abilities combine, stats update)
- **Persistent Storage**: Character sheets saved as JSON files with automatic loading
- **Contextual Responses**: Provides relevant character info when actions are referenced
- **JSON API**: All inputs and outputs in standardized JSON format
- **Comprehensive Data Model**: Tracks stats, inventory, spells, appearance, relationships, conditions, and more

## Installation

```bash
npm install
npm run build
```

## Configuration

Create a `.env` file with your OpenRouter API credentials:

```env
# Required
OPENROUTER_API_KEY=your_api_key_here

# Optional
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_TEMPERATURE=0.3
AI_MAX_TOKENS=2000
CHARACTERS_DIR=./data/characters
```

## Usage

### Input Format

All inputs must be JSON objects with the following structure:

```typescript
{
  "input": string,              // Required: Natural language message
  "user_character"?: string,    // Optional: Character name override
  "meta_data"?: {               // Optional: Additional context
    "intent"?: string,          // From IntentInterpreter
    "confidence"?: number,      // AI confidence score
    "entities"?: {...},         // Extracted entities
    // ... any other metadata
  }
}
```

### Interactive Mode

```bash
npm start
```

Interactive mode provides a REPL interface with JSON input/output:

```json
> {"input": "Thorin the dwarf warrior finds a battleaxe", "user_character": "Thorin"}
{
  "success": true,
  "characterUpdated": "Thorin",
  "changes": {
    "race": "dwarf",
    "class": "warrior",
    "items": [{"name": "battleaxe", "quantity": 1}]
  },
  "message": "Updated character: Thorin dwarf warrior"
}
```

### With IntentInterpreter Metadata

```json
> {
    "input": "I attack the goblin with my sword",
    "user_character": "Thorin",
    "meta_data": {
      "intent": "attack",
      "confidence": 0.95,
      "entities": {"target": "goblin", "weapon": "sword"}
    }
  }
{
  "success": true,
  "characterUpdated": "Thorin",
  "context": {
    "name": "Thorin",
    "relevantInfo": {
      "items": ["sword (equipped)"],
      "stats": {"strength": 16}
    }
  },
  "message": "Updated character: Thorin dwarf warrior",
  "meta_data": {
    "intent": "attack",
    "confidence": 0.95,
    "entities": {"target": "goblin", "weapon": "sword"}
  }
}
```

### Commands

- `/list` - List all characters
- `/stats` - Show storage statistics
- `/get <name>` - Get character sheet
- `/quit` - Exit interactive mode

### Single Input Mode

```bash
npm start -- --json '{"input": "Elara gains 50 gold pieces", "user_character": "Elara"}'
```

## Character Data Model

### Basic Information
- name, race, class, subclass, level
- background, alignment, experience

### Ability Scores
- strength, dexterity, constitution
- intelligence, wisdom, charisma

### Combat Stats
- hitPoints (current, max, temporary)
- armorClass, initiative, speed
- proficiencyBonus

### Inventory
- items (name, quantity, description, equipped, magical, etc.)
- currency (platinum, gold, silver, copper)
- weight tracking

### Appearance
- age, height, weight, eyes, hair, skin, gender
- distinguishingFeatures

### Skills & Proficiencies
- skills, savingThrows
- proficiencies, languages

### Spellcasting
- spells (name, level, school, description)
- spellcastingAbility, spellSaveDC, spellAttackBonus
- spellSlots

### Features & Abilities
- features (name, description, source)

### Status & Conditions
- conditions, exhaustion, inspiration

### Social & Story
- backstory
- personalityTraits, ideals, bonds, flaws
- relationships, allies, enemies, organizations
- notes

## API Response Format

All responses follow this JSON structure:

```typescript
{
  "success": boolean,
  "characterUpdated?": string,
  "changes?": CharacterSheetUpdate,
  "context?": {
    "name": string,
    "relevantInfo": {
      "stats?": { /* ability scores */ },
      "items?": string[],
      "spells?": string[],
      "features?": string[],
      "conditions?": string[],
      "other?": { /* additional info */ }
    }
  },
  "message": string,
  "error?": string,
  "meta_data?": {              // Echoed back from input
    "intent"?: string,
    "confidence"?: number,
    // ... all metadata from input
  }
}
```

## Examples

### Creating a Character

```json
{
  "input": "Create a new character named Elara, she's an elf mage",
  "user_character": "Elara"
}
```

Response:
```json
{
  "success": true,
  "characterUpdated": "Elara",
  "changes": {
    "name": "Elara",
    "race": "elf",
    "class": "mage"
  },
  "message": "Updated character: Elara elf mage"
}
```

### Adding Items

```json
{
  "input": "I find 3 healing potions and a magic shield",
  "user_character": "Thorin"
}
```

Items automatically stack - adding more potions increases quantity.

### Updating Stats

```json
{
  "input": "My strength is 10, dexterity is 16, intelligence is 18",
  "user_character": "Elara"
}
```

### Learning Spells

```json
{
  "input": "I learn the fireball spell",
  "user_character": "Elara"
}
```

### Adding Conditions

```json
{
  "input": "I am poisoned",
  "user_character": "Thorin"
}
```

### Managing Currency

```json
{
  "input": "I receive 100 gold pieces as reward",
  "user_character": "Elara"
}
```

### Integration with IntentInterpreter

When integrated with the IntentInterpreter project, metadata flows through:

```json
{
  "input": "I attack the goblin with my axe",
  "user_character": "Thorin",
  "meta_data": {
    "intent": "attack",
    "confidence": 0.95,
    "entities": {
      "target": "goblin",
      "weapon": "axe"
    }
  }
}
```

Response includes context and echoes metadata:
```json
{
  "success": true,
  "characterUpdated": "Thorin",
  "context": {
    "name": "Thorin",
    "relevantInfo": {
      "stats": {"strength": 16},
      "items": ["battleaxe (equipped)"],
      "other": {"class": "warrior"}
    }
  },
  "message": "Updated character: Thorin Level 5 dwarf warrior",
  "meta_data": {
    "intent": "attack",
    "confidence": 0.95,
    "entities": {
      "target": "goblin",
      "weapon": "axe"
    }
  }
}
```

## Integration with IntentInterpreter

The CharacterController is designed to work seamlessly with the IntentInterpreter project. The workflow:

1. **IntentInterpreter** receives user chat message
2. IntentInterpreter classifies intent and extracts entities
3. **CharacterController** receives:
   - `input`: Original user message
   - `user_character`: Character name (from session/context)
   - `meta_data`: Intent, confidence, entities from IntentInterpreter
4. CharacterController updates character sheet and provides relevant context
5. Response includes character context for action resolution

### Pipeline Example

```
User: "I attack the goblin with my sword"
  ↓
IntentInterpreter:
  {
    "intent": "attack",
    "confidence": 0.95,
    "entities": {"target": "goblin", "weapon": "sword"}
  }
  ↓
CharacterController:
  Input: {
    "input": "I attack the goblin with my sword",
    "user_character": "Thorin",
    "meta_data": { ... }
  }
  ↓
  Output: {
    "success": true,
    "context": {
      "name": "Thorin",
      "relevantInfo": {
        "stats": {"strength": 16},
        "items": ["sword (equipped)"]
      }
    },
    "meta_data": { ... }
  }
```

## Architecture

### Core Components

- **CharacterSheetManager** (`src/character-sheet.ts`)
  - Manages individual character sheets
  - Handles intelligent merging of updates
  - Provides utility methods (ability modifiers, proficiency bonus)

- **CharacterManager** (`src/character-manager.ts`)
  - Main coordinator between storage, AI, and character sheets
  - Manages character cache
  - Processes user input

- **AIParser** (`src/ai-parser.ts`)
  - Extracts character information from natural language
  - Generates contextual responses
  - Detects character references

- **CharacterStorage** (`src/storage.ts`)
  - Persistent JSON file storage
  - Character search and listing
  - Atomic file operations

- **OpenRouterClient** (`src/openrouter-client.ts`)
  - API client for OpenRouter
  - Error handling and retries
  - Configurable model and parameters

### Data Flow

```
User Input (JSON)
    ↓
Character Manager
    ↓
AI Parser → OpenRouter API
    ↓
Extract Updates
    ↓
Character Sheet Manager (merge updates)
    ↓
Storage (save to disk)
    ↓
Response (JSON)
```

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

Test suite includes:
- Character sheet creation and loading
- Field updates and merging
- Item management (add, stack, remove, filter)
- Currency operations
- Condition management
- Utility methods

## Development

```bash
npm run build         # Compile TypeScript
npm run typecheck     # Type checking only
npm run lint          # Run ESLint
npm run format        # Format with Prettier
```

## Project Structure

```
CharacterController/
├── src/
│   ├── types.ts                  # Zod schemas and TypeScript types
│   ├── character-sheet.ts        # Character sheet manager
│   ├── character-manager.ts      # Main coordinator
│   ├── ai-parser.ts              # AI parsing logic
│   ├── storage.ts                # Persistent storage
│   ├── openrouter-client.ts      # API client
│   ├── cli.ts                    # CLI interface
│   └── prompts/
│       └── parser-prompt.ts      # AI system prompts
├── tests/
│   └── character-sheet.test.ts   # Test suite
├── data/
│   └── characters/               # Character storage (auto-created)
└── dist/                         # Compiled output
```

## License

MIT
