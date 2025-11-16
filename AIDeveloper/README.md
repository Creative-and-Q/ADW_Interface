# AIDeveloper Server

## Overview
The AIDeveloper Server is an automated development workflow system that supports resumable workflows with secure checkpointing.

## New Features
- **Automatic Workflow Resumption**: On server restart, workflows are automatically resumed from the last saved checkpoint, ensuring continuity.
- **Secure Checkpointing**: Checkpoints are encrypted using AES-256-GCM, serialized safely with serialize-javascript, and validated for integrity with SHA-256 checksums.
- **Access Controls**: Checkpoint files have owner-only permissions (600), and workflow IDs are sanitized to prevent path traversal.
- **Configuration**: Encryption keys are managed via environment variables for security.

## Setup
1. Install dependencies: `npm install`
2. Set environment variable: `CHECKPOINT_ENCRYPTION_KEY=<64-char hex string>`
3. Run: `npm start`

## Security
- Encryption prevents unauthorized access to sensitive workflow data.
- Validation and sanitization mitigate injection and path traversal risks.
- File permissions restrict access to checkpoint files.

## Usage
Workflows are managed internally; no user-facing changes. On startup, logs will indicate resumption progress.

---

# AIDeveloper

A comprehensive development platform for building, orchestrating, and managing AI-driven workflows across multiple modules.

## Features

- **ChainBuilder Component**: A powerful frontend component for orchestrating workflows across multiple modules, enabling seamless communication and state management.
- **Module Integration**: Interfaces with CharacterController, ItemController, and other modules for unified workflow execution.
- **Event-Driven Architecture**: Utilizes an EventBus for decoupled module communication.
- **Secure State Management**: Implements robust state management with validation and security checks.
- **Type-Safe Development**: Full TypeScript support with strict typing and advanced type features.

## ChainBuilder Usage

The ChainBuilder component enables workflow orchestration:

```typescript
import { ChainBuilder, useChainBuilder } from '@/components/ChainBuilder';

// Using the component
const MyApp = () => <ChainBuilder />;

// Using the hook
function MyComponent() {
  const { chain, executeChain, isExecuting } = useChainBuilder();
  
  return (
    <div>
      <button onClick={executeChain} disabled={isExecuting}>
        {isExecuting ? 'Executing...' : 'Execute Chain'}
      </button>
    </div>
  );
}
```

## Security

- All inputs are validated and sanitized
- Secure authentication and authorization
- No sensitive data exposure in logs or responses
- OWASP Top 10 compliance

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Testing

```bash
npm test
```

## License

MIT License
