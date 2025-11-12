# AIController

Meta-controller for orchestrating chained requests across Ex Nihilo modules to build structured, contextualized prompts and complex workflows.

## 🤖 AI Agent - Build Chains with Natural Language

**NEW!** AIController now includes a conversational AI agent that can create, modify, and evolve chains through natural language!

### Quick Start
1. Add API key to `.env`: `OPENROUTER_API_KEY=your_key_here`
2. Click **🤖 AI Agent** in the navigation
3. Ask: "Create a chain that interprets player intent and gets their character"
4. The AI builds and deploys the chain for you!

**[📖 Full AI Agent Setup Guide](./AI_AGENT_README.md)**

### Documentation for AI Agents

- **[AI Agent Guide](./AI_AGENT_GUIDE.md)** - Comprehensive guide for AI agents to understand and build chains from natural language
- **[Chain Patterns Library](./CHAIN_PATTERNS.md)** - Copy-paste examples for common patterns
- **[Quick Reference](./QUICK_REFERENCE.md)** - Fast lookup for syntax, endpoints, and structures

These guides enable AI agents (or the built-in AI agent) to translate natural language requests into working chain configurations.

---

## Overview

The AIController is a sophisticated orchestration layer that allows you to:

- **Chain Module Requests**: Combine requests to IntentInterpreter, CharacterController, SceneController, ItemController, and StoryTeller
- **Data Flow**: Use response data from one module to build input parameters for subsequent modules
- **Visual Builder**: Intuitive Vue.js frontend for creating and testing chains
- **Variable Substitution**: Dynamic value injection using template syntax (`{{input.field}}`, `{{step_1.result.data}}`)
- **Conditional Execution**: Execute steps based on previous results
- **Parallel Execution**: Run independent steps concurrently for performance
- **Execution History**: Track and analyze all chain executions

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AIController                           │
│                                                             │
│  ┌──────────────┐     ┌──────────────┐    ┌────────────┐  │
│  │   Frontend   │────▶│   Backend    │───▶│  Database  │  │
│  │  (Vue + TS)  │     │(Express + TS)│    │  (MySQL)   │  │
│  └──────────────┘     └──────────────┘    └────────────┘  │
│                              │                             │
└──────────────────────────────┼─────────────────────────────┘
                               │
        ┌──────────────────────┴──────────────────────┐
        │                                             │
        ▼                                             ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ IntentInterpreter  CharacterController  SceneController │
│   (Port 3032)  │  │   (Port 3031)  │  │   (Port 3033)  │
└────────────────┘  └────────────────┘  └────────────────┘
        │                                             │
        ▼                                             ▼
┌────────────────┐                          ┌────────────────┐
│ ItemController │                          │  StoryTeller   │
│   (Port 3034)  │                          │   (Port 3037)  │
└────────────────┘                          └────────────────┘
```

## Features

### Chain Configuration

- **Step-by-Step Builder**: Add, configure, and reorder steps visually
- **Module Selection**: Choose from 4 available modules per step
- **Endpoint Configuration**: Select endpoints and configure parameters
- **JSON Editing**: Direct JSON editing for parameters and request bodies
- **Validation**: Real-time validation of chain configurations

### Variable Substitution

Use template syntax to inject dynamic values:

```json
{
  "step_1": {
    "module": "intent",
    "endpoint": "/interpret",
    "body": {
      "message": "{{input.message}}"
    }
  },
  "step_2": {
    "module": "character",
    "endpoint": "/process",
    "body": {
      "input": "{{input.message}}",
      "user_character": "{{input.characterName}}",
      "meta_data": {
        "intent": "{{step_1.result.primaryIntent.type}}"
      }
    }
  }
}
```

**Supported Patterns:**
- `{{input.field}}` - Access input data
- `{{step_X.path.to.field}}` - Access previous step response
- `{{env.VARIABLE}}` - Access environment variable
- `{{context.user_id}}` - Access execution context

### Conditional Execution

Execute steps only when conditions are met:

```json
{
  "id": "step_3",
  "condition": {
    "enabled": true,
    "sourceStep": "step_1",
    "field": "result.primaryIntent.type",
    "operator": "equals",
    "value": "movement"
  }
}
```

**Operators:**
- `equals`, `not_equals`
- `contains`, `not_contains`
- `greater_than`, `less_than`
- `greater_or_equal`, `less_or_equal`
- `exists`, `not_exists`

## Installation

### Prerequisites

- Node.js 18+
- MySQL 2.x
- Running Ex Nihilo modules (IntentInterpreter, CharacterController, SceneController, ItemController, StoryTeller)

### Backend Setup

1. **Install Dependencies**

```bash
cd AIController
npm install
```

2. **Configure Environment**

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3035
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=ai_controller

INTENT_INTERPRETER_URL=http://localhost:3032
CHARACTER_CONTROLLER_URL=http://localhost:3031
SCENE_CONTROLLER_URL=http://localhost:3033
ITEM_CONTROLLER_URL=http://localhost:3034

FRONTEND_URL=http://localhost:5173
```

