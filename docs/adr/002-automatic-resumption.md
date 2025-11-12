# ADR 002: Automatic Workflow Resumption on Startup

## Status
Accepted

## Context
Workflows could be lost on server restarts, requiring manual intervention.

## Decision
Integrate resumption logic in server startup: scan checkpoints, decrypt/validate, and resume workflows sequentially.

## Consequences
- Ensures continuity without user action.
- Handles errors gracefully to avoid startup failures.
- Potential performance impact if many workflows; monitor and optimize if needed.

## Alternatives Considered
- Manual resumption: Rejected for inefficiency.
- Parallel resumption: Deferred for simplicity; can add later.