---
description: Check AI agent health and diagnose agent-level issues
---

# Agent Health Check

Diagnose and monitor AI agent health, performance, and issues.

## Scope

This command focuses on the **AI agent modules**:
- `AIDeveloper/modules/CodePlannerAgent/`
- `AIDeveloper/modules/CodingAgent/`
- `AIDeveloper/modules/CodeTestingAgent/`
- `AIDeveloper/modules/CodeReviewAgent/`
- `AIDeveloper/modules/CodeDocumentationAgent/`
- `AIDeveloper/modules/WorkflowOrchestrator/`

## Health Check Steps

### Step 1: Agent Module Status

Check all agent modules are properly configured:

```bash
cd AIDeveloper && for dir in modules/*Agent modules/WorkflowOrchestrator; do
  if [ -f "$dir/module.json" ]; then
    echo "=== $dir ==="
    cat "$dir/module.json" | head -20
  else
    echo "WARNING: $dir missing module.json"
  fi
done
```

### Step 2: Agent Execution Statistics

```bash
cd AIDeveloper && npx tsx -e "
const { query } = require('./src/database');
(async () => {
  const stats = await query(\`
    SELECT
      agent_type,
      status,
      COUNT(*) as count,
      AVG(TIMESTAMPDIFF(SECOND, started_at, completed_at)) as avg_duration_sec,
      MAX(TIMESTAMPDIFF(SECOND, started_at, completed_at)) as max_duration_sec
    FROM agent_executions
    WHERE started_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
    GROUP BY agent_type, status
    ORDER BY agent_type, status
  \`);
  console.log(JSON.stringify(stats, null, 2));
  process.exit(0);
})();
"
```

### Step 3: Agent Error Patterns

```bash
cd AIDeveloper && npx tsx -e "
const { query } = require('./src/database');
(async () => {
  const errors = await query(\`
    SELECT
      agent_type,
      SUBSTRING(error_message, 1, 200) as error_snippet,
      COUNT(*) as occurrences
    FROM agent_executions
    WHERE status = 'failed'
      AND completed_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
    GROUP BY agent_type, SUBSTRING(error_message, 1, 200)
    ORDER BY occurrences DESC
    LIMIT 20
  \`);
  console.log(JSON.stringify(errors, null, 2));
  process.exit(0);
})();
"
```

### Step 4: Token/Context Issues

Look for token limit or context issues:

```bash
cd AIDeveloper && npx tsx -e "
const { query } = require('./src/database');
(async () => {
  const tokenIssues = await query(\`
    SELECT
      ae.id, ae.workflow_id, ae.agent_type,
      ae.error_message
    FROM agent_executions ae
    WHERE ae.status = 'failed'
      AND (
        ae.error_message LIKE '%token%'
        OR ae.error_message LIKE '%context%'
        OR ae.error_message LIKE '%truncat%'
        OR ae.error_message LIKE '%limit%'
      )
      AND ae.completed_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
    ORDER BY ae.completed_at DESC
    LIMIT 10
  \`);
  console.log(JSON.stringify(tokenIssues, null, 2));
  process.exit(0);
})();
"
```

### Step 5: Retry Patterns

Identify agents with high retry rates:

```bash
cd AIDeveloper && npx tsx -e "
const { query } = require('./src/database');
(async () => {
  const retries = await query(\`
    SELECT
      agent_type,
      AVG(retry_count) as avg_retries,
      MAX(retry_count) as max_retries,
      SUM(CASE WHEN retry_count > 0 THEN 1 ELSE 0 END) as executions_with_retries,
      COUNT(*) as total_executions
    FROM agent_executions
    WHERE started_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY agent_type
    ORDER BY avg_retries DESC
  \`);
  console.log(JSON.stringify(retries, null, 2));
  process.exit(0);
})();
"
```

### Step 6: Check OpenRouter API Configuration

```bash
cd AIDeveloper && npx tsx -e "
const config = require('./src/config').default;
console.log('OpenRouter Config:');
console.log('  API Key Set:', !!config.openrouter.apiKey);
console.log('  Planning Model:', config.openrouter.models.planning);
console.log('  Coding Model:', config.openrouter.models.coding);
console.log('  Testing Model:', config.openrouter.models.testing);
console.log('  Review Model:', config.openrouter.models.review);
console.log('  Docs Model:', config.openrouter.models.docs);
console.log('Agent Settings:');
console.log('  Max Concurrent:', config.agents.maxConcurrent);
console.log('  Timeout (ms):', config.agents.timeoutMs);
console.log('  Max Retry:', config.agents.maxRetryAttempts);
"
```

## Common Issues & Fixes

### Issue: Agent Timeouts
**Symptoms**: Agents taking >5 minutes, eventually failing
**Cause**: Large context, complex tasks, slow API response
**Fix Location**: `AIDeveloper/src/config.ts` - increase `agents.timeoutMs`
**Fix Location**: Agent module's context preparation logic

### Issue: Parsing Errors
**Symptoms**: "Unexpected token", "Failed to parse", JSON errors
**Cause**: Agent response not in expected format
**Fix Location**: Agent module's response parsing in `index.ts`

### Issue: Tool Execution Failures
**Symptoms**: "Tool failed", "Command error", file operation errors
**Cause**: Tool implementation bugs, permission issues
**Fix Location**: `AIDeveloper/modules/*Agent/tools/`

### Issue: Context Overflow
**Symptoms**: Truncated responses, "token limit" errors
**Cause**: Too much codebase context being sent
**Fix Location**: Agent's context preparation, `codebase-context.ts`

### Issue: High Retry Rates
**Symptoms**: Same agent retrying multiple times
**Cause**: Flaky API, intermittent errors, recoverable failures
**Fix Location**: Retry logic in orchestrator or agent module

## Output Report

```markdown
# Agent Health Report

## Agent Status Summary
| Agent | Success Rate (24h) | Avg Duration | Retry Rate |
|-------|-------------------|--------------|------------|

## Error Patterns
| Agent | Error Type | Occurrences | Last Seen |
|-------|------------|-------------|-----------|

## Performance Concerns
- [List any agents with concerning metrics]

## Configuration Issues
- [List any misconfigured settings]

## Recommended Fixes (Agentic Layer Only)

### Immediate
1. [Specific fix in agent module or config]

### Improvements
1. [Suggested enhancement to agent logic]
```

---

**Running agent health check...**
