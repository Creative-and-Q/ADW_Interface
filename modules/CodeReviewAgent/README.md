# CodeReviewAgent

Code review agent with read-only access to analyze code and generate review reports.

## Overview

The CodeReviewAgent is responsible for:
- Reading code files
- Analyzing code quality, security, and best practices
- Identifying potential issues, bugs, and improvements
- Generating detailed review reports with recommendations

## Restrictions

**READ-ONLY ACCESS**: This agent can only read files and analyze code. It cannot:
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
- `OPENROUTER_MODEL_REVIEW` - Optional. Defaults to `anthropic/claude-3.5-sonnet`

## Usage

```typescript
import CodeReviewAgent from './index.js';

const reviewer = new CodeReviewAgent();

const result = await reviewer.execute({
  workflowId: 123,
  workflowType: 'feature',
  workingDir: '/path/to/working/directory',
  taskDescription: 'Review code changes',
});
```

## Tools

See `tools.md` for documentation on available read-only tools.

## Requirements

- Node.js >= 18.0.0
- OpenRouter API key




