# Git Commit Automation

Automatically stage all changes in the working directory, intelligently exclude files that should be ignored, and create a commit with a conventional commit message (feat/fix/chore/docs/refactor/test/style/perf).

## Variables
commit_message_hint: $1

## Instructions

- **IMPORTANT**: This command will stage ALL changes in the working directory that are not ignored by `.gitignore`
- Analyze all changes (both staged and unstaged) to understand what has been modified
- Determine the appropriate conventional commit prefix based on the nature of changes:
  - `feat:` - New features or functionality
  - `fix:` - Bug fixes
  - `chore:` - Maintenance tasks, dependency updates, configuration changes
  - `docs:` - Documentation changes only
  - `refactor:` - Code refactoring without changing functionality
  - `test:` - Adding or updating tests
  - `style:` - Code style/formatting changes
  - `perf:` - Performance improvements
- Generate a concise, descriptive commit message that explains WHAT changed and WHY
- Verify files respect `.gitignore` patterns before staging
- Create the commit with the generated message
- NEVER commit sensitive files like `.env`, credentials, API keys, or secrets
- If `commit_message_hint` is provided, use it to inform the commit message but still apply conventional commit prefix

## Relevant Files

- `.gitignore` - Contains patterns for files that should not be committed
- All files in working directory with changes

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Check Git Status
- Run `git status` to see all untracked and modified files
- Run `git diff` to see unstaged changes
- Run `git diff --staged` to see already staged changes

### 2. Analyze Changes
- Review all changes to understand:
  - What files were added, modified, or deleted
  - What type of changes were made (feature, fix, chore, etc.)
  - Whether any sensitive files are present
- Determine the appropriate conventional commit type
- If sensitive files are detected (.env, credentials, API keys), STOP and warn the user

### 3. Generate Commit Message
- Based on the analysis, generate a commit message with format: `<type>: <description>`
- Description should be:
  - Concise (50-72 characters preferred)
  - In imperative mood ("add feature" not "added feature")
  - Focused on WHAT and WHY, not HOW
- If `commit_message_hint` was provided, incorporate it into the description
- Examples:
  - `feat: add user authentication system`
  - `fix: resolve password masking issue in CLI`
  - `chore: update dependencies and clean up logs`
  - `refactor: simplify world-builder session management`

### 4. Stage All Changes
- Use `git add .` to stage all changes
- Git will automatically respect `.gitignore` patterns

### 5. Create Commit
- Execute `git commit -m "<generated-message>"`
- Verify the commit was created successfully with `git log -1`

### 6. Report Results
- Display the commit hash and message
- Show a summary of what was committed

## Notes

- This command is designed for worktree workflows where changes are isolated on feature branches
- Always review changes before committing to ensure no sensitive data is included
- The conventional commit format helps maintain a clean, searchable git history
- If you need to commit only specific files, use `git add <file>` manually instead of this command
- For more complex commits requiring multiple paragraphs or breaking changes, consider writing the commit message manually

## Example Usage

### Example 1: Simple Feature Commit

User runs the command after adding a new authentication feature:

```bash
/gitcommit
```

Agent analyzes the changes, detects new files in `auth/` directory and related modifications, then:
1. Stages all changes
2. Creates commit: `feat: add user authentication with password hashing`
3. Reports: "Created commit abc123f: feat: add user authentication with password hashing"

### Example 2: Bug Fix Commit

User runs the command after fixing a password masking bug:

```bash
/gitcommit
```

Agent detects changes in `password-utils.ts` fixing a bug, then:
1. Stages all changes
2. Creates commit: `fix: properly mask password input in CLI prompts`
3. Reports: "Created commit def456a: fix: properly mask password input in CLI prompts"

### Example 3: Commit with Hint

User provides a hint for the commit message:

```bash
/gitcommit "implement logging system for all commands"
```

Agent uses the hint to inform the message:
1. Analyzes changes to logging-related files
2. Stages all changes
3. Creates commit: `feat: implement logging system for all commands`
4. Reports: "Created commit ghi789b: feat: implement logging system for all commands"

### Example 4: Chore Commit

User runs command after updating dependencies and cleaning up:

```bash
/gitcommit
```

Agent detects changes to `package.json`, `bun.lock`, and deleted temp files:
1. Stages all changes
2. Creates commit: `chore: update dependencies and remove temporary files`
3. Reports: "Created commit jkl012c: chore: update dependencies and remove temporary files"

### Example 5: Multiple File Types

User has made changes across features, fixes, and docs:

```bash
/gitcommit
```

Agent analyzes and determines the PRIMARY nature of changes:
1. If mostly feature work: `feat: add world state management and update docs`
2. If mostly fixes: `fix: resolve multiple issues in entity extraction`
3. If mixed maintenance: `chore: improve codebase with fixes and refactoring`
4. Reports the commit details

## Arguments Format

The command accepts an optional commit message hint:

```bash
/gitcommit                                    # Auto-generate complete message
/gitcommit "add new feature"                  # Use hint to inform message
/gitcommit "fix authentication bug"           # Hint for fix-type commit
/gitcommit "update documentation for API"     # Hint for docs-type commit
```
