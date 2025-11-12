# AIController Design Document

## Overview

The AIController is a meta-controller that orchestrates chained requests across all Ex Nihilo modules (IntentInterpreter, CharacterController, SceneController, ItemController, StoryTeller) to build structured, contextualized prompts and complex workflows.

## Architecture

### Backend (Node.js + Express - Port 3035)

**Components:**
- **Chain Manager**: CRUD operations for chain configurations
- **Execution Engine**: Executes chains with data flow and variable substitution
- **MySQL Storage**: Persist chain configurations
- **Module Clients**: HTTP clients for all 4 modules

**Tech Stack:**
- TypeScript + ES Modules
- Express.js
- MySQL2
- Zod for validation
- Axios for HTTP requests

### Frontend (Vue 3 + TypeScript)

**Components:**
- **Chain Builder**: Visual interface for creating chains
- **Module Selector**: Choose from 5 available modules
- **Request Configurator**: Forms for each module's API endpoints
- **Data Mapper**: Map response data to subsequent request parameters
- **Execution Panel**: Run chains and view results
- **Chain Library**: Save/load/manage chain configurations

**Tech Stack:**
- Vue 3 with Composition API
- TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Pinia for state management

## Data Models

### Chain Configuration

```typescript
interface ChainConfiguration {
  id?: number;
  user_id: string;
  name: string;
  description?: string;
  steps: ChainStep[];
  created_at?: string;
  updated_at?: string;
}

interface ChainStep {
  id: string;                    // Unique step ID (e.g., "step_1")
  module: 'intent' | 'character' | 'scene' | 'item' | 'storyteller';
  endpoint: string;              // API endpoint (e.g., "/interpret", "/process")
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  params?: Record<string, any>;  // Query parameters
  body?: Record<string, any>;    // Request body
  headers?: Record<string, string>;
  condition?: StepCondition;     // Optional conditional execution
  parallel?: boolean;            // Execute in parallel with next step
}

interface StepCondition {
  enabled: boolean;
  sourceStep: string;            // Step ID to check
  field: string;                 // JSON path (e.g., "result.success")
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'exists';
  value: any;                    // Value to compare
}
```

### Variable Substitution

Steps can reference previous step responses using template syntax:

```typescript
// Example: Use intent from step 1 in step 2
{
  "step_1": {
    "module": "intent",
    "endpoint": "/interpret",
    "body": { "message": "I attack the goblin" }
  },
  "step_2": {
    "module": "character",
    "endpoint": "/process",
    "body": {
      "input": "{{input.message}}",           // Original input
      "user_character": "Thorin",
      "meta_data": {
        "intent": "{{step_1.result.primaryIntent.type}}"  // From step 1 response
      }
    }
  }
}
```

**Supported References:**
- `{{input.field}}` - Original execution input
- `{{step_X.path.to.field}}` - Response from step X
- `{{env.VARIABLE}}` - Environment variable
- `{{context.user_id}}` - Execution context

## API Endpoints

### Chain Management

```
POST   /chain              - Create new chain configuration
GET    /chain/:id          - Get chain by ID
GET    /chains/:userId     - List user's chains
PATCH  /chain/:id          - Update chain
DELETE /chain/:id          - Delete chain
```

### Chain Execution

```
POST   /execute/:chainId   - Execute saved chain
POST   /execute            - Execute ad-hoc chain (no save)
GET    /execution/:id      - Get execution results
GET    /executions/:userId - List user's execution history
```

### Module Metadata

```
GET    /modules            - List available modules and endpoints
GET    /modules/:name      - Get module schema and available endpoints
```

### Health & Stats

```
GET    /health            - Health check
GET    /stats             - Execution statistics
```

## Execution Flow

1. **Parse Chain**: Load configuration and validate structure
2. **Prepare Steps**: Build execution graph (handle parallel steps)
3. **Execute Steps**:
   - For each step (in order or parallel):
     - Resolve variables from previous responses
     - Check conditions (skip if not met)
     - Build HTTP request
     - Execute request to target module
     - Store response for next steps
4. **Return Results**: Complete execution history with all responses

## Variable Resolution Algorithm

```typescript
function resolveVariables(template: any, context: ExecutionContext): any {
  if (typeof template === 'string') {
    // Replace {{variable}} patterns
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      return getValueByPath(context, path);
    });
  }
  if (typeof template === 'object') {
    // Recursively resolve object properties
    const resolved = {};
    for (const [key, value] of Object.entries(template)) {
      resolved[key] = resolveVariables(value, context);
    }
    return resolved;
  }
  return template;
}
```

## Frontend Architecture

### Vue Components

