# AI Agent Guide to AIController Chain Building

This guide is designed for AI agents to understand and build chains in the AIController system through natural language instructions.

## System Overview

The AIController is a chain execution engine that orchestrates calls between multiple game modules:
- **IntentInterpreter** - Interprets player messages and classifies intents
- **CharacterController** - Manages game characters
- **ItemController** - Manages items and inventory
- **SceneController** - Manages scenes and locations

Chains allow you to compose complex workflows by calling these modules in sequence, passing data between steps, and implementing conditional logic.

---

## Core Concepts

### 1. Chain Structure

A chain consists of:
```json
{
  "name": "Chain Name",
  "description": "What this chain does",
  "owner": "admin",
  "steps": [/* array of steps */],
  "output_template": {/* final output structure */}
}
```

### 2. Step Types

**Module Call Step** (most common):
```json
{
  "id": "step_1",
  "name": "Get User Intent",
  "module": "IntentInterpreter",
  "endpoint": "/interpret",
  "method": "POST",
  "params": {},
  "body": {
    "message": "{{input.message}}",
    "userId": "{{input.userId}}"
  }
}
```

**Chain Call Step** (call another chain):
```json
{
  "type": "chain_call",
  "id": "step_2",
  "name": "Process Admin Request",
  "chain_id": 5,
  "input_mapping": {
    "userId": "{{input.userId}}",
    "data": "{{step_1.result}}"
  }
}
```

### 3. Variable Resolution

**Template Syntax**: `{{path.to.value}}`

**Available Variables**:
- `{{input.fieldName}}` - From chain input
- `{{step_N.response.field}}` - From previous step's response
- `{{step_N.result.field}}` - Alias for response
- `{{env.VARIABLE_NAME}}` - Environment variables

**Important**: For arrays/objects, use quoted template variables:
```json
{
  "intents": "{{step_1.result.intents}}"  // ✅ Correct - backend converts to actual array
}
```

NOT:
```json
{
  "intents": {{step_1.result.intents}}  // ❌ Invalid JSON
}
```

---

## Available Modules and Endpoints

### IntentInterpreter

**Base URL**: `http://localhost:3003`

**POST /interpret**
- **Purpose**: Classify user intent from natural language
- **Request Body**:
  ```json
  {
    "message": "I attack the goblin with my sword",
    "userId": "user123"
  }
  ```
- **Response**:
  ```json
  {
    "rawMessage": "I attack the goblin with my sword",
    "intents": [
      {
        "intent": "attack",
        "confidence": 0.98,
        "reasoning": "Explicit combat action",
        "metadata": {
          "target": "goblin",
          "weapon": "sword"
        }
      }
    ],
    "timestamp": "2025-10-31T...",
    "processingTimeMs": 1250,
    "model": "xai/grok-2-1212"
  }
  ```

**Intent Types**: attack, defend, movement, investigation, emote, dialogue, creation, item_use, trade, magic, stealth, rest, interaction, social, gather, learn, system_command, user_action, unknown

---

### CharacterController

**Base URL**: `http://localhost:3001`

**GET /characters**
- **Purpose**: List all characters
- **Query Params**: `userId` (optional)
- **Response**: Array of character objects

**POST /characters**
- **Purpose**: Create a new character
- **Request Body**:
  ```json
  {
    "name": "Aragorn",
    "userId": "user123",
    "class": "warrior",
    "level": 1,
    "attributes": {...}
  }
  ```

**GET /characters/:id**
- **Purpose**: Get character by ID
- **Response**: Single character object

**PATCH /characters/:id**
- **Purpose**: Update character
- **Request Body**: Partial character object

**DELETE /characters/:id**
- **Purpose**: Delete character

---

### ItemController

**Base URL**: `http://localhost:3002`

**GET /items**
- **Purpose**: List all items
- **Query Params**: `userId`, `characterId`, `type`

**POST /items**
- **Purpose**: Create new item
- **Request Body**:
  ```json
  {
    "name": "Sword of Power",
    "type": "weapon",
    "ownerId": "char123",
    "attributes": {
      "damage": 10,
      "durability": 100
    }
  }
  ```

**GET /items/:id**
**PATCH /items/:id**
**DELETE /items/:id**

---

### SceneController

**Base URL**: `http://localhost:3004`

**GET /scenes**
- **Purpose**: List all scenes
- **Query Params**: `userId`, `name`

**POST /scenes**
- **Purpose**: Create new scene
- **Request Body**:
  ```json
  {
    "name": "Dark Forest",
    "description": "A mysterious forest",
    "userId": "user123",
    "data": {
      "npcs": [],
      "items": [],
      "exits": ["north", "south"]
    }
  }
  ```

**GET /scenes/:id**
**PATCH /scenes/:id**
**DELETE /scenes/:id**

---

## Common Chain Patterns

### Pattern 1: Intent → Action
Interpret user message, then execute action based on intent.