3. **Setup Database**

```bash
npm run db:setup
```

This creates:
- Database: `ai_controller`
- Tables: `chain_configurations`, `execution_history`
- Sample chains

4. **Start Backend**

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

Server runs on `http://localhost:3035`

### Frontend Setup

1. **Install Dependencies**

```bash
cd frontend
npm install
```

2. **Start Development Server**

```bash
npm run dev
```

Frontend runs on `http://localhost:5173`

3. **Build for Production**

```bash
npm run build
```

## Usage

### Creating a Chain

1. Navigate to **Builder** page
2. Enter chain name and description
3. Click **Add Step**
4. Configure step:
   - Select module (Intent, Character, Scene, Item)
   - Choose HTTP method
   - Enter endpoint path
   - Configure parameters/body using JSON
   - Use `{{variable}}` syntax for dynamic values
5. Add more steps and configure data flow
6. Click **Test Chain** to execute with sample input
7. Click **Save Chain** to persist

### Executing a Chain

**Via Frontend:**
1. Go to **Chains** page
2. Click **Execute** on a chain
3. Enter input data as JSON
4. View execution results

**Via API:**
```bash
curl -X POST http://localhost:3035/execute/1?userId=admin \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "message": "I attack the goblin",
      "userId": "admin",
      "characterName": "Thorin"
    }
  }'
```

### Example Chains

#### 1. Process User Message

Interprets intent, then processes character action:

```json
{
  "name": "Process User Message",
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
          "intent": "{{step_1.result.primaryIntent.type}}"
        }
      }
    }
  ]
}
```

**Input:**
```json
{
  "message": "I attack the goblin",
  "userId": "admin",
  "characterName": "Thorin"
}
```

#### 2. Get Full Character Context

Gets character, position, and nearby locations:

```json
{
  "name": "Get Full Character Context",
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
    }
  ]
}
```

**Input:**
```json
{
  "userId": "admin",
  "characterName": "Thorin"
}
```

## API Reference

### Chain Management

#### Create Chain
```http
POST /chain
Content-Type: application/json

{
  "user_id": "admin",
  "name": "My Chain",
  "description": "Description",
  "steps": [...]
}
```

#### Get Chain
```http
GET /chain/:id?userId=admin
```

#### List User Chains
```http
GET /chains/:userId
```

#### Update Chain
```http
PATCH /chain/:id?userId=admin
Content-Type: application/json

{
  "name": "Updated Name",
  "steps": [...]
}
```

#### Delete Chain
```http
DELETE /chain/:id?userId=admin
```

### Chain Execution

#### Execute Saved Chain
```http
POST /execute/:chainId?userId=admin
Content-Type: application/json

{
  "input": {
    "message": "I attack",
    "userId": "admin"
  },
  "env": {
    "DEBUG": "true"
  }
}
```

#### Execute Ad-Hoc Chain
```http
POST /execute
Content-Type: application/json

{
  "user_id": "admin",
  "name": "Test Chain",
  "steps": [...],
  "input": {...}
}
```

#### Get Execution
```http
GET /execution/:id?userId=admin
```

