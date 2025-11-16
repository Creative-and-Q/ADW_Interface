---
description: Automatically investigate, fix, and retry a failed workflow
---

# Auto-Fix Workflow System

This command automatically:
1. 🔍 Investigates the workflow failure
2. 🛠️ Generates and applies a fix
3. 📤 Commits fix to develop branch
4. 🚀 Pushes to remote
5. 🔄 Triggers rebuild & restart
6. ✨ Creates new workflow with original parameters

## Usage

```
/auto-fix-workflow ${WORKFLOW_ID}
```

## What It Does

### Phase 1: Investigation
- Reads workflow logs and metadata
- Analyzes error messages and stack traces
- Identifies root cause using AI
- Determines if error is automatically fixable

### Phase 2: Fix Generation
- Uses Claude to generate code fixes
- Applies fixes to affected files
- Validates changes

### Phase 3: Integration
- Commits fix to develop branch with detailed message
- Pushes changes to remote repository
- Triggers system rebuild & restart

### Phase 4: Retry
- Waits for system to restart
- Creates new workflow with original task description and type
- Returns new workflow ID

## Example Output

```
🔧 Auto-Fix Workflow 102 - Starting...

📊 Step 1: Gathering workflow information...
   - Workflow Type: feature
   - Failed Stage: code
   - Error: deps is not iterable

🔍 Step 2: Investigating failure...
   - Root Cause: Type mismatch in plan-chunker dependencies field
   - Error Type: code_error
   - Fixable: Yes

🛠️  Step 3: Generating fix...
   - Modified: AIDeveloper/src/utils/plan-chunker.ts
   ✅ Fix applied successfully

📤 Step 4: Committing and pushing fix...
   ✅ Changes pushed to develop

🔄 Step 5: Triggering rebuild & restart...
   ✅ Rebuild & restart triggered

⏳ Waiting for system to restart (30 seconds)...

🚀 Step 6: Creating new workflow...
   ✅ New workflow created: #103

✅ Auto-fix workflow completed successfully!
   - Original workflow: #102
   - New workflow: #103
   - Fix commit: a1b2c3d
```

## When To Use

Use this command when:
- A workflow fails due to a code bug
- The error is reproducible
- You want to automatically fix and retry the workflow

**Not suitable for:**
- Infrastructure errors (database down, API unavailable)
- Transient errors (network timeouts)
- Errors requiring human judgment

## Safety Features

- Only commits to develop branch
- Creates detailed commit messages
- Preserves original workflow for reference
- Waits for rebuild before retrying

---

**Executing auto-fix for workflow ${WORKFLOW_ID}...**

Please run the auto-fix script manually from the terminal:

```bash
cd AIDeveloper
npm run auto-fix ${WORKFLOW_ID}
```

Or execute directly:

```bash
tsx AIDeveloper/scripts/auto-fix-workflow.ts ${WORKFLOW_ID}
```

**Note:** This is a powerful command that will automatically commit and push changes. Review the investigation report carefully before allowing it to proceed.
