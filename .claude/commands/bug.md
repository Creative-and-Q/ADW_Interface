# Bug Planning
## Instructions
Needed to fix the bug.
- Use your reasoning model. THINK HARD about the bug, its root cause, and steps to properly fix it properly.
- IMPORTANT: Be surgical with your bug fix, solve the bug at hand and don't fall off track.
- IMPORTANT: We want a minimal number of changes that will fix and address the bug.
- Dont use decorators. Keep it simple.
- If you need to use a library, use `bun i <library-name>` and be sure to report it in the `Notes` section of the `Plan Format`
- Respect requested files in the `Relevant Files` section.
- Start you research by reading the `README.md` file.

## Relevant Files
Focus on the following relevant files.
- `README.md` - Contains the project overview and instructions.
- `app/` - contains the codebase client/server

Ignore all other files in the codebase.

## Plan Format

```md
# Bug: <bug name>

## Bug Description
<describe the bug in detail, including symptoms and expected vs actual behavior>

## Problem Statement
<clearly define the specific problem that needs to be solved>

## Solution Statement
<describe the proposed solution to fix the bug>

## Steps to Reproduce
<list exact steps needed to reproduce the bug>

## Root Cause Analysis
<analyze and explain the root cause of the bug>

## Relevant Files
<find and list the files that are relevant to the bug, describe why they are relevant in bullet points. If there are new files that need to be created to fix the bug, list them in an h3 'New Files' Section.>

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

<list commands you'll use to validate with 100% confidence the bug is fixed with zero regressions. every command must execute without errors so be specific about what you want to run to validate the bug is fixed with zero regressions. Include commands to reproduce the bug before and after the fix.>
- `cd app/server && uv run pytest` - Run server tests to validate the bug is fixed with zero regressions

## Notes
<optionally list any additional notes or context that are relevant to the bug that will be helpful to the developer>
```

## Bug
$ARGUMENTS

## Output Final Review
Once done, save your text to .spec/bugs/<appropriate-file-name-for-bug>.md