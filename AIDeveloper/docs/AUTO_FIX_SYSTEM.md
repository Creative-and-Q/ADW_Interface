# Auto-Fix Workflow System

The Auto-Fix Workflow System automatically investigates failed workflows, generates fixes, and retries them - creating a self-healing CI/CD pipeline.

## Overview

When a workflow fails, the system can:
1. 🔍 **Investigate** - Analyze logs, error messages, and source code to determine root cause
2. 🛠️ **Generate Fix** - Use Claude AI to create code fixes for the identified issue
3. 📤 **Commit & Push** - Automatically commit fixes to the develop branch
4. 🔄 **Rebuild** - Trigger a system rebuild and restart
5. ✨ **Retry** - Create a new workflow with the original parameters

## Architecture

```
┌─────────────────┐
│  Workflow Fails │
└────────┬────────┘
         │
         ▼
┌────────────────────┐
│  Auto-Fix Manager  │ ◄─── Configuration
│  (Checks Conditions)│
└────────┬───────────┘
         │
         ▼
┌─────────────────────┐
│ Auto-Fix Script     │
│ (Investigation &    │
│  Fix Generation)    │
└────────┬────────────┘
         │
         ├─── Investigate (Claude AI)
         ├─── Generate Fix (Claude AI)
         ├─── Apply Fix
         ├─── Commit & Push
         ├─── Rebuild & Restart
         └─── Create New Workflow
```

## Components

### 1. Auto-Fix Script (`scripts/auto-fix-workflow.ts`)

The main script that orchestrates the auto-fix process:

```bash
npm run auto-fix <workflow-id>
```

**Process:**
- Gathers workflow information from logs and database
- Uses Claude AI to investigate the failure
- Generates and applies code fixes
- Commits changes to develop branch
- Triggers rebuild & restart
- Creates new workflow with original parameters

### 2. Auto-Fix Manager (`src/utils/auto-fix-manager.ts`)

Manages auto-fix configuration and triggers:

**Features:**
- Configuration management (enabled/disabled, cooldowns, limits)
- Workflow eligibility checks
- Attempt tracking and limits
- Cooldown periods to prevent fix loops

### 3. Orchestrator Integration

The orchestrator automatically triggers auto-fix when workflows fail (if enabled):

```typescript
// Orchestrator checks conditions after workflow failure
if (autoFixManager.shouldTriggerAutoFix(workflowId, workflowType)) {
  autoFixManager.triggerAutoFix(workflowId);
}
```

### 4. API Routes (`src/api-routes.ts`)

REST API for managing auto-fix:

- `GET /api/auto-fix/config` - Get current configuration
- `PUT /api/auto-fix/config` - Update configuration
- `POST /api/workflows/:id/auto-fix` - Manually trigger auto-fix
- `GET /api/workflows/:id/auto-fix/status` - Check auto-fix status

### 5. Slash Command (`.claude/commands/auto-fix-workflow.md`)

Claude Code command for manual triggering:

```
/auto-fix-workflow 102
```

## Configuration

Edit `config/auto-fix-config.json`:

```json
{
  "enabled": false,                    // Master enable/disable
  "autoTriggerOnFailure": false,       // Auto-trigger on workflow failures
  "maxAutoFixes": 3,                   // Max attempts per workflow
  "cooldownMinutes": 30,               // Cooldown between attempts
  "excludedErrorTypes": [              // Error types to skip
    "infrastructure_error",
    "api_error"
  ],
  "includedWorkflowTypes": [           // Workflow types to auto-fix
    "feature",
    "bugfix",
    "refactor"
  ],
  "notifyOnAutoFix": true              // Enable notifications
}
```

### Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `enabled` | boolean | Master switch for auto-fix system |
| `autoTriggerOnFailure` | boolean | Automatically trigger on failures |
| `maxAutoFixes` | number | Maximum attempts per workflow |
| `cooldownMinutes` | number | Minutes between auto-fix attempts |
| `excludedErrorTypes` | string[] | Error types to exclude from auto-fix |
| `includedWorkflowTypes` | string[] | Workflow types eligible for auto-fix |
| `notifyOnAutoFix` | boolean | Send notifications on auto-fix |

