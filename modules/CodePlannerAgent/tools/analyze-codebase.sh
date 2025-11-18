#!/bin/bash

# Analyze codebase structure (read-only)
# Usage: ./analyze-codebase.sh [target_path]

set -e

TARGET_PATH="${1:-.}"

# Ensure path is within working directory (security check)
if [[ "$TARGET_PATH" == /* ]]; then
  echo "Error: Absolute paths are not allowed. Use relative paths from working directory."
  exit 1
fi

if [[ "$TARGET_PATH" == ..* ]]; then
  echo "Error: Paths outside working directory are not allowed."
  exit 1
fi

echo "Analyzing codebase structure at: $TARGET_PATH"
echo ""

# Count files by type
echo "=== File Type Summary ==="
find "$TARGET_PATH" -type f -name "*.ts" 2>/dev/null | wc -l | xargs echo "TypeScript files:"
find "$TARGET_PATH" -type f -name "*.tsx" 2>/dev/null | wc -l | xargs echo "TSX files:"
find "$TARGET_PATH" -type f -name "*.js" 2>/dev/null | wc -l | xargs echo "JavaScript files:"
find "$TARGET_PATH" -type f -name "*.json" 2>/dev/null | wc -l | xargs echo "JSON files:"
find "$TARGET_PATH" -type f -name "*.md" 2>/dev/null | wc -l | xargs echo "Markdown files:"

echo ""
echo "=== Directory Structure (top level) ==="
find "$TARGET_PATH" -maxdepth 2 -type d 2>/dev/null | head -20

echo ""
echo "=== Package.json (if exists) ==="
if [ -f "$TARGET_PATH/package.json" ]; then
  cat "$TARGET_PATH/package.json" | grep -E '"name"|"version"|"dependencies"' | head -10
else
  echo "No package.json found"
fi

