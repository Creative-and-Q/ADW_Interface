# CodePlannerAgent Tools

This document describes the tools available to the CodePlannerAgent. **All tools are read-only** - this agent cannot write, modify, or copy files.

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
Reads and returns the contents of a file. This is a read-only operation - no modifications are made to the file.

**Restrictions:**
- Can only read files within the working directory
- Cannot read files outside the working directory
- No write permissions

### list-directory.sh

Lists the contents of a directory.

**Parameters:**
- `directory_path` - Path to the directory to list (relative to working directory, optional, defaults to ".")

**Example:**
```bash
./tools/list-directory.sh "src/components"
./tools/list-directory.sh  # Lists current directory
```

**Description:**
Lists all files and directories in the specified directory. Useful for understanding codebase structure.

**Restrictions:**
- Can only list directories within the working directory
- Cannot access directories outside the working directory

### analyze-codebase.sh

Analyzes the codebase structure and provides insights.

**Parameters:**
- `target_path` - Path to analyze (relative to working directory, optional, defaults to ".")

**Example:**
```bash
./tools/analyze-codebase.sh "src"
./tools/analyze-codebase.sh  # Analyzes entire working directory
```

**Description:**
Analyzes the codebase structure, identifies file types, dependencies, and provides a high-level overview. This is useful for understanding the project structure before creating an implementation plan.

**Restrictions:**
- Read-only analysis
- Cannot modify any files
- Cannot execute code

## Tool Restrictions

**CRITICAL**: CodePlannerAgent has **READ-ONLY** access. It can:
- ✅ Read files
- ✅ List directories
- ✅ Analyze codebase structure

It **CANNOT**:
- ❌ Write files
- ❌ Modify files
- ❌ Copy files
- ❌ Delete files
- ❌ Create directories
- ❌ Execute code

All tools enforce these restrictions at the script level.




