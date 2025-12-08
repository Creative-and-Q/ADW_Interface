# Work Plan: TypeScript Type Safety Improvements

**Agent ID:** agent_1765225128_wurm
**Date:** 2025-12-08
**Status:** Planning

## Conflict Check Results

- Active agents working: agent_1765224750_x7k3, agent_20251208_151553_opus, agent_1765224990_ts7q
- Files I want to modify:
  - `AIDeveloper/src/types.ts`
  - `AIDeveloper/src/websocket-emitter.ts`
  - `AIDeveloper/src/workflow-messages.ts`
- Conflict status: NO CONFLICTS (files not locked by other agents)
- Alternative options if conflicts exist: N/A - no conflicts

## Summary

Replace `any` types with proper TypeScript types in three core files to improve type safety and ESLint compliance.

## Rationale

1. **Type Safety**: Using `any` defeats the purpose of TypeScript's type system, leading to potential runtime errors that could be caught at compile time.
2. **ESLint Compliance**: All three files have ESLint warnings for `@typescript-eslint/no-explicit-any`.
3. **Code Quality**: Proper typing improves IDE autocompletion, refactoring safety, and code documentation.

## Files and Changes

### 1. `AIDeveloper/src/types.ts` (10 `any` warnings)

**Lines with `any`:**
- Line 89: `customData?: Record<string, any>` in WebhookPayload
- Line 140: `metadata?: Record<string, any>` in SubTask
- Line 182: `metadata?: Record<string, any>` in AgentInput
- Line 186: `reviewFeedback?: any` in AgentInput.context
- Line 187: `[key: string]: any` in AgentInput.context
- Line 199: `metadata?: Record<string, any>` in AgentOutput
- Line 210: `metadata?: Record<string, any>` in Artifact
- Line 354: `requestBody?: any` in APISpecification
- Line 355: `responseBody?: any` in APISpecification
- Line 387: `payload: any` in WebhookLog

**Approach:**
- For `Record<string, any>` pattern: Use `Record<string, unknown>` which is more type-safe
- For `payload: any`: Use the already-defined `WebhookPayload` type
- For `reviewFeedback` and index signatures: Use `unknown` for type safety
- For API body types: Create specific types or use `unknown`

### 2. `AIDeveloper/src/websocket-emitter.ts` (6 `any` warnings)

**Lines with `any`:**
- Line 8: `let ioInstance: any = null`
- Line 13: `export function setSocketIo(io: any)`
- Line 21: `data: any` in emitWorkflowUpdated
- Line 43: `agentData: any` in emitAgentUpdated
- Line 61: `artifactData: any` in emitArtifactCreated
- Line 134: `data: any` in emitToClients

**Approach:**
- Import Socket.IO Server type for `ioInstance` and `setSocketIo`
- Create specific interfaces for event data payloads
- Use existing types from `types.ts` where applicable

### 3. `AIDeveloper/src/workflow-messages.ts` (12 `any` warnings)

**Lines with `any`:**
- Line 21: `metadata: any` in WorkflowMessage interface
- Line 31: `metadata?: any` in InterruptSignal interface
- Line 39: `metadata?: any` in AddMessageOptions interface
- Line 76: `(result as any).insertId`
- Line 125: `(result as any[])[0]?.id`
- Line 147: `(result as any[])`
- Line 195: `(messages as any[])`
- Line 223: `(messages as any[])`
- Line 327: `(workflow as any[])[0]?.is_paused`
- Line 404: `(result as any[])[0]?.is_paused`
- Line 420: `metadata?: any`
- Line 438: `metadata?: any`

**Approach:**
- Create a proper `QueryResult` interface for MySQL query results
- Use `unknown` for metadata fields and add type guards where needed
- Type the database row results properly

## Coordination Section

**Files to be locked:**
- `AIDeveloper/src/types.ts`
- `AIDeveloper/src/websocket-emitter.ts`
- `AIDeveloper/src/workflow-messages.ts`

**Features to be claimed:**
- `typescript_type_safety`
- `replace_any_with_proper_types`
- `eslint_compliance`

**Estimated work duration:** 45 minutes

**Fallback plan if conflicts arise:** Work on other unlocked files with `any` issues (e.g., `plan-chunker.ts`, `workflow-directory-manager.ts`)

## Test Plan

1. Run `npm run lint` to verify all `any` warnings are resolved
2. Run `npm run typecheck` to ensure no new type errors introduced
3. Run `npm test` to verify functionality isn't broken
4. Start the server to confirm runtime behavior

## Implementation Order

1. Start with `types.ts` since other files depend on it
2. Then `websocket-emitter.ts` which is relatively simple
3. Finally `workflow-messages.ts` which has the most `any` usages
