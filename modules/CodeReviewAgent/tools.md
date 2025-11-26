# CodeReviewAgent Tools

This document describes the tools available to the CodeReviewAgent. **All tools are read-only** - this agent cannot write, modify, or copy files.

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

### analyze-code.sh

Analyzes code for quality, security, and best practices.

**Parameters:**
- `file_path` - Path to the file to analyze (relative to working directory)

**Example:**
```bash
./tools/analyze-code.sh "src/components/Button.tsx"
```

**Description:**
Performs static analysis on code files to identify:
- Code quality issues
- Security vulnerabilities
- Best practice violations
- Potential bugs
- Performance concerns

**Restrictions:**
- Read-only analysis
- Cannot modify files
- Cannot execute code

## Tool Restrictions

**CRITICAL**: CodeReviewAgent has **READ-ONLY** access. It can:
- ✅ Read files
- ✅ Analyze code

It **CANNOT**:
- ❌ Write files
- ❌ Modify files
- ❌ Copy files
- ❌ Delete files
- ❌ Create directories
- ❌ Execute code

All tools enforce these restrictions at the script level.



