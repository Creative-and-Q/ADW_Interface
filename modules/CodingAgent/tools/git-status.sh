#!/bin/bash
# git-status.sh - Check git status in the working directory
# Returns: modified files, staged files, untracked files

set -e

# Get git status in porcelain format for easier parsing
git status --porcelain 2>/dev/null || echo "Not a git repository"
