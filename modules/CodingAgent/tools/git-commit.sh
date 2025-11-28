#!/bin/bash
# git-commit.sh - Commit staged changes
# Usage: git-commit.sh "commit message"

set -e

MESSAGE="${1:-Auto-commit by CodingAgent}"

# Check if there are staged changes
STAGED=$(git diff --cached --name-only 2>/dev/null | wc -l)

if [ "$STAGED" -eq 0 ]; then
    echo "No staged changes to commit"
    exit 0
fi

# Commit with the provided message
git commit -m "$MESSAGE"

# Output the commit hash
echo "Committed: $(git rev-parse --short HEAD)"
