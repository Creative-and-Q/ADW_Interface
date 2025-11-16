# ADR 003: Test Agent Workflow Directory Isolation and Build Validation

**Date:** 2025-11-16

**Status:** Accepted

## Context

The test agent was running tests in the wrong directory (`process.cwd()` - the AIDeveloper backend directory) instead of in the workflow's isolated repository directory. This caused several critical issues:

1. **Tests were never actually executed** - The test agent would show "0 passed, 0 failed" because no tests existed in the backend directory
2. **TypeScript compilation errors were not detected** - Workflows could "complete successfully" with broken TypeScript code
3. **Build failures were not caught** - Code that wouldn't compile could pass through the testing stage
4. **False positives** - Workflows were marked as successful when they actually had critical build failures

### Example Failure

Workflow 96 created TypeScript code with broken imports (`.js` files instead of `.tsx`/`.ts`), missing type declarations, and unused imports. The test agent marked it as successful because:
- It didn't run tests in the workflow directory
- It didn't validate TypeScript compilation
- The review agent relied on test results that were inaccurate

## Decision

We have updated the test agent to:

### 1. Use Workflow Directory for All Operations

**Before:**
```typescript
private async runTests(): Promise<TestResults> {
  const { stdout } = await execAsync('npm test -- --json', {
    cwd: process.cwd(),  // ❌ Wrong directory
    timeout: 120000,
  });
}

private async writeTestFiles(testFiles: Array<{ path: string; content: string }>): Promise<string[]> {
  const fullPath = path.resolve(process.cwd(), testFile.path);  // ❌ Wrong directory
  await writeFile(testFile.path, testFile.content);
}
```

**After:**
```typescript
async execute(input: AgentInput): Promise<AgentOutput> {
  if (!input.workingDir) {
    throw new Error('workingDir is required for test agent');
  }
  // ... use input.workingDir for all operations
}

private async runTests(workingDir: string): Promise<TestResults> {
  const { stdout } = await execAsync('npm test -- --json', {
    cwd: workingDir,  // ✅ Correct workflow directory
    timeout: 120000,
  });
}

private async writeTestFiles(
  testFiles: Array<{ path: string; content: string }>,
  workingDir: string
): Promise<string[]> {
  const absolutePath = path.join(workingDir, testFile.path);  // ✅ Correct workflow directory
  await fs.writeFile(absolutePath, testFile.content, 'utf-8');
}
```

### 2. Add TypeScript Build Validation

We added a `runBuildCheck()` method that:
- Checks for `tsconfig.json` to detect TypeScript projects
- Runs `npx tsc --noEmit` to validate compilation without generating output
- Returns build errors before running tests
- **Fails the workflow immediately** if TypeScript compilation fails

```typescript
private async runBuildCheck(workingDir: string): Promise<{ success: boolean; errors: string[] }> {
  // Check for tsconfig.json
  const tsconfigPath = path.join(workingDir, 'tsconfig.json');
  try {
    await fs.access(tsconfigPath);
  } catch {
    // Not a TypeScript project, skip
    return { success: true, errors: [] };
  }

  // Run TypeScript compilation check
  const { stderr } = await execAsync('npx tsc --noEmit', {
    cwd: workingDir,
    timeout: 120000,
  });

  // Parse and return errors
  // ...
}
```

### 3. Fail Fast on Build Errors

The test agent now follows this order:
1. Generate tests (AI-powered)
2. Write test files to workflow directory
3. **Run TypeScript build check** ⬅️ NEW
4. **If build fails, return immediately with failure** ⬅️ NEW
5. Run tests (only if build succeeds)
6. Return test results

```typescript
const buildCheck = await this.runBuildCheck(input.workingDir);
if (!buildCheck.success) {
  logger.error('TypeScript build failed', new Error(buildCheck.errors.join('; ')));
  return {
    success: false,
    summary: `Build check failed: ${buildCheck.errors.join('; ')}. Tests were not executed.`,
  };
}
```

## Consequences

### Positive

1. **Accurate test execution** - Tests now run in the correct directory with the actual workflow code
2. **Early error detection** - TypeScript compilation errors are caught before tests run
3. **Prevents broken code from passing** - Workflows with build errors will fail at the testing stage
4. **Better error messages** - Developers see specific TypeScript errors instead of vague "tests passed" messages
5. **Workflow isolation** - Each workflow's tests are completely isolated in their own directory
6. **Faster feedback** - Build failures are detected immediately without running tests

### Negative

1. **Slightly longer execution time** - Running `tsc --noEmit` adds ~10-30 seconds per workflow
2. **Requires TypeScript** - Workflows using TypeScript must have `npx tsc` available (already required for our stack)
3. **More strict** - Some workflows that previously "passed" will now fail (this is actually desirable)

### Migration Impact

- **Existing workflows**: No changes required - the test agent uses the `workingDir` parameter that's already passed by the orchestrator
- **Code artifacts**: Already being created in the workflow directory, now tests will be too
- **Test execution**: Will now accurately reflect build status

## References

- Issue: Workflow 96 completed successfully but had TypeScript build errors
- Related file: `src/agents/test-agent.ts`
- Related ADRs: None (this is a foundational fix)

## Implementation Notes

Changes made to `src/agents/test-agent.ts`:

1. Updated `execute()` method:
   - Requires `input.workingDir`
   - Validates workingDir exists
   - Passes workingDir to all helper methods

2. Updated `writeTestFiles()` method:
   - Accepts `workingDir` parameter
   - Uses `path.join(workingDir, testFile.path)` for absolute paths
   - Writes files with `fs.writeFile()` directly

3. Added `runBuildCheck()` method:
   - Detects TypeScript projects via `tsconfig.json`
   - Runs `npx tsc --noEmit` to validate compilation
   - Returns error list (limited to first 10 errors for readability)

4. Updated `runTests()` method:
   - Accepts `workingDir` parameter
   - Uses `cwd: workingDir` for test execution

5. Updated execution flow:
   - Generate tests → Write tests → **Build check** → Run tests (only if build succeeds)
