# WorkflowOrchestrator

Orchestrates workflow execution and manages agent sequence for the AIDeveloper system.

## Overview

The WorkflowOrchestrator is responsible for:
- Analyzing workflow requirements
- Determining the appropriate agent sequence
- Coordinating execution of multiple agents
- Managing workflow state and handling errors/retries
- Ensuring proper data flow between agents

## Installation

```bash
npm install
```

## Configuration

Set the following environment variables:

- `OPENROUTER_API_KEY` - Required. Your OpenRouter API key
- `OPENROUTER_MODEL_ORCHESTRATOR` - Optional. Defaults to `anthropic/claude-3.5-sonnet`

## Usage

```typescript
import WorkflowOrchestrator from './index.js';

const orchestrator = new WorkflowOrchestrator();

const result = await orchestrator.execute({
  workflowId: 123,
  workflowType: 'feature',
  workingDir: '/path/to/working/directory',
  taskDescription: 'Implement new feature',
});
```

## Tools

See `tools.md` for documentation on available tools.

## Requirements

- Node.js >= 18.0.0
- OpenRouter API key




