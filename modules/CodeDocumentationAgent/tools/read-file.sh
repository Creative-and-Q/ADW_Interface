#!/bin/bash

# Read file contents
# Usage: ./read-file.sh <file_path>

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

# Read file
if [ -f "$FILE_PATH" ]; then
  cat "$FILE_PATH"
else
  echo "Error: File not found: $FILE_PATH"
  exit 1
fi




