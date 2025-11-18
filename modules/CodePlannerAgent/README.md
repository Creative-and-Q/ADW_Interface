# CodePlannerAgent

Code planning agent with read-only access to analyze codebase and create implementation plans.

## Overview

The CodePlannerAgent is responsible for:
- Analyzing codebase structure
- Reading and understanding code files
- Creating comprehensive implementation plans
- Identifying risks and dependencies

## Restrictions

**READ-ONLY ACCESS**: This agent can only read files and analyze the codebase. It cannot:
- Write files
- Modify files
- Copy files
- Delete files
- Create directories

## Installation

```bash
npm install
```

## Configuration

Set the following environment variables:

- `OPENROUTER_API_KEY` - Required. Your OpenRouter API key
- `OPENROUTER_MODEL_PLANNING` - Optional. Defaults to `anthropic/claude-3.5-sonnet`

## Usage

```typescript
import CodePlannerAgent from './index.js';

const planner = new CodePlannerAgent();

const result = await planner.execute({
  workflowId: 123,
  workflowType: 'feature',
  workingDir: '/path/to/working/directory',
  taskDescription: 'Implement new feature',
});
```

## Tools

See `tools.md` for documentation on available read-only tools.

## Requirements

- Node.js >= 18.0.0
- OpenRouter API key

