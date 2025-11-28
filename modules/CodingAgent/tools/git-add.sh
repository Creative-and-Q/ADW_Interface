#!/bin/bash
# git-add.sh - Stage files for commit
# Usage: git-add.sh [file_pattern]
# If no pattern provided, stages all changes

set -e

PATTERN="${1:-.}"

if [ "$PATTERN" = "." ]; then
    git add -A
    echo "Staged all changes"
else
    git add "$PATTERN"
    echo "Staged: $PATTERN"
fi

# Show what was staged
git status --porcelain | grep "^[MADRC]" || echo "Nothing staged"
