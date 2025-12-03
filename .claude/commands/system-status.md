---
description: Get complete AIDeveloper system status at a glance
---

# System Status Dashboard

Quick overview of the entire AIDeveloper system health.

## Quick Status Check

### Step 1: Service Health

```bash
echo "=== Backend API ===" && \
curl -s http://localhost:3001/api/health -w "\nHTTP: %{http_code}" 2>/dev/null || echo "NOT RUNNING"

echo -e "\n=== Frontend ===" && \
curl -s http://localhost:5173 -o /dev/null -w "HTTP: %{http_code}" 2>/dev/null || echo "NOT RUNNING"

echo -e "\n=== MySQL ===" && \
cd AIDeveloper && npx tsx -e "require('./src/database').query('SELECT 1').then(() => console.log('CONNECTED')).catch(() => console.log('NOT CONNECTED')).finally(() => process.exit(0))" 2>/dev/null || echo "ERROR"

echo -e "\n=== Redis ===" && \
redis-cli ping 2>/dev/null || echo "NOT CONNECTED"
```

### Step 2: Workflow Summary

```bash
cd AIDeveloper && npx tsx -e "
const { query } = require('./src/database');
(async () => {
  const summary = await query(\`
    SELECT
      status,
      COUNT(*) as count
    FROM workflows
    WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
    GROUP BY status
  \`);
  console.log('Last 24h Workflows:');
  summary.forEach(r => console.log('  ' + r.status + ': ' + r.count));
  process.exit(0);
})();
" 2>/dev/null
```

### Step 3: Active Work

```bash
cd AIDeveloper && npx tsx -e "
const { query } = require('./src/database');
(async () => {
  const active = await query(\`
    SELECT
      w.id, w.workflow_type, w.status, w.target_module,
      (SELECT agent_type FROM agent_executions WHERE workflow_id = w.id ORDER BY id DESC LIMIT 1) as current_agent
    FROM workflows w
    WHERE w.status NOT IN ('completed', 'failed', 'cancelled')
    ORDER BY w.id DESC
    LIMIT 5
  \`);
  console.log('Active Workflows:');
  active.forEach(w => console.log('  #' + w.id + ' [' + w.workflow_type + '] ' + w.status + (w.current_agent ? ' → ' + w.current_agent : '')));
  if (active.length === 0) console.log('  None');
  process.exit(0);
})();
" 2>/dev/null
```

### Step 4: Recent Failures

```bash
cd AIDeveloper && npx tsx -e "
const { query } = require('./src/database');
(async () => {
  const failures = await query(\`
    SELECT
      ae.workflow_id, ae.agent_type,
      SUBSTRING(ae.error_message, 1, 80) as error
    FROM agent_executions ae
    WHERE ae.status = 'failed'
      AND ae.completed_at > DATE_SUB(NOW(), INTERVAL 6 HOUR)
    ORDER BY ae.completed_at DESC
    LIMIT 5
  \`);
  console.log('Recent Failures (6h):');
  failures.forEach(f => console.log('  #' + f.workflow_id + ' ' + f.agent_type + ': ' + (f.error || 'No message')));
  if (failures.length === 0) console.log('  None');
  process.exit(0);
})();
" 2>/dev/null
```

### Step 5: Sub-Workflow Queue

```bash
cd AIDeveloper && npx tsx -e "
const { query } = require('./src/database');
(async () => {
  const queue = await query(\`
    SELECT status, COUNT(*) as count
    FROM sub_workflow_queue
    WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
    GROUP BY status
  \`);
  console.log('Sub-Workflow Queue (24h):');
  queue.forEach(q => console.log('  ' + q.status + ': ' + q.count));
  if (queue.length === 0) console.log('  Empty');
  process.exit(0);
})();
" 2>/dev/null
```

## Output Format

```markdown
# AIDeveloper System Status

## Services
| Service | Status |
|---------|--------|
| Backend API | [Running/Down] |
| Frontend | [Running/Down] |
| MySQL | [Connected/Error] |
| Redis | [Connected/Error] |

## Workflow Summary (24h)
| Status | Count |
|--------|-------|
| completed | X |
| failed | Y |
| in progress | Z |

## Active Workflows
- #ID [type] status → current_agent

## Recent Failures
- #ID agent: error message

## Queue Status
- Pending: X
- In Progress: Y
- Completed: Z

## Quick Actions
- `/monitor-workflows` - Detailed workflow monitoring
- `/agent-health` - Agent diagnostics
- `/frontend-health` - Frontend diagnostics
- `/investigate-workflow {id}` - Investigate specific failure
- `/auto-fix-workflow {id}` - Auto-fix failed workflow
```

---

**Fetching system status...**