```json
{
  "name": "Process Player Action",
  "steps": [
    {
      "id": "step_1",
      "name": "Interpret Intent",
      "module": "IntentInterpreter",
      "endpoint": "/interpret",
      "method": "POST",
      "body": {
        "message": "{{input.message}}",
        "userId": "{{input.userId}}"
      }
    },
    {
      "id": "step_2",
      "name": "Get Character",
      "module": "CharacterController",
      "endpoint": "/characters/{{input.characterId}}",
      "method": "GET"
    }
  ],
  "output_template": {
    "intent": "{{step_1.result.intents[0].intent}}",
    "character": "{{step_2.result}}",
    "metadata": "{{step_1.result.intents[0].metadata}}"
  }
}
```

### Pattern 2: Conditional Routing
Route to different steps based on conditions.

```json
{
  "id": "step_1",
  "name": "Check User Role",
  "module": "CharacterController",
  "endpoint": "/characters/{{input.characterId}}",
  "method": "GET",
  "conditionalRouting": [
    {
      "description": "Admin users go to admin chain",
      "condition": {
        "field": "role",
        "operator": "equals",
        "value": "admin"
      },
      "action": "jump_to_chain",
      "target": 5,
      "input_mapping": {
        "userId": "{{input.userId}}"
      }
    },
    {
      "description": "Combat intent goes to combat handler",
      "condition": {
        "field": "{{step_1.result.intents[0].intent}}",
        "operator": "equals",
        "value": "attack"
      },
      "action": "jump_to_step",
      "target": 3
    }
  ]
}
```

### Pattern 3: Data Aggregation
Gather data from multiple sources and combine.

```json
{
  "name": "Get Game State",
  "steps": [
    {
      "id": "step_1",
      "name": "Get Character",
      "module": "CharacterController",
      "endpoint": "/characters/{{input.characterId}}",
      "method": "GET"
    },
    {
      "id": "step_2",
      "name": "Get Character Items",
      "module": "ItemController",
      "endpoint": "/items",
      "method": "GET",
      "params": {
        "characterId": "{{input.characterId}}"
      }
    },
    {
      "id": "step_3",
      "name": "Get Current Scene",
      "module": "SceneController",
      "endpoint": "/scenes/{{input.sceneId}}",
      "method": "GET"
    }
  ],
  "output_template": {
    "character": "{{step_1.result}}",
    "inventory": "{{step_2.result}}",
    "scene": "{{step_3.result}}"
  }
}
```

### Pattern 4: Intent-Based Metadata Passing
Pass intent metadata to subsequent steps.

```json
{
  "name": "Execute Combat Action",
  "steps": [
    {
      "id": "step_1",
      "name": "Interpret Combat Intent",
      "module": "IntentInterpreter",
      "endpoint": "/interpret",
      "method": "POST",
      "body": {
        "message": "{{input.message}}",
        "userId": "{{input.userId}}"
      }
    },
    {
      "id": "step_2",
      "name": "Execute Attack",
      "module": "CharacterController",
      "endpoint": "/characters/{{input.characterId}}/attack",
      "method": "POST",
      "body": {
        "target": "{{step_1.result.intents[0].metadata.target}}",
        "weapon": "{{step_1.result.intents[0].metadata.weapon}}",
        "intent_data": "{{step_1.result.intents[0]}}"
      }
    }
  ]
}
```

---

## Routing and Logic Jumps

### Routing Operators

- `equals` - Exact match
- `not_equals` - Not equal
- `contains` - String/array contains value
- `greater_than` - Numeric >
- `less_than` - Numeric <
- `in_array` - Value in array
- `exists` - Field exists and is truthy

### Routing Actions

**jump_to_step** - Jump to another step by index:
```json
{
  "action": "jump_to_step",
  "target": 5  // Step index (0-based)
}
```

**jump_to_chain** - Call another chain:
```json
{
  "action": "jump_to_chain",
  "target": 3,  // Chain ID
  "input_mapping": {
    "userId": "{{input.userId}}",
    "data": "{{step_1.result}}"
  }
}
```

**skip_to_end** - Skip remaining steps:
```json
{
  "action": "skip_to_end"
}
```

---

## Building Chains from Natural Language

### Example Prompts and Resulting Chains

**Prompt**: "Create a chain that interprets a player's message and gets their character"

**Chain**:
```json
{
  "name": "Interpret and Get Character",
  "description": "Interprets player message and retrieves character data",
  "owner": "admin",
  "steps": [
    {
      "id": "step_1",
      "name": "Interpret Message",
      "module": "IntentInterpreter",
      "endpoint": "/interpret",
      "method": "POST",
      "body": {
        "message": "{{input.message}}",
        "userId": "{{input.userId}}"
      }
    },
    {
      "id": "step_2",
      "name": "Get Character",
      "module": "CharacterController",
      "endpoint": "/characters/{{input.characterId}}",
      "method": "GET"
    }
  ],
  "output_template": {
    "intent": "{{step_1.result.intents[0]}}",
    "character": "{{step_2.result}}"
  }
}
```

---

**Prompt**: "When a player says something, classify the intent. If it's an attack intent, route to a combat chain. Otherwise, just return the intent."

