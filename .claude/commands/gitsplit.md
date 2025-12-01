---
description: Split uncommitted changes into multiple logical commits with per-file hunk splitting
argument-hint: [optional: commit strategy hint]
model: sonnet
allowed_tools: [Bash, Read]
---

# Git Split Commits

Intelligently analyze and break down a large set of uncommitted changes into multiple logical commits. This command examines all changed files in the working directory, groups them by functional relationships (features with their related fixes/refactors), and autonomously creates a series of well-structured conventional commits until all changes are committed. When a single file contains multiple unrelated changes, the command uses git's patch mode to split hunks within that file across appropriate commits.

## Instructions

- **IMPORTANT**: This command will analyze ALL changes in the working directory (both staged and unstaged)
- **IMPORTANT**: Group changes by functional relationships, NOT by change type
  - Features and their related bug fixes should be committed together
  - Components and their supporting changes (client + server + docs) should be committed together
  - Changes that depend on each other or work together should be in the same commit
  - Module boundaries matter more than whether it's a feat/fix/refactor
- **IMPORTANT**: Never mix unrelated changes in a single commit
- **IMPORTANT**: When a single file has multiple unrelated changes, use git patch mode to split hunks
  - Analyze each file's diff to identify distinct change groups (hunks)
  - Stage only the hunks related to each commit using `git add -p` or line-range staging
  - Commit related hunks together across all files, leaving unrelated hunks for subsequent commits
- Each commit must follow conventional commit format: `<type>: <description>`
- Commit types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`
- Use the primary type for the commit (if mostly a feature with a small fix, use `feat`)
- **Use your own discretion** - commit autonomously without asking for approval
- Report each commit as it's created so the user can track progress
- Continue iteratively until all changes are committed
- **NEVER** commit sensitive files like `.env`, credentials, API keys, or secrets
- Skip files that should be in `.gitignore` but aren't
- If the repository is already clean (no changes), inform the user and exit

## Relevant Files

- `.gitignore` - Contains patterns for files that should not be committed
- All files in working directory with changes (tracked by `git status`)

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Check Git Status

- Run `git status` to see all untracked and modified files
- Run `git diff` to see unstaged changes in detail
- Run `git diff --staged` to see already staged changes
- If no changes exist, inform the user and exit
- If sensitive files are detected (.env, credentials, API keys), STOP and warn the user

### 2. Analyze and Group Changes

- Review all changed files and understand what was modified
- **Analyze each file's diff** to identify if it contains multiple unrelated change groups
  - Use `git diff <file>` to examine the changes in detail
  - Identify distinct hunks or sections that belong to different logical changes
  - Note which hunks should be grouped together across different files
- Group changes into logical commit units based on **functional relationships**:
  - **Feature + Related Changes**: Group a feature with its bug fixes, refactors, tests, and docs together
  - **Component Cohesion**: Group all parts of a component (client UI + server API + database + docs) together
  - **Functional Modules**: Group changes to a module even if they're different types (feat/fix/refactor)
  - **Dependency Groups**: Group changes that depend on each other or enable each other
  - **Cross-File Hunks**: Group specific hunks from different files that belong to the same logical change
- Consider the following grouping principles:
  1. What changes work together to accomplish a single functional goal?
  2. What changes touch the same feature or component?
  3. What changes would be reviewed together by a developer?
  4. What changes depend on each other to work correctly?
  5. Can a file's changes be split into multiple independent hunks?
- Determine the primary commit type based on the most significant change in the group
  - If group contains a new feature + small fixes, use `feat`
  - If group contains mostly fixes to existing code, use `fix`
  - If group contains pure refactoring + minor fixes, use `refactor`
  - If group contains only configuration/deps, use `chore`
  - If group contains only documentation, use `docs`
- Ensure each group represents an atomic, independently reviewable change
- Separate only truly unrelated changes into different commits
- **Plan hunk-level staging** for files that need partial commits

### 3. Execute Commits Iteratively

For each commit group identified:

- Unstage all currently staged files with `git reset`
- **For each file in the commit group**:
  - If the **entire file** belongs to this commit: `git add <file>`
  - If only **specific hunks** belong to this commit:
    - Identify the line ranges or hunks that belong to this commit
    - Use `git add -p <file>` and respond appropriately to each hunk prompt
    - OR use `git add --patch <file>` with automated responses based on hunk analysis
    - OR use line-range staging if git version supports it
    - Ensure only related hunks are staged for this commit
- Verify staged changes match the commit intent:
  - Run `git diff --staged` to review exactly what will be committed
  - Confirm no unrelated changes are included
  - Confirm all related changes across all files are included
- Create the commit with `git commit -m "<type>: <description>"`
- Verify the commit was created successfully with `git log -1 --oneline`
- Report the commit immediately to show progress:
  - Commit hash and message
  - Number of files committed (including partial files)
  - Brief description of what was included
  - Note any files that were partially committed with hunks remaining
- Continue to the next commit group

### 4. Final Verification

- Run `git status` to ensure all changes have been committed
- Run `git log --oneline -n <number of commits created>` to show the series of commits created
- Report summary:
  - Total number of commits created
  - List of all commit messages
  - Confirmation that working directory is clean

## Notes

- This command is designed for situations where significant work was done without regular commits
- This command operates autonomously - it makes intelligent decisions about grouping and commits without asking for approval
- Each commit should be small enough to review independently but large enough to be meaningful
- Commit messages should follow imperative mood: "add feature" not "added feature"
- Features and their supporting changes (fixes, refactors, docs, tests) are grouped together functionally
- The command maintains the conventional commit format to keep git history clean and searchable
- Users can always amend or rebase commits after creation if grouping needs adjustment
- For very large changesets (50+ files), group by major functional modules/components
- Prioritize functional relationships over change type when grouping
- A commit with mostly feature work plus small fixes should use `feat:` as the type
- **Hunk-level splitting** allows for maximum commit precision - a single file can contribute to multiple commits
- When using `git add -p`, analyze each hunk's purpose and relationship to the current commit
- Partial file commits are powerful but require careful review of staged changes before committing

## Example Usage

### Example 1: Feature with Related Fixes

User has 15 files changed across client and server - authentication feature with related fixes:

```bash
/gitsplit
```

**Agent autonomously analyzes and commits:**
```
Analyzing 15 changed files...

