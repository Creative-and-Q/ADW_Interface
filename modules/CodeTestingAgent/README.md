# CodeTestingAgent

Code testing agent with read, write, and execute access to create and run tests.

## Overview

The CodeTestingAgent is responsible for:
- Reading code files to understand what needs to be tested
- Writing comprehensive test files
- Executing tests to verify they pass
- Generating test reports and coverage information

## Permissions

**READ, WRITE, AND EXECUTE ACCESS**: This agent can:
- Read files
- Write test files
- Execute tests

All operations are restricted to the working directory.

## Installation

```bash
npm install
```

## Configuration

Set the following environment variables:

- `OPENROUTER_API_KEY` - Required. Your OpenRouter API key
- `OPENROUTER_MODEL_TESTING` - Optional. Defaults to `anthropic/claude-3.5-haiku`

## Usage

```typescript
import CodeTestingAgent from './index.js';

const tester = new CodeTestingAgent();

const result = await tester.execute({
  workflowId: 123,
  workflowType: 'feature',
  workingDir: '/path/to/working/directory',
  taskDescription: 'Generate tests for new feature',
});
```

## Tools

See `tools.md` for documentation on available read/write/execute tools.

## Requirements

- Node.js >= 18.0.0
- OpenRouter API key
- Test framework configured in the project (Jest, Mocha, Vitest, etc.)

