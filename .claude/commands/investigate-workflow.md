---
description: Systematically investigate why a workflow failed
---

# Workflow Failure Investigation Framework

You are investigating workflow ${WORKFLOW_ID} failure. Follow this systematic framework:

## Phase 1: Data Collection

### 1.1 Workflow Metadata
- [ ] Read workflow README.md from `workflows/workflow-${WORKFLOW_ID}-*/README.md`
- [ ] Check workflow status, branch name, timestamps
- [ ] Identify which stage failed

### 1.2 Database Records
Query the database for:
- [ ] Workflow record: `SELECT * FROM workflows WHERE id = ${WORKFLOW_ID}`
- [ ] Agent executions: `SELECT id, agent_type, status, started_at, completed_at FROM agent_executions WHERE workflow_id = ${WORKFLOW_ID} ORDER BY id`
- [ ] Agent outputs: `SELECT id, agent_type, status, JSON_EXTRACT(output, '$.success') as success, JSON_EXTRACT(output, '$.summary') as summary FROM agent_executions WHERE workflow_id = ${WORKFLOW_ID}`
- [ ] Artifacts created: `SELECT id, agent_execution_id, artifact_type, file_path FROM artifacts WHERE workflow_id = ${WORKFLOW_ID}`

### 1.3 Log Files
- [ ] List all log files: `ls -lh workflows/workflow-${WORKFLOW_ID}-*/logs/`
- [ ] Read logs for failed stage
- [ ] Check for errors in combined logs around failure time

### 1.4 Application Logs
- [ ] Search main application logs for workflow ${WORKFLOW_ID}
- [ ] Look for errors, warnings, timeouts
- [ ] Check for token limit issues, API failures, parsing errors

## Phase 2: Root Cause Analysis

### 2.1 Error Classification
Determine the error category:
- [ ] **Token Limit Error**: Truncated JSON, "unterminated string", response length ~47K chars
- [ ] **API Error**: Timeout, rate limit, connection failure
- [ ] **Validation Error**: Missing files, invalid format, schema mismatch
- [ ] **Code Error**: Runtime exception, logic error, null reference
- [ ] **Infrastructure Error**: Service down, disk space, permissions

### 2.2 Timeline Analysis
- [ ] When did the workflow start?
- [ ] How long did each stage take?
- [ ] Where exactly did it fail?
- [ ] Were there any warnings before failure?

### 2.3 Context Analysis
- [ ] What was the task description?
- [ ] How many files were planned?
- [ ] Was this a retry attempt?
- [ ] Were there any previous related failures?

## Phase 3: Impact Assessment

### 3.1 Scope
- [ ] Is this a one-time failure or recurring pattern?
- [ ] Does it affect specific workflow types or all workflows?
- [ ] Are there similar recent failures?

### 3.2 Artifacts
- [ ] What artifacts were created before failure?
- [ ] Were any files written to the repo?
- [ ] Is the branch in a usable state?

## Phase 4: Solution Identification

### 4.1 Immediate Fix
Based on the root cause, determine if this can be fixed by:
- [ ] Automatic chunking (already implemented)
- [ ] Retry with different parameters
- [ ] Manual intervention
- [ ] Code fix required

### 4.2 Prevention
- [ ] Would chunking have prevented this?
- [ ] Should we adjust token limits?
- [ ] Is additional validation needed?
- [ ] Should we improve error handling?

## Phase 5: Reporting

Provide a structured report with:

### 5.1 Executive Summary
- Workflow ID and status
- Stage where it failed
- Root cause in one sentence
- Quick fix recommendation

### 5.2 Detailed Findings
- Timeline of events
- Error details with logs
- Database state
- Artifacts produced

### 5.3 Root Cause
- Technical explanation
- Why it happened
- Contributing factors

### 5.4 Recommendations
- Immediate action (retry, manual fix, etc.)
- Long-term prevention measures
- Related improvements needed

## Investigation Checklist

Run through these steps in order:

1. ✅ Gather basic workflow info (README, status)
2. ✅ Query database for execution records
3. ✅ Read all relevant log files
4. ✅ Identify the exact error and error type
5. ✅ Analyze timeline and context
6. ✅ Determine root cause
7. ✅ Assess whether recent fixes (chunking) would prevent this
8. ✅ Provide actionable recommendations

## Output Format

Present findings as:

```markdown
# Workflow ${WORKFLOW_ID} Failure Investigation

## Summary
- **Status**: [Failed/Cancelled]
- **Failed Stage**: [PLAN/CODE/TEST/etc]
- **Root Cause**: [One sentence explanation]
- **Fix**: [Immediate recommendation]

## Timeline
- Started: [timestamp]
- Failed: [timestamp]
- Duration: [time]
- Stage Progress: PLAN ✅ → CODE ❌

## Error Details
[Paste relevant error messages and logs]

## Root Cause Analysis
[Detailed explanation of why it failed]

## Artifacts & State
- Artifacts created: X
- Files written: Y
- Branch state: [usable/broken]

## Recommendations

### Immediate Action
[What to do right now]

### Prevention
[How to prevent this in the future]

### Related Improvements
[Other enhancements that would help]
```

---

**Now investigate workflow ${WORKFLOW_ID} following this framework.**
