# AIController Quick Reference

## Module URLs
```
IntentInterpreter:    http://localhost:3003
CharacterController:  http://localhost:3001
ItemController:       http://localhost:3002
SceneController:      http://localhost:3004
AIController:         http://localhost:3000
Frontend:             http://localhost:5174
```

## Chain JSON Structure
```typescript
{
  name: string;                    // Chain name
  description?: string;            // What it does
  owner: string;                   // User who owns it (default: "admin")
  steps: Step[];                   // Array of steps
  output_template?: object;        // Final output structure
  meta_data?: Record<string, any>; // Optional metadata
}
```

## Step Types

### Module Call (default)
```typescript
{
  id: string;                      // "step_1", "step_2", etc.
  name?: string;                   // Human-readable name
  type?: "module_call";            // Optional, default type
  module: string;                  // Module name
  endpoint: string;                // API endpoint
  method: "GET"|"POST"|"PATCH"|"PUT"|"DELETE";
  params?: object;                 // Query parameters
  body?: object;                   // Request body
  headers?: object;                // Custom headers
  timeout?: number;                // Request timeout (ms)
  conditionalRouting?: RoutingRule[]; // Routing logic
}
```

### Chain Call
```typescript
{
  type: "chain_call";
  id: string;
  name?: string;
  chain_id: number;                // ID of chain to call
  input_mapping: object;           // Map variables to chain input
  conditionalRouting?: RoutingRule[];
}
```

## Routing Rule Structure
```typescript
{
  description?: string;            // What this rule does
  condition: {
    field: string;                 // Field path to check
    operator: string;              // Comparison operator
    value: any;                    // Value to compare against
  };
  action: "jump_to_step"|"jump_to_chain"|"skip_to_end";
  target?: number|string;          // Step index or chain ID
  input_mapping?: object;          // For jump_to_chain
}
```

## Operators
```
equals         - Exact match
not_equals     - Not equal
contains       - String/array contains
greater_than   - Numeric >
less_than      - Numeric <
in_array       - Value in array
exists         - Field exists and truthy
```

## Variable Syntax

### Input Variables
```
{{input.fieldName}}              - From chain input
```

### Step Results
```
{{step_1.result}}                - Entire result
{{step_1.result.field}}          - Specific field
{{step_1.result.nested.field}}   - Nested field
{{step_1.result.array[0]}}       - Array element
{{step_1.result.array[0].field}} - Nested array
```

### Environment Variables
```
{{env.VARIABLE_NAME}}            - Environment variable
```

### Special Cases
```
"field": "{{step_1.result}}"     - ✅ Entire object/array
"field": {{step_1.result}}       - ❌ Invalid JSON
```

## Intent Structure
```typescript
{
  rawMessage: string;
  intents: [{
    intent: IntentType;
    confidence: number;            // 0.0 - 1.0
    reasoning: string;
    metadata?: {
      target?: string;
      weapon?: string;
      item?: string;
      location?: string;
      spell?: string;
      npc?: string;
      direction?: string;
      [key: string]: any;
    }
  }];
  timestamp: string;
  processingTimeMs: number;
  model: string;
}
```

## Intent Types
```
attack, defend, movement, investigation, emote,
dialogue, creation, item_use, trade, magic,
stealth, rest, interaction, social, gather,
learn, system_command, user_action, unknown
```

## Common Patterns

### Get Intent
```json
{
  "module": "IntentInterpreter",
  "endpoint": "/interpret",
  "method": "POST",
  "body": {
    "message": "{{input.message}}",
    "userId": "{{input.userId}}"
  }
}
```

### Get Character
```json
{
  "module": "CharacterController",
  "endpoint": "/characters/{{input.characterId}}",
  "method": "GET"
}
```

### List Items
```json
{
  "module": "ItemController",
  "endpoint": "/items",
  "method": "GET",
  "params": {"characterId": "{{input.characterId}}"}
}
```

### Route by Intent
```json
{
  "conditionalRouting": [{
    "condition": {
      "field": "intents[0].intent",
      "operator": "equals",
      "value": "attack"
    },
    "action": "jump_to_chain",
    "target": 5
  }]
}
```

## HTTP Methods Usage

```
GET    - Retrieve data
POST   - Create new resource
PATCH  - Update existing resource (partial)
PUT    - Replace entire resource
DELETE - Remove resource
```

## Common Input Fields
```json
{
  "userId": "admin",              // Required for most ops
  "characterId": "char_123",      // For character ops
  "sceneId": "scene_456",         // For scene ops
  "message": "I attack",          // For intent ops
  "itemId": "item_789"            // For item ops
}
```

## Output Template Examples

### Simple
```json
{
  "intent": "{{step_1.result.intents[0].intent}}",
  "data": "{{step_2.result}}"
}
```

### Structured
```json
{
  "success": true,
  "player": {
    "character": "{{step_1.result}}",
    "inventory": "{{step_2.result}}"
  },
  "intent": "{{step_3.result.intents[0]}}"
}
```

## Error Handling

Chains stop on first error. Each step result includes:
```typescript
{
  success: boolean;
  error?: string;
  step_id: string;
  response?: any;
}
```

## Testing

1. Open UI: http://localhost:5174
2. Create/load chain
3. Click "Test Chain"
4. Provide input JSON
5. View execution results

## API Endpoints

### Chains
```
GET    /chains              - List all chains
POST   /chains              - Create chain
GET    /chains/:id          - Get chain
PUT    /chains/:id          - Update chain
DELETE /chains/:id          - Delete chain
POST   /chains/execute      - Execute chain
```

### Modules
```
GET    /modules             - List modules
GET    /modules/:name/spec  - Get module spec
```

## Common Mistakes

❌ `"data": {{step_1.result}}`
✅ `"data": "{{step_1.result}}"`

❌ `{{step1.result}}`
✅ `{{step_1.result}}`

❌ `"condition": {"field": "step_1.result"}`
✅ `"condition": {"field": "intents[0].intent"}`

❌ Routing target: `"step_2"`
✅ Routing target: `1` (index number)

## Keyboard Shortcuts (UI)

```
Ctrl+S  - Save chain
Ctrl+T  - Test chain
Ctrl+Z  - Undo (in JSON editor)
Ctrl+Y  - Redo (in JSON editor)
Esc     - Close modal
Tab     - Indent (in JSON editor)
```

## File Structure
```
AIController/
├── src/                    # Backend source
├── frontend/               # Vue frontend
├── db/                     # Database schemas
├── .env                    # Environment config
├── AI_AGENT_GUIDE.md      # Comprehensive AI guide
├── CHAIN_PATTERNS.md      # Copy-paste patterns
└── QUICK_REFERENCE.md     # This file
```

## Environment Variables
```bash
PORT=3000                          # AIController port
INTENT_INTERPRETER_URL=http://localhost:3003
CHARACTER_CONTROLLER_URL=http://localhost:3001
ITEM_CONTROLLER_URL=http://localhost:3002
SCENE_CONTROLLER_URL=http://localhost:3004
```

## Module Endpoints Summary

### IntentInterpreter (3003)
- POST /interpret

### CharacterController (3001)
- GET /characters
- POST /characters
- GET /characters/:id
- PATCH /characters/:id
- DELETE /characters/:id

### ItemController (3002)
- GET /items
- POST /items
- GET /items/:id
- PATCH /items/:id
- DELETE /items/:id

### SceneController (3004)
- GET /scenes
- POST /scenes
- GET /scenes/:id
- PATCH /scenes/:id
- DELETE /scenes/:id
