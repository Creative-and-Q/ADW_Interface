---
description: Monitor AIDeveloper frontend dashboard health and issues
---

# Frontend Health Check

Monitor the AIDeveloper React frontend for issues and improvements.

## Scope

This command focuses on the **frontend dashboard**:
- `AIDeveloper/frontend/src/`
- Components, hooks, stores, services
- WebSocket connectivity
- State management

## Health Check Steps

### Step 1: Build Status

Check if frontend builds without errors:

```bash
cd AIDeveloper/frontend && npm run build 2>&1 | tail -30
```

### Step 2: TypeScript Errors

Check for type errors:

```bash
cd AIDeveloper/frontend && npx tsc --noEmit 2>&1 | head -50
```

### Step 3: Lint Issues

```bash
cd AIDeveloper/frontend && npm run lint 2>&1 | head -50
```

### Step 4: Check WebSocket Service

Review the WebSocket implementation:

```bash
cat AIDeveloper/frontend/src/services/socket.ts
```

### Step 5: Check State Management

Review Zustand stores for issues:

```bash
ls -la AIDeveloper/frontend/src/store/
cat AIDeveloper/frontend/src/store/*.ts
```

### Step 6: Check API Integration

Review API service:

```bash
cat AIDeveloper/frontend/src/services/api.ts
```

### Step 7: Dev Server Status

Check if dev server is running:

```bash
curl -s http://localhost:5173 -o /dev/null -w "%{http_code}" 2>/dev/null || echo "Frontend not running"
```

### Step 8: Backend API Connectivity

```bash
curl -s http://localhost:3001/api/health -w "\nHTTP Status: %{http_code}" 2>/dev/null || echo "Backend not running"
```

## Common Issues & Fixes

### Issue: WebSocket Disconnections
**Symptoms**: Real-time updates stop, "disconnected" in console
**Cause**: Server restart, network issues, timeout
**Fix Location**: `AIDeveloper/frontend/src/services/socket.ts`
**Fix**: Add reconnection logic, heartbeat, error handling

### Issue: State Desync
**Symptoms**: UI shows stale data, manual refresh needed
**Cause**: WebSocket missed events, race conditions
**Fix Location**: `AIDeveloper/frontend/src/store/`
**Fix**: Add state reconciliation, optimistic updates

### Issue: Slow Rendering
**Symptoms**: UI lag, delayed updates
**Cause**: Unnecessary re-renders, large lists
**Fix Location**: Component files, add memoization
**Fix**: Use React.memo, useMemo, virtualization

### Issue: API Errors Not Shown
**Symptoms**: Silent failures, confusing UX
**Cause**: Missing error handling in API calls
**Fix Location**: `AIDeveloper/frontend/src/services/api.ts`
**Fix**: Add toast notifications, error boundaries

### Issue: Build Failures
**Symptoms**: npm run build fails
**Cause**: TypeScript errors, missing deps
**Fix**: Resolve TS errors, check package.json

## Key Components to Monitor

| Component | Purpose | File |
|-----------|---------|------|
| Dashboard | Main overview | `components/DashboardWidget.tsx` |
| Workflow List | Active workflows | `components/WorkflowCard.tsx` |
| Workflow Tree | Hierarchy view | `components/WorkflowTreeExplorer.tsx` |
| Execution Logs | Live logs | `components/ExecutionLogs.tsx` |
| Agent Timeline | Agent progress | `components/AgentExecutionTimeline.tsx` |
| Auto-Fix Monitor | Fix progress | `components/AutoFixMonitor.tsx` |

## Output Report

```markdown
# Frontend Health Report

## Build Status
- Build: [Pass/Fail]
- TypeScript: [X errors]
- Lint: [X warnings]

## Services
- Dev Server: [Running/Stopped]
- API Connection: [Connected/Error]
- WebSocket: [Connected/Disconnected]

## Issues Found

### Critical
- [Build-breaking issues]

### Warnings
- [Non-blocking issues]

### Code Quality
- [Type errors, lint issues]

## Recommended Fixes

### Immediate
1. [Specific fix in frontend code]

### Improvements
1. [UX/performance enhancement]
```

---

**Running frontend health check...**
