#!/bin/bash

# Analyze code for quality, security, and best practices (read-only)
# Usage: ./analyze-code.sh <file_path>

set -e

FILE_PATH="$1"

if [ -z "$FILE_PATH" ]; then
  echo "Error: file_path is required"
  exit 1
fi

# Ensure path is within working directory (security check)
if [[ "$FILE_PATH" == /* ]]; then
  echo "Error: Absolute paths are not allowed. Use relative paths from working directory."
  exit 1
fi

if [[ "$FILE_PATH" == ..* ]]; then
  echo "Error: Paths outside working directory are not allowed."
  exit 1
fi

if [ ! -f "$FILE_PATH" ]; then
  echo "Error: File not found: $FILE_PATH"
  exit 1
fi

echo "=== Code Analysis for: $FILE_PATH ==="
echo ""

# Basic analysis
echo "File size: $(wc -c < "$FILE_PATH") bytes"
echo "Lines of code: $(wc -l < "$FILE_PATH")"
echo ""

# Check for common issues (basic checks)
echo "=== Basic Checks ==="

# Check for TODO/FIXME comments
if grep -q -i "TODO\|FIXME" "$FILE_PATH"; then
  echo "⚠ Found TODO/FIXME comments"
  grep -n -i "TODO\|FIXME" "$FILE_PATH" | head -5
fi

# Check for console.log (might indicate debug code)
if grep -q "console\.log" "$FILE_PATH"; then
  echo "⚠ Found console.log statements (may indicate debug code)"
fi

# Check for long lines (over 120 characters)
LONG_LINES=$(awk 'length > 120 {print NR": "substr($0,1,80)"..."}' "$FILE_PATH" | head -5)
if [ -n "$LONG_LINES" ]; then
  echo "⚠ Found long lines (>120 characters):"
  echo "$LONG_LINES"
fi

echo ""
echo "=== File Type: $(file -b "$FILE_PATH") ==="