**Chain**:
```json
{
  "name": "Intent Router",
  "description": "Routes attack intents to combat chain",
  "owner": "admin",
  "steps": [
    {
      "id": "step_1",
      "name": "Classify Intent",
      "module": "IntentInterpreter",
      "endpoint": "/interpret",
      "method": "POST",
      "body": {
        "message": "{{input.message}}",
        "userId": "{{input.userId}}"
      },
      "conditionalRouting": [
        {
          "description": "Attack intents go to combat chain",
          "condition": {
            "field": "intents[0].intent",
            "operator": "equals",
            "value": "attack"
          },
          "action": "jump_to_chain",
          "target": 10,
          "input_mapping": {
            "userId": "{{input.userId}}",
            "characterId": "{{input.characterId}}",
            "intent": "{{step_1.result.intents[0]}}"
          }
        }
      ]
    }
  ],
  "output_template": {
    "intent": "{{step_1.result.intents[0]}}"
  }
}
```

---

**Prompt**: "Get all items for a character, then update the character's inventory field"

**Chain**:
```json
{
  "name": "Update Character Inventory",
  "description": "Fetches character items and updates character record",
  "owner": "admin",
  "steps": [
    {
      "id": "step_1",
      "name": "Get Items",
      "module": "ItemController",
      "endpoint": "/items",
      "method": "GET",
      "params": {
        "characterId": "{{input.characterId}}"
      }
    },
    {
      "id": "step_2",
      "name": "Update Character",
      "module": "CharacterController",
      "endpoint": "/characters/{{input.characterId}}",
      "method": "PATCH",
      "body": {
        "inventory": "{{step_1.result}}"
      }
    }
  ],
  "output_template": {
    "character": "{{step_2.result}}",
    "itemCount": "{{step_1.result.length}}"
  }
}
```

---

## Input Requirements

Chains expect input in JSON format. Common input fields:

```json
{
  "userId": "admin",           // Required for most operations
  "characterId": "char_123",   // For character operations
  "sceneId": "scene_456",      // For scene operations
  "message": "I attack...",    // For intent interpretation
  "itemId": "item_789"         // For item operations
}
```

---

## Best Practices for AI Agents

### 1. Always Use Descriptive Names
```json
{
  "name": "Process Combat Action",  // ✅ Clear
  "name": "Chain 1"                  // ❌ Unclear
}
```

### 2. Include Step Names
```json
{
  "id": "step_1",
  "name": "Interpret User Intent",  // ✅ Helps debugging
}
```

### 3. Quote Template Variables for Objects/Arrays
```json
{
  "intents": "{{step_1.result.intents}}"  // ✅ Will be converted to actual array
}
```

### 4. Use Conditional Routing for Branching Logic
Instead of creating separate chains, use routing rules when possible.

### 5. Structure Output Templates Clearly
```json
{
  "output_template": {
    "success": true,
    "intent": "{{step_1.result.intents[0]}}",
    "character": "{{step_2.result}}",
    "timestamp": "{{step_1.result.timestamp}}"
  }
}
```

### 6. Handle Intent Metadata
Intent metadata is dynamic. Common fields:
- `target` - Who/what is being acted upon
- `weapon` - Weapon being used
- `item` - Item being referenced
- `location` - Location mentioned
- `spell` - Spell/ability name

Access with: `{{step_N.result.intents[0].metadata.target}}`

---

## Testing Chains

Use the AIController UI at `http://localhost:5174`:
1. Build your chain in the Chain Builder
2. Click "Test Chain"
3. Provide input JSON
4. View step-by-step execution results
5. Inspect variable values at each step

---

## Quick Reference

### Step Structure
```json
{
  "id": "step_N",
  "name": "Step Name",
  "module": "ModuleName",
  "endpoint": "/path",
  "method": "GET|POST|PATCH|DELETE",
  "params": {},      // Query parameters
  "body": {},        // Request body (POST/PATCH/PUT)
  "headers": {},     // Custom headers
  "conditionalRouting": []  // Routing rules
}
```

### Variable Syntax
- Input: `{{input.field}}`
- Previous step: `{{step_N.result.field}}`
- Array index: `{{step_N.result.items[0]}}`
- Nested: `{{step_N.result.user.profile.name}}`
- Environment: `{{env.API_KEY}}`

### Condition Structure
```json
{
  "field": "fieldName",
  "operator": "equals|not_equals|contains|greater_than|less_than|in_array|exists",
  "value": "comparisonValue"
}
```

---

## Summary for AI Agents

When a user asks you to create a chain:

1. **Identify the goal** - What should the chain accomplish?
2. **Determine required modules** - Which modules need to be called?
3. **Plan the sequence** - What order should steps execute?
4. **Map data flow** - What variables pass between steps?
5. **Add routing logic** - Are there conditional branches?
6. **Structure output** - What should the final output contain?
7. **Generate JSON** - Build the chain configuration
8. **Validate** - Ensure all variables are properly referenced

Use this guide as your reference for understanding the system architecture, available modules, and how to translate natural language requests into working chain configurations.
