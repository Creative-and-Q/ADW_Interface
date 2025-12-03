---
description: Identify and implement improvements to the agentic layer
---

# Agentic Layer Improvement System

Analyze the agentic layer for improvements, then implement fixes.

## Scope Restriction

**CRITICAL**: Only modify the **agentic layer**:
- `AIDeveloper/src/` - Backend services
- `AIDeveloper/modules/` - AI agents and orchestrator
- `AIDeveloper/frontend/` - Dashboard UI
- `.claude/commands/` - Claude commands

**NEVER MODIFY**:
- Target project code
- `workflows/workflow-*/` directories
- Any code being worked on by workflows

## Variables
focus_area: $1

## Focus Areas

| Area | Description |
|------|-------------|
| `agents` | Improve AI agent modules |
| `orchestrator` | Improve workflow orchestration |
| `frontend` | Improve dashboard UI/UX |
| `infrastructure` | Improve database, Redis, API |
| `monitoring` | Improve logging and observability |
| `all` | Full system analysis |

## Improvement Process

### Phase 1: Analysis

Run comprehensive health checks:

```bash
# Agent statistics
cd AIDeveloper && npx tsx -e "
const { query } = require('./src/database');
(async () => {
  const stats = await query(\`
    SELECT
      agent_type,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      AVG(retry_count) as avg_retries
    FROM agent_executions
    WHERE started_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY agent_type
  \`);
  console.log(JSON.stringify(stats, null, 2));
  process.exit(0);
})();
"
```

```bash
# Workflow completion rates
cd AIDeveloper && npx tsx -e "
const { query } = require('./src/database');
(async () => {
  const workflows = await query(\`
    SELECT
      workflow_type,
      status,
      COUNT(*) as count
    FROM workflows
    WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY workflow_type, status
    ORDER BY workflow_type, status
  \`);
  console.log(JSON.stringify(workflows, null, 2));
  process.exit(0);
})();
"
```

```bash
# Common error patterns
cd AIDeveloper && npx tsx -e "
const { query } = require('./src/database');
(async () => {
  const errors = await query(\`
    SELECT
      SUBSTRING(error_message, 1, 100) as error_pattern,
      COUNT(*) as occurrences
    FROM agent_executions
    WHERE status = 'failed'
      AND completed_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY SUBSTRING(error_message, 1, 100)
    ORDER BY occurrences DESC
    LIMIT 10
  \`);
  console.log(JSON.stringify(errors, null, 2));
  process.exit(0);
})();
"
```

### Phase 2: Code Review

Review key files for improvement opportunities:

**For `agents` focus:**
- Read agent module index.ts files
- Check tool implementations
- Review prompt templates

**For `orchestrator` focus:**
- Read `AIDeveloper/src/sub-workflow-queue.ts`
- Read `AIDeveloper/modules/WorkflowOrchestrator/index.ts`
- Check state machine logic

**For `frontend` focus:**
- Check components for performance issues
- Review WebSocket handling
- Check state management

**For `infrastructure` focus:**
- Review database queries
- Check Redis usage
- Review API endpoints

### Phase 3: Prioritize Improvements

Categorize findings:

1. **Critical**: Causing failures, data loss, or blocking workflows
2. **High**: Significantly impacting reliability or performance
3. **Medium**: Notable improvement opportunity
4. **Low**: Nice-to-have enhancement

### Phase 4: Implement Fixes

For each improvement:

1. Create a focused fix in the appropriate file
2. Ensure backward compatibility
3. Add appropriate error handling
4. Test the change locally if possible

## Improvement Categories

### Agent Improvements
- Prompt engineering enhancements
- Tool reliability improvements
- Context preparation optimization
- Error recovery improvements

### Orchestrator Improvements
- State machine robustness
- Dependency resolution logic
- Retry strategy optimization
- Deadlock prevention

### Frontend Improvements
- Real-time update reliability
- Error display and handling
- Performance optimization
- UX enhancements

### Infrastructure Improvements
- Query optimization
- Connection pooling
- Caching strategies
- Logging improvements

## Output Format

```markdown
# Agentic Layer Improvement Report

## Analysis Summary
- Focus Area: ${focus_area}
- Period Analyzed: Last 7 days
- Total Workflows: X
- Success Rate: Y%

## Issues Identified

### Critical
1. [Issue description]
   - Location: `file:line`
   - Impact: [description]
   - Fix: [proposed solution]

### High Priority
1. [Issue description]
   - Location: `file:line`
   - Impact: [description]
   - Fix: [proposed solution]

## Improvements Made

### [Improvement 1]
- File: `path/to/file.ts`
- Change: [description]
- Impact: [expected improvement]

### [Improvement 2]
- File: `path/to/file.ts`
- Change: [description]
- Impact: [expected improvement]

## Recommendations for Future

1. [Recommendation with rationale]
2. [Recommendation with rationale]
```

---

**Analyzing agentic layer with focus: ${focus_area}...**