#### List User Executions
```http
GET /executions/:userId?limit=100
```

### Modules

#### List Modules
```http
GET /modules
```

#### Get Module Details
```http
GET /modules/:type
```

### Health & Stats

#### Health Check
```http
GET /health
```

#### Statistics
```http
GET /stats
```

## Development

### Backend Development

```bash
cd AIController

# Run with hot reload
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Testing
npm test
```

### Frontend Development

```bash
cd frontend

# Run dev server
npm run dev

# Type checking
vue-tsc --noEmit

# Linting
npm run lint

# Build
npm run build
```

### Database Schema

**chain_configurations:**
- `id` - Primary key
- `user_id` - Owner user ID
- `name` - Chain name
- `description` - Description
- `steps` - JSON array of steps
- `meta_data` - Additional metadata
- `created_at`, `updated_at` - Timestamps

**execution_history:**
- `id` - Primary key
- `user_id` - Executor user ID
- `chain_id` - Reference to chain (nullable for ad-hoc)
- `chain_name` - Chain name
- `input` - Input JSON
- `steps` - Execution results JSON
- `success` - Boolean
- `error` - Error message (if failed)
- `total_duration_ms` - Total duration
- `started_at`, `completed_at` - Timestamps

## Troubleshooting

### Backend won't start

**Issue:** Port already in use
```
Error: listen EADDRINUSE: address already in use :::3035
```

**Solution:** Change `PORT` in `.env` or kill process on port 3035

**Issue:** Database connection failed
```
Error: ER_ACCESS_DENIED_ERROR
```

**Solution:** Check MySQL credentials in `.env`

### Frontend won't connect

**Issue:** CORS error
```
Access to XMLHttpRequest blocked by CORS policy
```

**Solution:** Update `FRONTEND_URL` in backend `.env`

### Execution failures

**Issue:** Module not responding
```
Error: No response from character module
```

**Solution:** Ensure all Ex Nihilo modules are running:
- IntentInterpreter: `http://localhost:3032/health`
- CharacterController: `http://localhost:3031/health`
- SceneController: `http://localhost:3033/health`
- ItemController: `http://localhost:3034/health`
- StoryTeller: `http://localhost:3037/health`

## Performance

### Optimization Tips

1. **Use Parallel Execution**: Mark independent steps as `parallel: true`
2. **Minimize Steps**: Combine requests when possible
3. **Cache Responses**: Enable response caching in `.env`
4. **Database Indexing**: Indexes on `user_id`, `chain_id`, `created_at`

### Benchmarks

- Single step execution: ~50-200ms (module dependent)
- 3-step chain (sequential): ~150-600ms
- 5-step chain (with parallel): ~200-400ms
- Variable substitution overhead: <1ms per variable

## Security

### Best Practices

1. **Authentication**: Implement user authentication (currently user_id is trusted)
2. **Authorization**: Validate chain ownership before execution
3. **Input Validation**: All inputs validated with Zod schemas
4. **SQL Injection**: Parameterized queries prevent SQL injection
5. **Rate Limiting**: Consider adding rate limiting for production

### Environment Variables

Never commit `.env` files. Use environment-specific configurations:
- `.env.development`
- `.env.production`

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or contributions:
- Open an issue on GitHub
- Check existing documentation
- Review DESIGN.md for architecture details

## Roadmap

### Planned Features

- [ ] Chain templates library
- [ ] Branching logic (if/else paths)
- [ ] Loop/iteration support
- [ ] Webhook triggers
- [ ] Chain versioning
- [ ] Visual flowchart editor
- [ ] Response mocking for testing
- [ ] Export/import chains as JSON
- [ ] Collaborative editing
- [ ] Analytics dashboard

## Credits

Built as part of the Ex Nihilo RPG game system.

**Related Projects:**
- [IntentInterpreter](../IntentInterpreter) - AI intent classification
- [CharacterController](../CharacterController) - Character management
- [SceneController](../SceneController) - Scene & location management
- [ItemController](../ItemController) - Item & inventory management
- [StoryTeller](../StoryTeller) - Narrative generation and story management
