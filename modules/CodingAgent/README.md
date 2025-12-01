# CodingAgent

Code implementation agent with read and write access to implement code changes.

## Overview

The CodingAgent is responsible for:
- Reading existing code files
- Writing new code files
- Modifying existing code files
- Creating directories
- Copying files
- Implementing features, bug fixes, and refactorings according to plans

## Permissions

**READ AND WRITE ACCESS**: This agent can:
- Read files
- Write files
- Modify files
- Create directories
- Copy files

All operations are restricted to the working directory.

## Installation

```bash
npm install
```

## Configuration

Set the following environment variables:

- `OPENROUTER_API_KEY` - Required. Your OpenRouter API key
- `OPENROUTER_MODEL_CODING` - Optional. Defaults to `anthropic/claude-3.5-sonnet`

## Usage

```typescript
import CodingAgent from './index.js';

const coder = new CodingAgent();

const result = await coder.execute({
  workflowId: 123,
  workflowType: 'feature',
  workingDir: '/path/to/working/directory',
  taskDescription: 'Implement new feature',
});
```

## Tools

See `tools.md` for documentation on available read/write tools.

## Requirements

- Node.js >= 18.0.0
- OpenRouter API key




