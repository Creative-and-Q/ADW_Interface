#!/bin/bash
# git-diff.sh - Show changes in working directory
# Usage: git-diff.sh [file_path]

set -e

FILE="${1:-}"

if [ -n "$FILE" ]; then
    git diff "$FILE" 2>/dev/null || git diff --cached "$FILE" 2>/dev/null || echo "No changes for $FILE"
else
    # Show summary of all changes
    echo "=== Unstaged changes ==="
    git diff --stat 2>/dev/null || echo "None"
    echo ""
    echo "=== Staged changes ==="
    git diff --cached --stat 2>/dev/null || echo "None"
fi
