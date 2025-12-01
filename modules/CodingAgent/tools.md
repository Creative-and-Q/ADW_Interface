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
- `file_path` - Path to the file to write (relative to working directory) - FIRST argument
- `content` - Content to write to the file - SECOND argument (REQUIRED)

**Example:**
```bash
./tools/write-file.sh "src/file.ts" "const x = 1;"
./tools/write-file.sh "Dockerfile" "FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD [\"npm\", \"start\"]"
```

**Description:**
Writes content to a file. The directory will be created automatically if it doesn't exist. This is the primary tool for creating and modifying code files.

**IMPORTANT:** Content MUST be passed as the second argument. Stdin is NOT supported. The script will fail if no content argument is provided.

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

## Git Tools

### git-status.sh

Shows the current git status of the working directory.

**Parameters:** None

**Example:**
```bash
./tools/git-status.sh
```

**Description:**
Returns modified, staged, and untracked files in porcelain format. Use this to check what has changed before committing.

### git-add.sh

Stages files for commit.

**Parameters:**
- `file_pattern` - (Optional) File or pattern to stage. Defaults to "." (all changes)

**Example:**
```bash
./tools/git-add.sh "src/components/Button.tsx"
./tools/git-add.sh "."
```

**Description:**
Stages files for the next commit. Use "." to stage all changes.

### git-commit.sh

Commits staged changes.

**Parameters:**
- `message` - Commit message (required)

**Example:**
```bash
./tools/git-commit.sh "feat: add new Button component"
```

**Description:**
Creates a commit with the staged changes. Returns the commit hash on success.

### git-diff.sh

Shows changes in the working directory.

**Parameters:**
- `file_path` - (Optional) Specific file to show diff for

**Example:**
```bash
./tools/git-diff.sh
./tools/git-diff.sh "src/components/Button.tsx"
```

**Description:**
Shows a summary of unstaged and staged changes. Useful for reviewing changes before committing.

### git-push.sh

Pushes commits to remote repository.

**Parameters:**
- `remote` - (Optional) Remote name, defaults to "origin"
- `branch` - (Optional) Branch name, defaults to current branch

**Example:**
```bash
./tools/git-push.sh
./tools/git-push.sh "origin" "feature-branch"
```

**Description:**
Pushes local commits to the remote repository.

## Git Permissions

- ✅ Check git status
- ✅ Stage files
- ✅ Commit changes
- ✅ View diffs
- ✅ Push to remote

## Docker Tools

### docker-build.sh

Builds a Docker image from a Dockerfile.

**Parameters:**
- `image_name` - (Optional) Name for the image, defaults to "app"
- `dockerfile_path` - (Optional) Path to Dockerfile, defaults to "Dockerfile"

**Example:**
```bash
./tools/docker-build.sh "myapp"
./tools/docker-build.sh "myapp" "Dockerfile"
./tools/docker-build.sh "frontend" "frontend/Dockerfile"
```

**Description:**
Builds a Docker image from the specified Dockerfile. Reports success/failure and shows image details.

### docker-compose-up.sh

Starts Docker Compose services.

**Parameters:**
- `compose_file` - (Optional) Path to docker-compose.yml, defaults to "docker-compose.yml"
- `--build` - (Optional) Rebuild images before starting

**Example:**
```bash
./tools/docker-compose-up.sh
./tools/docker-compose-up.sh "docker-compose.yml" "--build"
```

**Description:**
Starts all services defined in docker-compose.yml in detached mode. Shows running containers after startup.

### docker-compose-down.sh

Stops Docker Compose services.

**Parameters:**
- `compose_file` - (Optional) Path to docker-compose.yml, defaults to "docker-compose.yml"
- `--volumes` - (Optional) Also remove volumes

**Example:**
```bash
./tools/docker-compose-down.sh
./tools/docker-compose-down.sh "docker-compose.yml" "--volumes"
```

**Description:**
Stops and removes all containers defined in docker-compose.yml.

### docker-validate.sh

Validates Docker configuration files for best practices.

**Parameters:** None

**Example:**
```bash
./tools/docker-validate.sh
```

**Description:**
Checks for presence and quality of Docker configuration:
- Verifies Dockerfile exists and follows best practices (HEALTHCHECK, EXPOSE, version pinning)
- Validates docker-compose.yml syntax and best practices (healthchecks, restart policies)
- Checks for .dockerignore
- Reports errors and warnings

## Docker Permissions

- ✅ Build Docker images
- ✅ Start Docker Compose services
- ✅ Stop Docker Compose services
- ✅ Validate Docker configuration

## Docker Best Practices

When creating Docker files, follow these guidelines:

1. **Dockerfile Best Practices:**
   - Use multi-stage builds for smaller images
   - Pin base image versions (e.g., `node:18-alpine` not `node:latest`)
   - Include HEALTHCHECK instructions
   - Use EXPOSE to document ports
   - Run as non-root user when possible

2. **docker-compose.yml Best Practices:**
   - Define healthchecks for all services
   - Use restart policies (e.g., `unless-stopped`)
   - Use named volumes for persistent data
   - Use custom networks for service isolation

3. **.dockerignore:**
   - Always create .dockerignore to exclude unnecessary files
   - Exclude: node_modules, .git, .env files, build artifacts




