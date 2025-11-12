# 🤖 AI Agent Setup Guide

The AIController now includes a conversational AI agent that can create, modify, and evolve chains through natural language!

## Features

- **Natural Language Chain Creation** - Describe what you want in plain English
- **Chain Analysis** - Ask the AI to analyze and improve existing chains
- **Chain Modification** - Edit existing chains through conversation
- **Contextual Understanding** - AI has full access to documentation and system architecture
- **Function Calling** - AI can directly create, update, and manage chains

## Setup

### 1. Get an API Key

You have two options:

#### Option A: OpenRouter (Recommended)
OpenRouter supports multiple AI models (Claude, GPT-4, Gemini, etc.) through a single API.

1. Sign up at [OpenRouter.ai](https://openrouter.ai/)
2. Create an API key
3. Add to your `.env` file:

```bash
OPENROUTER_API_KEY=sk-or-v1-...
AI_AGENT_MODEL=anthropic/claude-3.5-sonnet
```

**Recommended Models:**
- `anthropic/claude-3.5-sonnet` - Best for complex reasoning (recommended)
- `openai/gpt-4-turbo` - Good alternative
- `google/gemini-pro-1.5` - Fast and cost-effective

#### Option B: OpenAI Direct
1. Get an API key from [OpenAI](https://platform.openai.com/)
2. Add to your `.env`:

```bash
OPENAI_API_KEY=sk-...
AI_AGENT_MODEL=gpt-4-turbo-preview
```

### 2. Install Dependencies

The AI agent uses the existing dependencies. If you haven't already:

```bash
cd /home/kevin/Home/ex_nihilo/AIController
npm install
```

### 3. Start the Server

```bash
npm start
```

The AI agent endpoint will be available at `http://localhost:3000/ai/chat`

### 4. Access the UI

1. Navigate to `http://localhost:5174` (or your frontend URL)
2. Click **🤖 AI Agent** in the navigation bar
3. Start chatting!

## Usage Examples

### Creating a New Chain

**You:** "Create a chain that interprets player intent and gets their character"

**AI:** Creates a complete chain configuration with:
- IntentInterpreter step
- CharacterController step
- Proper variable mapping
- Output template

### Analyzing Existing Chains

**You:** "Show me all chains and analyze chain 3 for improvements"

**AI:**
1. Lists all chains
2. Retrieves chain 3
3. Analyzes the structure
4. Suggests optimizations

### Modifying Chains

**You:** "Update chain 5 to add routing for attack intents to chain 10"

**AI:**
1. Retrieves chain 5
2. Adds conditional routing rule
3. Updates the chain
4. Confirms the changes

### Building Complex Workflows

**You:** "Create a router that:
- Sends attack/defend/magic intents to chain 5
- Sends dialogue/social intents to chain 6
- Sends everything else to chain 7"

**AI:** Builds a complete routing chain with multiple conditional rules

## Available Commands

The AI understands natural language. Try asking:

### Chain Management
- "Show me all chains"
- "What chains exist?"
- "List all chains with their names"

### Chain Creation
- "Create a chain that [description]"
- "Build a workflow for [use case]"
- "Make a chain that interprets intent and gets character inventory"

### Chain Analysis
- "Analyze chain [number]"
- "What does chain [number] do?"
- "How can I improve chain [number]?"

### Chain Modification
- "Update chain [number] to [changes]"
- "Add a step to chain [number] that [description]"
- "Modify chain [number] to route [intent] to chain [target]"

### Chain Deletion
- "Delete chain [number]"
- "Remove chain [number]"

## How It Works

### Backend Architecture

```
User Input → AI Agent Service → LLM (Claude/GPT-4)
                ↓
         Function Calls
                ↓
         Chain Manager
                ↓
         MySQL Storage
```

The AI agent:
1. Receives your message
2. Understands intent using the LLM
3. Calls appropriate functions (list_chains, create_chain, etc.)
4. Executes the function through ChainManager
5. Returns a conversational response

### Available Functions

The AI can call these functions:

1. `list_chains()` - Get all chains
2. `get_chain(chain_id)` - Get chain details
3. `create_chain(config)` - Create new chain
4. `update_chain(chain_id, config)` - Update chain
5. `delete_chain(chain_id)` - Delete chain

### System Prompt

The AI has full access to:
- `AI_AGENT_GUIDE.md` - Complete system documentation
- `CHAIN_PATTERNS.md` - Example patterns
- `QUICK_REFERENCE.md` - Syntax reference

This gives it deep understanding of:
- All available modules and endpoints
- Variable syntax and resolution
- Routing rules and operators
- Best practices and patterns

## Tips for Best Results

### Be Specific
❌ "Make a chain"
✅ "Create a chain that interprets player messages and gets their character data"

### Provide Context
❌ "Add routing"
✅ "Add routing to chain 5 that sends attack intents to chain 10"

### Ask for Explanation
- "Explain what you're doing"
- "Show me the chain configuration"
- "Why did you structure it that way?"

### Iterate
1. "Create a basic intent chain"
2. "Now add character retrieval"
3. "Add routing for combat intents"
4. "Optimize the output template"

## Troubleshooting

### AI Agent Not Responding

**Check API Key:**
```bash
# In your .env file
echo $OPENROUTER_API_KEY
# or
echo $OPENAI_API_KEY
```

**Check Logs:**
```bash
# Terminal running the server should show:
🤖 AI Agent calling function: list_chains
```

**Check Network:**
```bash
curl -X POST http://localhost:3000/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

### Invalid Chains Created

The AI should validate chains before creating them, but if you encounter invalid configurations:

1. **Ask AI to fix it:** "That chain has an error, can you fix it?"
2. **Be more specific:** Provide more details about what you want
3. **Check manually:** Use the Chain Builder UI to verify and adjust

### Rate Limits

If you hit API rate limits:
- **OpenRouter:** Check your [dashboard](https://openrouter.ai/dashboard)
- **OpenAI:** Check [usage](https://platform.openai.com/usage)
- Consider using a different model or waiting

## Advanced Usage

### Custom Models

You can use any model supported by your API:

```bash
# Anthropic models (via OpenRouter)
AI_AGENT_MODEL=anthropic/claude-3.5-sonnet
AI_AGENT_MODEL=anthropic/claude-3-opus

# OpenAI models
AI_AGENT_MODEL=gpt-4-turbo-preview
AI_AGENT_MODEL=gpt-4
AI_AGENT_MODEL=gpt-3.5-turbo

# Google models (via OpenRouter)
AI_AGENT_MODEL=google/gemini-pro-1.5
```

### Conversation Context

The AI remembers the conversation history, so you can have multi-turn interactions:

1. "Show me all chains"
2. "Analyze chain 3" (AI remembers the list from #1)
3. "Create a similar chain but with routing" (AI uses context from #2)

### Batch Operations

You can ask for multiple operations:

"Create three chains:
1. Intent classifier
2. Combat handler
3. Dialogue handler

Then create a router that sends intents to the appropriate chain"

## Security Notes

- AI agent has full access to create/modify/delete chains
- Review chain configurations before deploying to production
- API keys are stored in .env (never commit these!)
- Consider rate limiting for production use

## Cost Considerations

### Approximate Costs (per conversation)

**Claude 3.5 Sonnet (OpenRouter):**
- ~$0.01-0.05 per complex chain creation
- ~$0.001-0.01 per simple query

**GPT-4 Turbo:**
- ~$0.01-0.03 per complex chain creation
- ~$0.001-0.005 per simple query

**GPT-3.5 Turbo:**
- ~$0.001-0.005 per complex chain creation
- ~$0.0001-0.001 per simple query

The AI loads full documentation (~15-20k tokens) in each request for context.

## Future Enhancements

Planned features:
- [ ] Chain testing through conversation
- [ ] Execution history analysis
- [ ] Performance optimization suggestions
- [ ] Auto-evolution based on usage patterns
- [ ] Multi-step chain creation wizard
- [ ] Voice input support

## Contributing

To extend the AI agent:

1. Add new functions in `src/ai-agent.ts`
2. Update the system prompt with new capabilities
3. Add documentation to `AI_AGENT_GUIDE.md`

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review server logs for errors
3. Open an issue on GitHub

Happy chain building! 🤖✨
