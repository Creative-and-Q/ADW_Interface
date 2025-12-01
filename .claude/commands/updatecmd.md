# Update Command

Update an existing command file in .claude/commands/*.md based on the provided file path and change description. This command reads the existing command, analyzes the requested changes, and updates the command file while preserving its structure and intent.

## Instructions

- Take the file path ($1) of an existing command file and a description ($2) of what needs to be changed
- Read the existing command file to understand its current structure and purpose
- Analyze the requested changes and determine how to best apply them while maintaining the command's original intent
- Update the command file with the requested changes, ensuring all markdown formatting remains intact
- Preserve the overall structure and format of the command unless the changes specifically require structural modifications
- Use your reasoning model: THINK HARD about how the changes should be applied to maintain consistency and clarity
- If the requested changes conflict with the command's purpose, suggest alternatives or clarifications
- Ensure the updated command follows the same conventions and patterns as other commands in .claude/commands/
- IMPORTANT: Do not remove or alter sections that aren't related to the requested changes

## Relevant Files

Use these files to implement the update:

- `.claude/commands/$1` - The existing command file that needs to be updated (provided as first argument)
- `.claude/commands/*.md` - Other command files to reference for consistency and patterns

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Read the Existing Command
- Read the command file at the path provided in $1
- Understand the command's current purpose, structure, and format
- Identify all sections present in the command

### Step 2: Analyze Requested Changes
- Parse the change description provided in $2
- Identify which sections of the command need to be modified
- Determine if any new sections need to be added or existing sections removed
- Consider how the changes align with the command's original intent

### Step 3: Apply Changes
- Update the command file with the requested changes
- Maintain the markdown structure and formatting
- Ensure all placeholders ($ARGUMENTS, $1, $2, etc.) are preserved if they're still relevant
- Keep the command format consistent with other commands in the .claude/commands/ directory

### Step 4: Validate Changes
- Review the updated command to ensure it's complete and coherent
- Verify that all requested changes have been applied
- Confirm that the command format follows the established patterns
- Ensure no unintended sections were removed or modified

## Notes

- This command is designed to be safe and preserve the intent of the original command while applying requested updates
- If the file path provided in $1 doesn't exist, report an error and ask for a valid path
- If the requested changes in $2 are unclear or ambiguous, ask for clarification before making changes
- Always maintain backward compatibility unless explicitly asked to make breaking changes
- Consider reading multiple command files to ensure consistency across the command library
