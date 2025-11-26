# CodeDocumentationAgent

Code documentation agent with read and write access to generate documentation.

## Overview

The CodeDocumentationAgent is responsible for:
- Reading code files to understand the implementation
- Generating clear, comprehensive documentation
- Writing documentation files in appropriate formats (Markdown, etc.)
- Ensuring documentation is accurate and up-to-date

## Permissions

**READ AND WRITE ACCESS**: This agent can:
- Read files
- Write documentation files

All operations are restricted to the working directory.

## Installation

```bash
npm install
```

## Configuration

Set the following environment variables:

- `OPENROUTER_API_KEY` - Required. Your OpenRouter API key
- `OPENROUTER_MODEL_DOCS` - Optional. Defaults to `anthropic/claude-3.5-haiku`

## Usage

```typescript
import CodeDocumentationAgent from './index.js';

const docAgent = new CodeDocumentationAgent();

const result = await docAgent.execute({
  workflowId: 123,
  workflowType: 'feature',
  workingDir: '/path/to/working/directory',
  taskDescription: 'Generate documentation for new feature',
});
```

## Tools

See `tools.md` for documentation on available read/write tools.

## Requirements

- Node.js >= 18.0.0
- OpenRouter API key



