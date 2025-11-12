# IntentInterpreter Integration Guide

This guide explains how to integrate CharacterController with the IntentInterpreter project.

## Overview

The two systems work together to create a complete RPG chat interface:

1. **IntentInterpreter**: Classifies user intent and extracts entities
2. **CharacterController**: Manages character state and provides context

## Data Flow

```
User Message
    ↓
IntentInterpreter
    ↓
{intent, confidence, entities}
    ↓
CharacterController
    ↓
{character updates, relevant context}
    ↓
Game Engine / Response Generator
```

## Input Format

CharacterController expects this JSON structure:

```typescript
interface CLIInput {
  input: string;              // Original user message
  user_character?: string;    // Character name from session
  meta_data?: {
    intent?: string;          // From IntentInterpreter
    confidence?: number;      // AI confidence score
    entities?: any;           // Extracted entities
    [key: string]: any;       // Additional metadata
  };
}
```

## Output Format

CharacterController returns:

```typescript
interface CLIResponse {
  success: boolean;
  characterUpdated?: string;     // Which character was updated
  changes?: CharacterSheetUpdate; // What changed
  context?: {                    // Relevant character info for this action
    name: string;
    relevantInfo: {
      stats?: {...};
      items?: string[];
      spells?: string[];
      features?: string[];
      conditions?: string[];
      other?: {...};
    };
  };
  message: string;
  error?: string;
  meta_data?: any;               // Echoed back from input
}
```

## Example Integration

### Node.js/TypeScript

```typescript
import { IntentInterpreter } from '../IntentInterpreter/src/interpreter';
import { CharacterManager } from './src/character-manager';

// Initialize both systems
const intentInterpreter = new IntentInterpreter(openRouterClient);
const characterManager = new CharacterManager(openRouterClient);

// Process user input
async function handleUserInput(
  userMessage: string,
  characterName: string
): Promise<Response> {
  // Step 1: Classify intent
  const intentResult = await intentInterpreter.interpret(userMessage);

  // Step 2: Update character state
  const characterResult = await characterManager.processInput({
    input: userMessage,
    user_character: characterName,
    meta_data: {
      intent: intentResult.primaryIntent.type,
      confidence: intentResult.primaryIntent.confidence,
      entities: intentResult.entities,
      allIntents: intentResult.intents,
    },
  });

  // Step 3: Use results to generate response
  return {
    intent: intentResult.primaryIntent.type,
    characterContext: characterResult.context,
    characterUpdates: characterResult.changes,
    metadata: {
      intentConfidence: intentResult.primaryIntent.confidence,
      characterUpdated: characterResult.characterUpdated,
    },
  };
}

// Usage
const result = await handleUserInput(
  "I attack the goblin with my sword",
  "Thorin"
);

console.log(result);
// {
//   intent: "attack",
//   characterContext: {
//     name: "Thorin",
//     relevantInfo: {
//       stats: { strength: 16 },
//       items: ["sword (equipped)"]
//     }
//   },
//   metadata: {
//     intentConfidence: 0.95,
//     characterUpdated: "Thorin"
//   }
// }
```

### Command Line Pipeline

```bash
# Step 1: Get intent from IntentInterpreter
INTENT_OUTPUT=$(echo '{"input": "I attack the goblin"}' | \
  node IntentInterpreter/dist/index.js --json -)

# Step 2: Extract intent and pass to CharacterController
echo "{
  \"input\": \"I attack the goblin\",
  \"user_character\": \"Thorin\",
  \"meta_data\": $INTENT_OUTPUT
}" | node CharacterController/dist/cli.js --json -
```

### HTTP API Integration

If you wrap both in HTTP APIs:

```typescript
// Pseudo-code for combined endpoint
app.post('/api/game/action', async (req, res) => {
  const { message, character } = req.body;

  // Call IntentInterpreter API
  const intentResponse = await fetch('http://localhost:3001/interpret', {
    method: 'POST',
    body: JSON.stringify({ input: message }),
  });
  const intentData = await intentResponse.json();

  // Call CharacterController API
  const characterResponse = await fetch('http://localhost:3002/process', {
    method: 'POST',
    body: JSON.stringify({
      input: message,
      user_character: character,
      meta_data: intentData,
    }),
  });
  const characterData = await characterResponse.json();

  // Combine and return
  res.json({
    intent: intentData.primaryIntent,
    character: characterData.context,
    updates: characterData.changes,
  });
});
```