```
src/
├── App.vue                     # Root component
├── views/
│   ├── ChainBuilder.vue        # Main chain builder interface
│   ├── ChainLibrary.vue        # Saved chains list
│   ├── ExecutionView.vue       # Chain execution and results
│   └── ModuleExplorer.vue      # Browse module APIs
├── components/
│   ├── chain/
│   │   ├── StepCard.vue        # Individual step configuration
│   │   ├── StepList.vue        # List of steps
│   │   ├── ModuleSelector.vue  # Select module dropdown
│   │   ├── EndpointSelector.vue # Select endpoint dropdown
│   │   └── DataMapper.vue      # Map response → request fields
│   ├── common/
│   │   ├── CodeEditor.vue      # JSON editor
│   │   ├── ResponseViewer.vue  # Display API responses
│   │   └── VariableHelper.vue  # Variable reference helper
│   └── layout/
│       ├── Navbar.vue          # Navigation
│       └── Sidebar.vue         # Module list sidebar
├── stores/
│   ├── chainStore.ts           # Pinia store for chains
│   ├── executionStore.ts       # Execution history store
│   └── moduleStore.ts          # Module metadata store
├── services/
│   ├── api.ts                  # API client
│   └── chainService.ts         # Chain operations
├── types/
│   └── index.ts                # TypeScript types
└── router/
    └── index.ts                # Vue Router config
```

### Chain Builder UX

**Step-by-Step Flow:**

1. **Create New Chain**
   - Enter name and description
   - Choose starting module

2. **Configure Step**
   - Select module (Intent/Character/Scene/Item/StoryTeller)
   - Select endpoint from dropdown
   - Configure request:
     - Query parameters (GET)
     - Request body (POST/PATCH)
     - Headers (if needed)

3. **Map Data**
   - View previous step responses
   - Click "Use Variable" to insert `{{step_X.field}}`
   - Auto-suggest available fields

4. **Add Conditions** (optional)
   - Set condition for step execution
   - Choose source step, field, operator, value

5. **Add Next Step**
   - Repeat process
   - Mark as parallel if needed

6. **Test & Save**
   - Execute chain with test input
   - View results for each step
   - Save configuration

## Example Chain: Full Character Context

```json
{
  "name": "Get Full Character Context",
  "description": "Gets character with location, nearby entities, and inventory",
  "steps": [
    {
      "id": "step_1",
      "module": "character",
      "endpoint": "/character/:userId/:name",
      "method": "GET",
      "params": {
        "userId": "{{input.userId}}",
        "name": "{{input.characterName}}"
      }
    },
    {
      "id": "step_2",
      "module": "scene",
      "endpoint": "/position/:entityId",
      "method": "GET",
      "params": {
        "entityId": "char_{{input.characterName}}",
        "type": "player_character"
      }
    },
    {
      "id": "step_3",
      "module": "scene",
      "endpoint": "/nearby",
      "method": "GET",
      "params": {
        "x": "{{step_2.position.x_coord}}",
        "y": "{{step_2.position.y_coord}}",
        "radius": 50,
        "type": "location"
      }
    },
    {
      "id": "step_4",
      "module": "item",
      "endpoint": "/inventory/:characterId",
      "method": "GET",
      "params": {
        "characterId": "char_{{input.characterName}}"
      },
      "parallel": true
    }
  ]
}
```

## Example Chain: Process User Message

```json
{
  "name": "Process User Message",
  "description": "Interprets intent, processes character action, updates location",
  "steps": [
    {
      "id": "step_1",
      "module": "intent",
      "endpoint": "/interpret",
      "method": "POST",
      "body": {
        "message": "{{input.message}}"
      }
    },
    {
      "id": "step_2",
      "module": "character",
      "endpoint": "/process",
      "method": "POST",
      "body": {
        "user_id": "{{input.userId}}",
        "user_character": "{{input.characterName}}",
        "input": "{{input.message}}",
        "meta_data": {
          "intent": "{{step_1.result.primaryIntent.type}}",
          "confidence": "{{step_1.result.primaryIntent.confidence}}",
          "entities": "{{step_1.result.entities}}"
        }
      }
    },
    {
      "id": "step_3",
      "module": "scene",
      "endpoint": "/move",
      "method": "POST",
      "body": {
        "entity_id": "char_{{input.characterName}}",
        "entity_type": "player_character",
        "x": "{{step_2.context.location.position.x_coord}}",
        "y": "{{step_2.context.location.position.y_coord}}",
        "movement_type": "walk"
      },
      "condition": {
        "enabled": true,
        "sourceStep": "step_1",
        "field": "result.primaryIntent.type",
        "operator": "equals",
        "value": "movement"
      }
    }
  ]
}
```

## Security Considerations

1. **Authentication**: User-scoped access to chains
2. **Validation**: Zod schema validation on all inputs
3. **Rate Limiting**: Prevent execution abuse
4. **Injection Prevention**: Sanitize variable substitution
5. **CORS**: Restrict frontend origins

## Performance Optimizations

1. **Parallel Execution**: Steps marked as parallel execute concurrently
2. **Response Caching**: Cache module responses (optional)
3. **Connection Pooling**: Reuse HTTP connections
4. **Lazy Loading**: Load Vue components on demand

## Future Enhancements

- **Chain Templates**: Pre-built chains for common workflows
- **Branching Logic**: Multiple paths based on conditions
- **Error Handling**: Retry logic and fallback steps
- **Webhooks**: Trigger chains from external events
- **Visualization**: Flowchart view of chain execution
- **Testing Suite**: Mock responses for chain testing
- **Import/Export**: Share chains as JSON files
- **Version Control**: Track chain changes over time
