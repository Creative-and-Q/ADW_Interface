# CodeDocumentationAgent Tools

This document describes the tools available to the CodeDocumentationAgent. This agent has **read and write access** - it can read code files and write documentation files.

## Available Tools

### read-file.sh

Reads the contents of a file.

**Parameters:**
- `file_path` - Path to the file to read (relative to working directory)

**Example:**
```bash
./tools/read-file.sh "src/components/Button.tsx"
```

**Description:**
Reads and returns the contents of a file. Useful for understanding code that needs to be documented.

### write-file.sh

Writes content to a file. Creates the file if it doesn't exist, overwrites if it does.

**Parameters:**
- `file_path` - Path to the file to write (relative to working directory)
- `content` - Content to write to the file (passed via stdin or as argument)

**Example:**
```bash
echo "# Button Component" | ./tools/write-file.sh "docs/components/Button.md"
```

**Description:**
Writes content to a file. The directory will be created automatically if it doesn't exist. This is the primary tool for creating documentation files.

**Note:** Content can be passed via stdin or as a second argument. Documentation files are typically written in Markdown format (.md).

## Tool Permissions

**READ AND WRITE ACCESS**: CodeDocumentationAgent can:
- ✅ Read files
- ✅ Write documentation files

**Restrictions:**
- All operations are restricted to the working directory
- Cannot access files outside the working directory
- Focuses on documentation generation, not code modification



