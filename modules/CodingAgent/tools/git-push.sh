#!/bin/bash
# git-push.sh - Push commits to remote
# Usage: git-push.sh [remote] [branch]

set -e

REMOTE="${1:-origin}"
BRANCH="${2:-$(git branch --show-current)}"

# Check if there are commits to push
LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE_REF=$(git rev-parse "$REMOTE/$BRANCH" 2>/dev/null || echo "")

if [ "$LOCAL" = "$REMOTE_REF" ]; then
    echo "Already up to date with $REMOTE/$BRANCH"
    exit 0
fi

# Push to remote
git push "$REMOTE" "$BRANCH"
echo "Pushed to $REMOTE/$BRANCH"
