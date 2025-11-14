# Commit Command

Review all changes, clean up unnecessary code, and create a git commit.

## Workflow

1. **Review Changes**
   - Run `git status` to see modified files
   - Run `git diff` for staged changes
   - Run `git diff HEAD` for all changes including unstaged
   - Analyze what has changed and why

2. **Clean Up Code**
   - Remove any commented-out code blocks
   - Remove console.log statements used for debugging (unless intentional)
   - Remove unused imports
   - Remove empty files or placeholder code
   - Fix any obvious formatting issues
   - DO NOT remove TODO comments or planned features
   - DO NOT make functional changes - only cleanup

3. **Stage Changes**
   - Stage all relevant files with `git add`
   - Exclude any files that shouldn't be committed (.env, credentials, etc.)

4. **Create Commit**
   - Write a concise, imperative commit message following this format:
     - Format: `<type>: <description>`
     - Types: feat, fix, refactor, docs, test, chore, style, perf
     - Keep subject line under 72 characters
     - Use imperative mood ("add feature" not "added feature")
     - Be specific but concise

   Example commit messages:
   - `feat: add module isolation for database connections`
   - `fix: correct .env loading in ItemController`
   - `refactor: remove duplicate dotenv config calls`
   - `chore: clean up unused imports and debug logs`

5. **Execute Commit**
   - Create the commit with the formatted message
   - Include the Claude Code co-author footer:
     ```
     🤖 Generated with [Claude Code](https://claude.com/claude-code)

     Co-Authored-By: Claude <noreply@anthropic.com>
     ```

## Important Notes

- DO NOT push to remote unless explicitly requested
- DO NOT commit .env files or credentials
- DO NOT make functional changes during cleanup
- DO NOT remove meaningful comments or documentation
- If there are no changes to commit, say so and exit gracefully
