#!/bin/bash

# Create directory
# Usage: ./create-directory.sh <directory_path>

set -e

DIR_PATH="$1"

if [ -z "$DIR_PATH" ]; then
  echo "Error: directory_path is required"
  exit 1
fi

# Ensure path is within working directory (security check)
if [[ "$DIR_PATH" == /* ]]; then
  echo "Error: Absolute paths are not allowed. Use relative paths from working directory."
  exit 1
fi

if [[ "$DIR_PATH" == ..* ]]; then
  echo "Error: Paths outside working directory are not allowed."
  exit 1
fi

# Create directory
mkdir -p "$DIR_PATH"
echo "Directory created: $DIR_PATH"

