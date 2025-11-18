# CodeTestingAgent Tools

This document describes the tools available to the CodeTestingAgent. This agent has **read, write, and execute access** - it can read code, write test files, and execute tests.

## Available Tools

### read-file.sh

Reads the contents of a file.

**Parameters:**
- `file_path` - Path to the file to read (relative to working directory)

**Example:**
```bash
./tools/read-file.sh "src/components/Button.tsx"
```

**Description:**
Reads and returns the contents of a file. Useful for understanding code that needs to be tested.

### write-file.sh

Writes content to a file. Creates the file if it doesn't exist, overwrites if it does.

**Parameters:**
- `file_path` - Path to the file to write (relative to working directory)
- `content` - Content to write to the file (passed via stdin or as argument)

**Example:**
```bash
echo "describe('Button', () => { ... });" | ./tools/write-file.sh "tests/Button.test.ts"
```

**Description:**
Writes content to a file. The directory will be created automatically if it doesn't exist. This is the primary tool for creating test files.

**Note:** Content can be passed via stdin or as a second argument.

### run-tests.sh

Executes tests using the project's test runner.

**Parameters:**
- `test_path` - Optional path to specific test file or directory (relative to working directory). If not provided, runs all tests.

**Example:**
```bash
./tools/run-tests.sh  # Run all tests
./tools/run-tests.sh "tests/Button.test.ts"  # Run specific test file
```

**Description:**
Executes tests using the project's configured test runner (e.g., Jest, Mocha, Vitest). Returns test results including pass/fail status and coverage information.

**Note:** The test runner is determined automatically based on the project configuration (package.json scripts, test framework files, etc.).

## Tool Permissions

**READ, WRITE, AND EXECUTE ACCESS**: CodeTestingAgent can:
- ✅ Read files
- ✅ Write test files
- ✅ Execute tests

**Restrictions:**
- All operations are restricted to the working directory
- Cannot access files outside the working directory
- Can only execute test-related commands (not arbitrary code execution)

