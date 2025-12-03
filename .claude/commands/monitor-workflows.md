---
description: Monitor running workflows and identify issues in the agentic layer
---

# Workflow Monitoring System

Continuously monitor running workflows and identify issues without modifying target project code.

## Scope Restriction

**CRITICAL**: This command monitors the **agentic layer only**:
- AIDeveloper backend (`AIDeveloper/src/`)
- AI Agents (`AIDeveloper/modules/*Agent/`)
- Workflow orchestration
- Frontend dashboard (`AIDeveloper/frontend/`)

**DO NOT** modify or fix:
- Target project code being worked on by workflows
- Files in `workflows/workflow-*/` working directories
- Any code the agents are writing/testing

## Monitoring Steps

### Step 1: Check Running Workflows

Query the database for active workflows:

```bash
cd AIDeveloper && npx tsx -e "
const { query } = require('./src/database');
(async () => {
  const running = await query(\`
    SELECT
      w.id, w.workflow_type, w.status, w.target_module,
      w.created_at, w.updated_at,
      TIMESTAMPDIFF(MINUTE, w.updated_at, NOW()) as minutes_stale
    FROM workflows w
    WHERE w.status NOT IN ('completed', 'failed', 'cancelled')
    ORDER BY w.created_at DESC
    LIMIT 20
  \`);
  console.log(JSON.stringify(running, null, 2));
  process.exit(0);
})();
"
```

### Step 2: Check Agent Executions

Look for stuck or failed agents:

```bash
cd AIDeveloper && npx tsx -e "
const { query } = require('./src/database');
(async () => {
  const agents = await query(\`
    SELECT
      ae.id, ae.workflow_id, ae.agent_type, ae.status,
      ae.retry_count, ae.error_message,
      ae.started_at, ae.completed_at,
      TIMESTAMPDIFF(MINUTE, ae.started_at, NOW()) as running_minutes
    FROM agent_executions ae
    WHERE ae.status = 'running'
       OR (ae.status = 'failed' AND ae.completed_at > DATE_SUB(NOW(), INTERVAL 1 HOUR))
    ORDER BY ae.started_at DESC
    LIMIT 20
  \`);
  console.log(JSON.stringify(agents, null, 2));
  process.exit(0);
})();
"
```

### Step 3: Check Sub-Workflow Queue

Monitor sub-workflow dependencies:

```bash
cd AIDeveloper && npx tsx -e "
const { query } = require('./src/database');
(async () => {
  const queue = await query(\`
    SELECT
      sq.id, sq.parent_workflow_id, sq.child_workflow_id,
      sq.execution_order, sq.status, sq.depends_on,
      sq.error_message
    FROM sub_workflow_queue sq
    WHERE sq.status IN ('pending', 'in_progress')
    ORDER BY sq.parent_workflow_id, sq.execution_order
    LIMIT 30
  \`);
  console.log(JSON.stringify(queue, null, 2));
  process.exit(0);
})();
"
```

### Step 4: Check Recent Errors

Look at recent failures:

```bash
cd AIDeveloper && npx tsx -e "
const { query } = require('./src/database');
(async () => {
  const errors = await query(\`
    SELECT
      ae.id, ae.workflow_id, ae.agent_type,
      ae.error_message, ae.completed_at,
      JSON_EXTRACT(ae.output, '$.summary') as summary
    FROM agent_executions ae
    WHERE ae.status = 'failed'
    ORDER BY ae.completed_at DESC
    LIMIT 10
  \`);
  console.log(JSON.stringify(errors, null, 2));
  process.exit(0);
})();
"
```

### Step 5: Check Application Logs

```bash
tail -100 AIDeveloper/logs/combined.log 2>/dev/null | grep -i "error\|failed\|exception" | tail -20
```

## Issue Categories

### Category A: Infrastructure Issues (Fix immediately)
- Database connection failures
- Redis connection issues
- API rate limiting
- Token exhaustion

**Action**: Fix in `AIDeveloper/src/` infrastructure code

### Category B: Agent Logic Issues (Fix in agent modules)
- Parsing errors in agent responses
- Tool execution failures
- Context handling errors

**Action**: Fix in `AIDeveloper/modules/*Agent/`

### Category C: Orchestration Issues (Fix in orchestrator)
- Workflow state machine errors
- Sub-workflow queue problems
- Dependency resolution failures

**Action**: Fix in `AIDeveloper/src/` or `AIDeveloper/modules/WorkflowOrchestrator/`

### Category D: Frontend Issues (Fix in frontend)
- WebSocket disconnections
- State synchronization issues
- Rendering errors

**Action**: Fix in `AIDeveloper/frontend/src/`

### Category E: Target Project Issues (DO NOT FIX)
- Compile errors in generated code
- Test failures in target project
- Runtime errors in workflow working directory

**Action**: Report only, do not fix. Let the workflow retry or user intervene.

## Output Report

Provide a monitoring report with:

```markdown
# Workflow Monitoring Report

## Active Workflows
| ID | Type | Status | Age | Issues |
|----|------|--------|-----|--------|

## Stuck Agents (running > 30 min)
| ID | Workflow | Agent | Running Time |
|----|----------|-------|--------------|

## Recent Failures
| ID | Agent | Error Summary | Time |
|----|-------|---------------|------|

## Sub-Workflow Queue Status
- Pending: X
- In Progress: Y
- Blocked: Z

## Identified Issues (Agentic Layer Only)

### Critical
- [List any critical issues needing immediate attention]

### Warnings
- [List any concerning patterns]

## Recommended Actions
1. [Specific action for agentic layer fix]
2. [Specific action for agentic layer fix]
```

---

**Starting workflow monitoring...**