## Usage

### Manual Trigger (CLI)

```bash
cd AIDeveloper
npm run auto-fix 102
```

### Manual Trigger (API)

```bash
curl -X POST http://localhost:3000/api/workflows/102/auto-fix
```

### Manual Trigger (Claude Code)

```
/auto-fix-workflow 102
```

### Automatic Trigger

Enable in configuration:

```json
{
  "enabled": true,
  "autoTriggerOnFailure": true
}
```

The system will automatically fix eligible failures.

## Error Types

The system classifies errors into categories:

| Error Type | Auto-Fixable | Example |
|------------|--------------|---------|
| `code_error` | ✅ Yes | Type mismatch, undefined variables |
| `validation_error` | ✅ Yes | Schema validation, missing fields |
| `token_limit` | ✅ Yes | Response truncation (uses chunking) |
| `api_error` | ❌ No | Rate limits, API unavailable |
| `infrastructure_error` | ❌ No | Database down, disk full |

## Safety Features

### Cooldown Periods
Prevents infinite fix loops by enforcing cooldown between attempts.

### Attempt Limits
Maximum 3 auto-fix attempts per workflow (configurable).

### Error Type Filtering
Infrastructure and API errors excluded by default.

### Branch Protection
Only commits to develop branch, never to main/master.

### Detailed Commit Messages
Auto-generated commits include:
- Root cause analysis
- Error type classification
- List of files modified
- Auto-fix system attribution

Example:
```
fix: auto-fix workflow 102 - Type mismatch in plan-chunker dependencies field

This fix was automatically generated by the auto-fix-workflow system.

Root Cause: Type mismatch in plan-chunker dependencies field
Failed Stage: code
Error Type: code_error

Files modified:
- AIDeveloper/src/utils/plan-chunker.ts

🤖 Generated with Auto-Fix System
```

## API Examples

### Get Configuration

```bash
curl http://localhost:3000/api/auto-fix/config
```

Response:
```json
{
  "config": {
    "enabled": false,
    "autoTriggerOnFailure": false,
    "maxAutoFixes": 3,
    "cooldownMinutes": 30,
    "excludedErrorTypes": ["infrastructure_error", "api_error"],
    "includedWorkflowTypes": ["feature", "bugfix", "refactor"],
    "notifyOnAutoFix": true
  }
}
```

### Update Configuration

```bash
curl -X PUT http://localhost:3000/api/auto-fix/config \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "autoTriggerOnFailure": true
  }'
```

### Trigger Auto-Fix

```bash
curl -X POST http://localhost:3000/api/workflows/102/auto-fix
```

Response:
```json
{
  "success": true,
  "message": "Auto-fix triggered",
  "workflowId": 102
}
```

### Check Auto-Fix Status

```bash
curl http://localhost:3000/api/workflows/102/auto-fix/status
```

Response:
```json
{
  "workflowId": 102,
  "attempts": [
    {
      "workflowId": 102,
      "timestamp": "2025-11-16T07:30:00.000Z",
      "status": "success"
    }
  ],
  "totalAttempts": 1
}
```

## Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                   Workflow 102 Fails                        │
│                   Error: "deps is not iterable"             │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Auto-Fix Manager Checks Eligibility            │
│  ✓ Auto-fix enabled                                         │
│  ✓ Workflow type: feature (included)                        │
│  ✓ No recent attempts (cooldown OK)                         │
│  ✓ Under max attempts (0/3)                                 │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                 Investigation Phase                         │
│  • Read workflow logs and metadata                          │
│  • Gather relevant source files                             │
│  • Claude AI analyzes: plan-chunker.ts line 241             │
│  • Root Cause: deps is object, not array                    │
│  • Classification: code_error                               │
│  • Fixable: true                                            │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Fix Generation                           │
│  • Claude AI generates code fix                             │
│  • Handles deps as both object and array                    │
│  • Extracts dependencies from object structure              │
│  • Apply fix to plan-chunker.ts                             │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                 Commit & Push to Develop                    │
│  • git checkout develop                                     │
│  • git add AIDeveloper/src/utils/plan-chunker.ts            │
│  • git commit -m "fix: auto-fix workflow 102..."            │
│  • git push origin develop                                  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  Rebuild & Restart System                   │
│  • POST /api/system/rebuild-restart                         │
│  • npm run build                                            │
│  • pm2 restart AIDeveloper                                  │
│  • Wait 40 seconds for full restart                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   Create New Workflow                       │
│  • POST /api/workflows/manual                               │
│  • Workflow Type: feature                                   │
│  • Task: <original task description>                        │
│  • New Workflow ID: 103                                     │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                        Success!                             │
│  Original Workflow: #102 (Failed)                           │
│  Fix Commit: a1b2c3d                                        │
│  New Workflow: #103 (Running)                               │
└─────────────────────────────────────────────────────────────┘
```

## Limitations

### Not Suitable For:
- **Infrastructure Errors**: Database down, disk full, network issues
- **API Errors**: External service outages, rate limits
- **Transient Errors**: Random timeouts, network blips
- **Design Issues**: Architectural problems requiring human judgment

### Best For:
- **Code Bugs**: Type errors, undefined variables, logic errors
- **Validation Errors**: Schema mismatches, missing fields
- **Token Limit Issues**: Response truncation (handled with chunking)
- **Reproducible Errors**: Consistent failures with clear root causes

## Monitoring

### Log Files

Auto-fix operations are logged to:
- Main application logs: `logs/app-*.log`
- Auto-fix script output: stdout/stderr

### Database Tracking

The Auto-Fix Manager tracks attempts in memory:

```typescript
// Get auto-fix status
const attempts = autoFixManager.getAutoFixStatus(workflowId);
```

### Notifications

When `notifyOnAutoFix` is enabled:
- Log entries are created
- Future: Webhook notifications, email alerts

## Dependencies

- **@anthropic-ai/sdk**: Claude AI for investigation and fix generation
- **axios**: HTTP client for API calls
- **tsx**: TypeScript execution for scripts

Install dependencies:

```bash
cd AIDeveloper
npm install
```

## Environment Variables

Required in `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

## Troubleshooting

### Auto-Fix Not Triggering

1. Check configuration: `GET /api/auto-fix/config`
2. Verify `enabled: true` and `autoTriggerOnFailure: true`
3. Check workflow type is in `includedWorkflowTypes`
4. Verify error type is not in `excludedErrorTypes`
5. Check attempt count hasn't exceeded `maxAutoFixes`
6. Verify cooldown period has passed

### Auto-Fix Failing

1. Check logs for error messages
2. Verify ANTHROPIC_API_KEY is set
3. Ensure sufficient API credits
4. Check git permissions for commit/push
5. Verify rebuild script is executable

### Fix Not Applied

1. Check git status: `git status`
2. Verify commit was created: `git log`
3. Check if push succeeded: `git log origin/develop`
4. Review auto-fix script output

## Future Enhancements

- [ ] Webhook notifications for auto-fix events
- [ ] Email alerts for failed auto-fixes
- [ ] Slack integration
- [ ] Dashboard UI for auto-fix management
- [ ] Metrics and analytics
- [ ] Machine learning for fix success prediction
- [ ] Multi-attempt fix strategies
- [ ] Integration with code review system

## Contributing

To add new error type handlers:

1. Update `investigateFailure()` in `auto-fix-workflow.ts`
2. Add error classification logic
3. Create fix generation templates
4. Update configuration documentation

## License

MIT

## Support

For issues or questions:
1. Check this documentation
2. Review logs in `logs/app-*.log`
3. Open an issue on GitHub
