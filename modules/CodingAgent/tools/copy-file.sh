#!/bin/bash

# Copy file
# Usage: ./copy-file.sh <source_path> <destination_path>

set -e

SOURCE_PATH="$1"
DEST_PATH="$2"

if [ -z "$SOURCE_PATH" ] || [ -z "$DEST_PATH" ]; then
  echo "Error: source_path and destination_path are required"
  exit 1
fi

# Ensure paths are within working directory (security check)
for path in "$SOURCE_PATH" "$DEST_PATH"; do
  if [[ "$path" == /* ]]; then
    echo "Error: Absolute paths are not allowed. Use relative paths from working directory."
    exit 1
  fi
  
  if [[ "$path" == ..* ]]; then
    echo "Error: Paths outside working directory are not allowed."
    exit 1
  fi
done

# Check source exists
if [ ! -f "$SOURCE_PATH" ]; then
  echo "Error: Source file not found: $SOURCE_PATH"
  exit 1
fi

# Create destination directory if needed
DEST_DIR=$(dirname "$DEST_PATH")
if [ "$DEST_DIR" != "." ] && [ ! -d "$DEST_DIR" ]; then
  mkdir -p "$DEST_DIR"
fi

# Copy file
cp "$SOURCE_PATH" "$DEST_PATH"
echo "File copied: $SOURCE_PATH -> $DEST_PATH"



