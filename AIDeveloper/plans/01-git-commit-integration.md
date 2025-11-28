# Issue 1: Git Commit/Push Integration

## Problem
Workflow 312 spawned ~3,800 sub-workflows but no changes were committed to git or pushed to GitHub.

## Root Cause
- CodingAgent only has file tools: `read-file.sh`, `write-file.sh`, `copy-file.sh`, `create-directory.sh`
- No git tools exist at any level
- Workflows run on branches but never commit changes

## Implementation Plan

### Phase 1: Add Git Tools to CodingAgent
- [x] `tools/git-status.sh` - Check for uncommitted changes
- [x] `tools/git-add.sh` - Stage files for commit
- [x] `tools/git-commit.sh` - Commit staged changes
- [x] `tools/git-diff.sh` - Show what changed
- [x] Update `tools.md` documentation

### Phase 2: Auto-Commit in WorkflowOrchestrator
- [x] After CodingAgent completes successfully, auto-commit changes
- [x] Commit message: "Workflow #ID: [task description]"
- [x] Configurable via workflow metadata

### Phase 3: Push on Root Workflow Completion
- [x] When root workflow (depth=0) completes, push to remote
- [x] Only push if there are commits to push

## Files Modified
- `modules/CodingAgent/tools/git-status.sh` (new)
- `modules/CodingAgent/tools/git-add.sh` (new)
- `modules/CodingAgent/tools/git-commit.sh` (new)
- `modules/CodingAgent/tools/git-diff.sh` (new)
- `modules/CodingAgent/tools.md` (updated)
- `modules/WorkflowOrchestrator/index.ts` (updated)

## Status: IN PROGRESS