✓ Commit a1b2c3d: feat: add user authentication system with password fixes
  Files: 7 (LoginScreen.tsx, PasswordInput.tsx, auth.ts, auth.ts, auth.ts, middleware/auth.ts, VoidChat.tsx)
  Includes: Full auth system + password masking fix + WebSocket auth integration

✓ Commit e4f5g6h: feat: add Neo4j room system with player routing
  Files: 3 (neo4j.ts, player.ts, README.md)
  Includes: Room system + player location tracking + documentation

✓ Commit i7j8k9l: chore: update dependencies and configuration
  Files: 3 (package.json, bun.lock, tsconfig.json)
  Includes: Dependency updates for new features

Summary: 3 commits created, working directory is clean
```

### Example 2: Large Refactoring with Multiple Components

User has 30+ files changed from restructuring services:

```bash
/gitsplit
```

**Agent autonomously analyzes and commits:**
```
Analyzing 32 changed files...

✓ Commit a1b2c3d: refactor: restructure cardinal service module with route updates
  Files: 15 (cardinal/*.ts, routes/auth.ts, routes/chat.ts, routes/player.ts)
  Includes: New cardinal service structure + all route updates to use new imports

✓ Commit e4f5g6h: refactor: update client API for restructured backend
  Files: 2 (client.ts, VoidChat.tsx)
  Includes: Client API changes + component updates for new endpoints

✓ Commit i7j8k9l: docs: document new service architecture
  Files: 2 (README.md, cardinal/README.md)
  Includes: Architecture documentation for cardinal services

✓ Commit m0n1o2p: chore: update TypeScript config for new structure
  Files: 2 (tsconfig.json, server/tsconfig.json)
  Includes: TypeScript paths and module resolution updates

Summary: 4 commits created, working directory is clean
```

### Example 3: Documentation and Config Changes

User has documentation and configuration changes:

```bash
/gitsplit
```

**Agent autonomously analyzes and commits:**
```
Analyzing 5 changed files...

✓ Commit a1b2c3d: docs: add comprehensive API documentation
  Files: 3 (README.md, server/README.md, API.md)
  Includes: Complete API documentation across all docs

✓ Commit e4f5g6h: chore: update development environment configuration
  Files: 2 (.env.example, docker-compose.yml)
  Includes: Docker and environment setup updates

Summary: 2 commits created, working directory is clean
```

### Example 4: Clean Repository

User runs the command when everything is already committed:

```bash
/gitsplit
```

**Agent Response:**
```
Checking git status...
Working directory is clean - no changes to commit.
```

### Example 5: Complex Multi-Feature Changeset

User has multiple unrelated features and fixes:

```bash
/gitsplit
```

**Agent autonomously groups by functional relationships:**
```
Analyzing 28 changed files...

✓ Commit a1b2c3d: feat: add conversation memory system with caching
  Files: 8 (conversationMemory.ts, cache.ts, chat.ts, VoidChat.tsx, README.md)
  Includes: Memory service + cache layer + chat integration + docs

✓ Commit e4f5g6h: feat: implement NPC generator with conversation handler
  Files: 6 (npcGenerator.ts, npcConversation.ts, worldGenerator.ts, prompts/npc-*.txt)
  Includes: NPC generation + conversation logic + prompts

✓ Commit i7j8k9l: fix: resolve Neo4j connection timeout and query issues
  Files: 3 (neo4j.ts, player.ts, server/index.ts)
  Includes: Connection handling + query optimization + startup fixes

✓ Commit m0n1o2p: chore: update dependencies for Neo4j and OpenRouter
  Files: 2 (package.json, bun.lock)
  Includes: Package updates required for new features

Summary: 4 commits created, working directory is clean
```

### Example 6: Single File with Multiple Unrelated Changes

User has one file (ConversationService.ts) with authentication changes AND caching changes:

```bash
/gitsplit
```

**Agent autonomously analyzes and uses patch mode:**
```
Analyzing 1 changed file with 8 hunks...

Detected multiple unrelated changes in ConversationService.ts:
  - Hunks 1-3: Authentication middleware integration
  - Hunks 4-6: Response caching implementation
  - Hunks 7-8: Debug logging improvements

✓ Commit a1b2c3d: feat: integrate authentication middleware in conversation service
  Files: 1 (ConversationService.ts - hunks 1-3)
  Includes: Auth checks and user validation logic

✓ Commit e4f5g6h: feat: add response caching to conversation service
  Files: 1 (ConversationService.ts - hunks 4-6)
  Includes: Cache implementation and invalidation logic

✓ Commit i7j8k9l: chore: add debug logging to conversation service
  Files: 1 (ConversationService.ts - hunks 7-8)
  Includes: Enhanced debugging output

Summary: 3 commits created from 1 file using hunk-level staging, working directory is clean
```

### Example 7: Mixed File and Hunk-Level Splitting

User has 5 files, but one file (chat.ts) contains changes for two different features:

```bash
/gitsplit
```

**Agent autonomously mixes full-file and hunk-level staging:**
```
Analyzing 5 changed files...

Detected partial commits needed:
  - chat.ts has authentication changes (hunks 1-4) and typing indicator changes (hunks 5-7)

✓ Commit a1b2c3d: feat: add authentication to chat system
  Files: 3 (LoginScreen.tsx, auth.ts, chat.ts - hunks 1-4 only)
  Includes: Full auth UI + middleware + partial chat.ts integration

✓ Commit e4f5g6h: feat: implement typing indicators in chat
  Files: 3 (TypingIndicator.tsx, VoidChat.tsx, chat.ts - hunks 5-7 only)
  Includes: Typing indicator component + UI integration + remaining chat.ts logic

Summary: 2 commits created with 1 file split across commits, working directory is clean
```

## Arguments Format

The command accepts no arguments:

```bash
/gitsplit    # Analyze and split all uncommitted changes
```

