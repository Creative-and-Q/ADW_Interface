# Create Command

Create a new command in .claude/commands/*.md to implement the new `Command` using the exact specified markdown `Command Format`. Follow the `Instructions` to create the plan use the `Relevant Files` to focus on the right files.

## Instructions

- You're writing a command to implement a net new command that will add value to the application.
- Create the command in the `.specs/*.md` file. Name it appropriately based on the `Command`.
- Use the `Command Format` below to create the command. 
- Research the codebase to understand existing patterns, architecture, and conventions before creating the command.
- Read existing `.claude/commands/*.md` in order to understand how to format a command.
- IMPORTANT: Replace every <placeholder> in the `Command Format` with the requested value. Add as much detail as needed to implement the feature successfully.
- Use your reasoning model: THINK HARD about the feature requirements, design, and implementation approach.
- Follow existing patterns and conventions in the codebase. Don't reinvent the wheel.
- Design for extensibility and maintainability.
- Respect requested files in the `Relevant Files` section.
- Start your research by reading the `README.md` file.

## Relevant Files

Focus on the following files:
- `README.md` - Contains the project overview and instructions.
- `app/` - Contains the codebase.
- `.claude/commands` - Contains all the claude commands

Ignore all other files in the codebase.

## Helpful tips
Within your command format, you can use $ARGUMENTS, $1, $2... in order to specify how args should be passed into this format. Use them if needed.

## Command Format

```md
# <Command name>

<describe the feature in detail, including its purpose and value to users>

## Instructions
<clearly label each rule this command must adhere to when completeing this task>

<if file access is needed>
## Relevant Files
Use these files to implement the feature:

<find and list the files that are relevant to the feature describe why they are relevant in bullet points. If there are new files that need to be created to implement the feature, list them in an h3 'New Files' section.>
</if>

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

<list step by step tasks as h3 headers plus bullet points. use as many h3 headers as needed to implement the command. Order matters, start with the foundation required then move on to the specifics about the command.>

## Notes
<optionally list any additional notes, future considerations, or context that are relevant to the feature that will be helpful to the developer>

<if examples would help illustrate the command usage>
## Example Usage

<provide concrete, realistic examples showing how the command should be used in different scenarios. For each example:>

### Example <N>: <descriptive title of what this example demonstrates>
<show the user input, agent response flow, and expected outcomes. Include enough detail to demonstrate the command's behavior, edge cases, and interactive nature if applicable. Use markdown code blocks, formatting, and structure to make examples clear and easy to follow.>

<if the command accepts arguments, include>
## Arguments Format
<describe the argument format and provide multiple example invocations showing different ways to use the command>
</if>
</if>
```

## Command
$ARGUMENTS