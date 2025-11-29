#!/bin/bash

# Write content to file
# Usage: ./write-file.sh <file_path> <content>
# Note: Content MUST be provided as second argument (stdin not supported to avoid blocking)

set -e

FILE_PATH="$1"
CONTENT="$2"

if [ -z "$FILE_PATH" ]; then
  echo "Error: file_path is required"
  exit 1
fi

if [ -z "$CONTENT" ]; then
  echo "Error: content is required as second argument"
  echo "Usage: ./write-file.sh <file_path> <content>"
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

# Create directory if it doesn't exist
DIR_PATH=$(dirname "$FILE_PATH")
if [ "$DIR_PATH" != "." ] && [ ! -d "$DIR_PATH" ]; then
  mkdir -p "$DIR_PATH"
fi

# Write content (use printf to handle special characters better than echo)
printf '%s\n' "$CONTENT" > "$FILE_PATH"

echo "File written: $FILE_PATH"




