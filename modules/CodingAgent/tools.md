# CodingAgent Tools

This document describes the tools available to the CodingAgent. This agent has **read and write access** - it can read files, write files, create directories, and copy files.

## Available Tools

### list-directory.sh

Lists the contents of a directory.

**Parameters:**
- `directory_path` - Path to the directory to list (relative to working directory, defaults to ".")

**Example:**
```bash
./tools/list-directory.sh "src"
./tools/list-directory.sh "."
```

**Description:**
Lists all files and subdirectories in the specified directory. **Use this FIRST to explore the codebase structure before making changes.**

### read-file.sh

Reads the contents of a file.

**Parameters:**
- `file_path` - Path to the file to read (relative to working directory)

**Example:**
```bash
./tools/read-file.sh "src/components/Button.tsx"
```

**Description:**
Reads and returns the contents of a file. Useful for understanding existing code before making changes.

### write-file.sh

Writes content to a file. Creates the file if it doesn't exist, overwrites if it does.

**Parameters:**
- `file_path` - Path to the file to write (relative to working directory)
- `content` - Content to write to the file (passed via stdin or as argument)

**Example:**
```bash
echo "const x = 1;" | ./tools/write-file.sh "src/file.ts"
```

**Description:**
Writes content to a file. The directory will be created automatically if it doesn't exist. This is the primary tool for creating and modifying code files.

**Note:** Content can be passed via stdin or as a second argument.

### create-directory.sh

Creates a directory (and parent directories if needed).

**Parameters:**
- `directory_path` - Path to the directory to create (relative to working directory)

**Example:**
```bash
./tools/create-directory.sh "src/components/new-feature"
```

**Description:**
Creates a directory and all necessary parent directories. Useful when creating new files in new locations.

### copy-file.sh

Copies a file from one location to another.

**Parameters:**
- `source_path` - Path to the source file (relative to working directory)
- `destination_path` - Path to the destination file (relative to working directory)

**Example:**
```bash
./tools/copy-file.sh "src/components/Button.tsx" "src/components/Button.backup.tsx"
```

**Description:**
Copies a file from the source path to the destination path. The destination directory will be created if it doesn't exist.

## Tool Permissions

**READ AND WRITE ACCESS**: CodingAgent can:
- ✅ List directories
- ✅ Read files
- ✅ Write files
- ✅ Modify files
- ✅ Create directories
- ✅ Copy files

**Restrictions:**
- All operations are restricted to the working directory
- Cannot access files outside the working directory
- Cannot delete files (use write-file.sh to overwrite with empty content if needed)