## Intent Type Mapping

Map IntentInterpreter output to character actions:

| Intent Type | Character Action | Example |
|-------------|-----------------|---------|
| `attack` | Look up equipped weapons, attack stats | "Thorin attacks with sword (+3 STR)" |
| `cast_spell` | Check spell list, spell slots | "Elara casts Fireball (3rd level)" |
| `movement` | Update position, check speed | "Character moves 30ft north" |
| `inventory_check` | Return inventory items | "You have: sword, 3 potions, 50 gold" |
| `rest` | Restore HP, spell slots | "HP restored, spell slots recovered" |
| `equip_item` | Update equipped items | "Sword equipped in main hand" |
| `social_interaction` | Check charisma, proficiencies | "Persuasion check with +5 CHA" |

## Metadata Usage

### From IntentInterpreter to CharacterController

The `meta_data` field allows rich context:

```json
{
  "input": "I cast fireball at the goblins",
  "user_character": "Elara",
  "meta_data": {
    "intent": "cast_spell",
    "confidence": 0.94,
    "entities": {
      "spell": "fireball",
      "target": "goblins"
    },
    "allIntents": [
      {"type": "cast_spell", "confidence": 0.94},
      {"type": "attack", "confidence": 0.23}
    ]
  }
}
```

CharacterController can use this to:
- Verify the character knows the spell
- Check if spell slots available
- Return spell details and casting stats
- Update character state (spell slot consumed)

### Response with Context

```json
{
  "success": true,
  "characterUpdated": "Elara",
  "context": {
    "name": "Elara",
    "relevantInfo": {
      "spells": ["fireball (level 3)"],
      "stats": {"intelligence": 18},
      "other": {
        "spellSlots": {"level3": {"current": 2, "max": 3}},
        "spellSaveDC": 15
      }
    }
  },
  "changes": {
    "spellSlots": {"level3": {"current": 2}}
  },
  "meta_data": {
    "intent": "cast_spell",
    "confidence": 0.94,
    "entities": {"spell": "fireball", "target": "goblins"}
  }
}
```

## Best Practices

1. **Always include user_character**: While the AI can detect character names, explicitly providing it is more reliable

2. **Pass all intent data**: Include confidence scores and alternative intents for better decision making

3. **Use the context**: The character context in the response is specifically filtered for the action being performed

4. **Handle errors gracefully**: Check `success` field and provide fallback behavior

5. **Cache character data**: CharacterController uses internal caching, but you may want to cache responses at the application level

6. **Validate inputs**: Sanitize user input before passing to either system

7. **Log metadata flow**: Track how metadata flows through the pipeline for debugging

## Testing Integration

```typescript
describe('IntentInterpreter + CharacterController', () => {
  it('should handle attack action', async () => {
    // Get intent
    const intent = await intentInterpreter.interpret("I attack the goblin");

    // Process with character
    const result = await characterManager.processInput({
      input: "I attack the goblin",
      user_character: "Thorin",
      meta_data: {
        intent: intent.primaryIntent.type,
        confidence: intent.primaryIntent.confidence,
      },
    });

    // Verify
    expect(result.success).toBe(true);
    expect(result.context?.relevantInfo.items).toContain('sword');
    expect(result.meta_data?.intent).toBe('attack');
  });
});
```

## Troubleshooting

### Character not found
- Ensure `user_character` matches an existing character name exactly
- Character names are case-sensitive

### Missing context
- Context is only provided when a character is mentioned or `user_character` is set
- Check that the character has relevant data (items, stats, etc.)

### Metadata not echoed
- Verify the input `meta_data` is valid JSON
- Check for serialization issues with nested objects

### Intent mismatch
- IntentInterpreter and CharacterController use different AI prompts
- They may interpret the same message differently
- Use `user_character` to ensure consistent character identification
