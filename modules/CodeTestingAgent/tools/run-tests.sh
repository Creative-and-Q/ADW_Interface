#!/bin/bash

# Run tests
# Usage: ./run-tests.sh [test_path]

set -e

TEST_PATH="${1:-}"

# Ensure path is within working directory if provided (security check)
if [ -n "$TEST_PATH" ]; then
  if [[ "$TEST_PATH" == /* ]]; then
    echo "Error: Absolute paths are not allowed. Use relative paths from working directory."
    exit 1
  fi
  
  if [[ "$TEST_PATH" == ..* ]]; then
    echo "Error: Paths outside working directory are not allowed."
    exit 1
  fi
fi

# Detect test runner from package.json
if [ -f "package.json" ]; then
  # Check for common test commands
  if grep -q '"test"' package.json; then
    TEST_CMD=$(node -e "console.log(require('./package.json').scripts.test || '')")
    
    if [ -n "$TEST_CMD" ]; then
      # Append test path if provided
      if [ -n "$TEST_PATH" ]; then
        TEST_CMD="$TEST_CMD $TEST_PATH"
      fi
      
      echo "Running tests with: $TEST_CMD"
      eval "$TEST_CMD"
      exit $?
    fi
  fi
fi

# Fallback: try common test runners
if command -v jest &> /dev/null; then
  echo "Running tests with Jest"
  if [ -n "$TEST_PATH" ]; then
    jest "$TEST_PATH"
  else
    jest
  fi
elif command -v npm &> /dev/null && npm run test --dry-run &> /dev/null; then
  echo "Running tests with npm test"
  if [ -n "$TEST_PATH" ]; then
    npm test -- "$TEST_PATH"
  else
    npm test
  fi
else
  echo "Error: No test runner found. Please configure a test script in package.json"
  exit 1
fi




