#!/bin/bash

# List directory contents (read-only)
# Usage: ./list-directory.sh [directory_path]

set -e

DIR_PATH="${1:-.}"

# Ensure path is within working directory (security check)
if [[ "$DIR_PATH" == /* ]]; then
  echo "Error: Absolute paths are not allowed. Use relative paths from working directory."
  exit 1
fi

if [[ "$DIR_PATH" == ..* ]]; then
  echo "Error: Paths outside working directory are not allowed."
  exit 1
fi

# List directory
if [ -d "$DIR_PATH" ]; then
  ls -la "$DIR_PATH"
else
  echo "Error: Directory not found: $DIR_PATH"
  exit 1
fi




