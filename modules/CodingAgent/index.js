/**
 * CodingAgent
 * Implements code changes based on plans
 * Read and write access - can read files, write files, create directories, and copy files
 */
import axios from 'axios';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
dotenv.config();
const execAsync = promisify(exec);
/**
 * CodingAgent
 */
export class CodingAgent {
    model;
    apiKey;
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY || '';
        this.model = process.env.OPENROUTER_MODEL_CODING || 'anthropic/claude-3.5-sonnet';
        if (!this.apiKey) {
            throw new Error('OPENROUTER_API_KEY environment variable is required');
        }
    }
    /**
     * Execute the coding agent
     */
    async execute(input) {
        // Validate workingDir is provided
        if (!input.workingDir) {
            throw new Error('workingDir is required for CodingAgent');
        }
        // Verify workingDir exists
        try {
            await fs.access(input.workingDir);
        }
        catch (error) {
            throw new Error(`Working directory does not exist: ${input.workingDir}`);
        }
        try {
            // Load tools.md to inform AI about available tools
            const toolsDoc = await this.loadToolsDocumentation();
            // Load system prompt with explicit tool usage instructions
            const systemPrompt = this.buildSystemPrompt(toolsDoc);
            // Build user prompt
            const userPrompt = this.buildUserPrompt(input);
            // Agentic loop: Call AI, execute tools, repeat until done
            const messages = [{
                    role: 'user',
                    content: userPrompt,
                }];
            let iterations = 0;
            const maxIterations = 10;
            const toolResults = [];
            let allResponses = [];
            while (iterations < maxIterations) {
                iterations++;
                console.log(`CodingAgent iteration ${iterations}/${maxIterations}`);
                // Call OpenRouter API
                const aiResponse = await this.callOpenRouter(messages, {
                    systemPrompt,
                    maxTokens: 16384,
                    temperature: 0.3,
                });
                allResponses.push(aiResponse);
                // Parse and execute tool calls OR auto-extract code
                const executed = await this.parseAndExecuteTools(aiResponse, input.workingDir);
                if (executed.length === 0) {
                    // No tools found and no code extracted
                    console.log('No actions taken from response, considering complete');
                    toolResults.push(`No actions: ${aiResponse.substring(0, 200)}`);
                    break;
                }
                // Check if AI is done (says complete or successful extractions made)
                if (aiResponse.toLowerCase().includes('implementation complete') ||
                    aiResponse.toLowerCase().includes('all changes implemented') ||
                    executed.some(r => r.includes('Auto-wrote'))) {
                    // AI is done or files were auto-extracted
                    console.log(`CodingAgent completed after ${iterations} iterations (${executed.filter(r => r.includes('Auto-wrote')).length} files written)`);
                    toolResults.push(...executed);
                    toolResults.push(`Final: ${aiResponse.substring(0, 300)}`);
                    break;
                }
                // Add AI response and tool results to conversation
                messages.push({
                    role: 'assistant',
                    content: aiResponse,
                });
                messages.push({
                    role: 'user',
                    content: `Tool execution results:\n${executed.join('\n\n')}\n\nContinue with next steps or say "TASK COMPLETE" if done.`,
                });
                toolResults.push(...executed);
            }
            // Parse and return response
            return {
                success: true,
                artifacts: [{
                        type: 'code',
                        content: allResponses.join('\n\n---\n\n'),
                        metadata: {
                            workflowId: input.workflowId,
                            iterations,
                            toolsExecuted: toolResults.length,
                        },
                    }],
                summary: `Implemented code changes for workflow ${input.workflowId} (${iterations} iterations, ${toolResults.length} tools executed)`,
                metadata: {
                    workflowId: input.workflowId,
                    iterations,
                    toolsExecuted: toolResults.length,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                artifacts: [],
                summary: `CodingAgent failed: ${error.message}`,
            };
        }
    }
    /**
     * Parse AI response and execute any tool calls OR auto-extract code blocks
     */
    async parseAndExecuteTools(response, workingDir) {
        const results = [];
        // Strategy 1: Try to execute explicit tool calls
        const toolCallRegex = /\.\/tools\/([\w-]+)\.sh\s+([^\n]+)/g;
        let match;
        let toolsFound = false;
        while ((match = toolCallRegex.exec(response)) !== null) {
            toolsFound = true;
            const toolName = match[1];
            const argsString = match[2];
            // Parse arguments (simple quoted string extraction)
            const args = [];
            const argRegex = /"([^"]*)"/g;
            let argMatch;
            while ((argMatch = argRegex.exec(argsString)) !== null) {
                args.push(argMatch[1]);
            }
            try {
                console.log(`Executing tool: ${toolName} with ${args.length} args`);
                await this.executeTool(toolName, args, workingDir);
                results.push(`✅ ${toolName}: Success`);
            }
            catch (error) {
                const errorMsg = error.message;
                console.error(`Tool execution failed: ${toolName}`, errorMsg);
                results.push(`❌ ${toolName} failed: ${errorMsg}`);
            }
        }
        // Strategy 2: If no explicit tools, auto-extract code blocks and write files
        if (!toolsFound) {
            console.log('No explicit tool calls found, auto-extracting code blocks...');
            const extracted = await this.autoExtractAndWriteCode(response, workingDir);
            results.push(...extracted);
        }
        return results;
    }
    /**
     * Auto-extract code blocks from AI response and write to files
     * Handles formats like:
     * ```tsx:path/to/file.tsx
     * // code here
     * ```
     * OR
     * // path/to/file.tsx
     * ```tsx
     * // code here
     * ```
     */
    async autoExtractAndWriteCode(response, workingDir) {
        const results = [];
        // Pattern 1: Code block with file path in header (```tsx:path/to/file.tsx)
        const pattern1 = /```(?:typescript|tsx|ts|javascript|jsx|js):([^\n]+)\n([\s\S]*?)```/g;
        let match;
        while ((match = pattern1.exec(response)) !== null) {
            const filePath = match[1].trim();
            const code = match[2].trim();
            try {
                const fullPath = path.join(workingDir, filePath);
                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                await fs.writeFile(fullPath, code, 'utf-8');
                results.push(`✅ Auto-wrote: ${filePath} (${code.length} bytes)`);
                console.log(`Auto-wrote file: ${filePath}`);
            }
            catch (error) {
                results.push(`❌ Failed to write ${filePath}: ${error.message}`);
            }
        }
        // Pattern 2: Code block with comment on first line (most common AI format)
        const pattern2 = /```(?:typescript|tsx|ts|javascript|jsx|js|json)?\n\/\/\s*([^\n]+\.(?:tsx|ts|jsx|js|json))[^\n]*\n([\s\S]*?)```/g;
        while ((match = pattern2.exec(response)) !== null) {
            const filePath = match[1].trim();
            const code = match[2].trim();
            // Skip if already written (from pattern1)
            if (results.some(r => r.includes(filePath))) {
                continue;
            }
            try {
                const fullPath = path.join(workingDir, filePath);
                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                await fs.writeFile(fullPath, code, 'utf-8');
                results.push(`✅ Auto-wrote: ${filePath} (${code.length} bytes)`);
                console.log(`Auto-wrote file: ${filePath}`);
            }
            catch (error) {
                results.push(`❌ Failed to write ${filePath}: ${error.message}`);
            }
        }
        // Pattern 3: Mentions specific file then shows code
        const pattern3 = /(?:update|modify|create|write).*?`([^`]+\.(?:tsx|ts|jsx|js|json))`[\s\S]*?```(?:typescript|tsx|ts|javascript|jsx|js|json)?\n([\s\S]*?)```/gi;
        while ((match = pattern3.exec(response)) !== null) {
            const filePath = match[1].trim();
            const code = match[2].trim();
            // Skip if already written
            if (results.some(r => r.includes(filePath))) {
                continue;
            }
            try {
                const fullPath = path.join(workingDir, filePath);
                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                await fs.writeFile(fullPath, code, 'utf-8');
                results.push(`✅ Auto-wrote: ${filePath} (${code.length} bytes)`);
                console.log(`Auto-wrote file: ${filePath}`);
            }
            catch (error) {
                results.push(`❌ Failed to write ${filePath}: ${error.message}`);
            }
        }
        if (results.length === 0) {
            results.push('⚠️ No code blocks with file paths found in response');
        }
        return results;
    }
    /**
     * Load tools.md documentation
     */
    async loadToolsDocumentation() {
        try {
            const toolsPath = path.join(__dirname, 'tools.md');
            return await fs.readFile(toolsPath, 'utf-8');
        }
        catch (error) {
            console.warn('Failed to load tools.md:', error.message);
            return 'No tools documentation available.';
        }
    }
    /**
     * Build system prompt
     */
    buildSystemPrompt(toolsDoc) {
        return `You are a CodingAgent responsible for implementing code changes based on plans.

## Available Tools

${toolsDoc}

## CRITICAL: How to Implement Changes

You MUST actually modify files. Use ONE of these methods:

**Method 1 - Direct Code (PREFERRED):**
Show the complete file content with the file path in the code block header:

\`\`\`tsx:frontend/src/pages/Component.tsx
import { useState } from 'react';

export default function Component() {
  const [count, setCount] = useState(0);
  return (
    <div className="text-4xl">{count}</div>
    <button onClick={() => setCount(count + 1)}>+</button>
    <button onClick={() => setCount(count - 1)}>-</button>
  );
}
\`\`\`

**Method 2 - Tool Commands:**
\`\`\`bash
./tools/write-file.sh "frontend/src/pages/Component.tsx" "full content here"
\`\`\`

**Both methods will write the files automatically!**

After implementing all changes, say: "IMPLEMENTATION COMPLETE"

## Your Responsibilities

1. **ALWAYS** read existing files first using ./tools/read-file.sh
2. **ALWAYS** write changes using ./tools/write-file.sh
3. Create directories with ./tools/create-directory.sh when needed
4. Make actual file changes - don't just describe what to do
5. After making all changes, explicitly say "TASK COMPLETE"

## Permissions

- ✅ Read files (use read-file.sh)
- ✅ Write and modify files (use write-file.sh)
- ✅ Create directories (use create-directory.sh)
- ✅ Copy files (use copy-file.sh)
- ⚠️  All operations restricted to working directory

## Important

- NEVER just describe changes - EXECUTE them using tools
- NEVER assume files exist - read them first
- ALWAYS use full file paths relative to working directory
- When writing files with content, put full content in quotes`;
    }
    /**
     * Build user prompt
     */
    buildUserPrompt(input) {
        return `
Workflow ID: ${input.workflowId}
Workflow Type: ${input.workflowType || 'unknown'}
Target Module: ${input.targetModule || 'none'}
Task Description: ${input.taskDescription || 'none'}
Working Directory: ${input.workingDir}

IMPLEMENT THE REQUESTED CHANGES:

For each file you need to modify, show the COMPLETE file content in a code block with the file path:

\`\`\`tsx:frontend/src/pages/ComponentName.tsx
import { useState } from 'react';
// ... complete implementation here
export default function ComponentName() {
  // full working code
}
\`\`\`

The system will automatically write these files for you.

When finished, say: "IMPLEMENTATION COMPLETE"
    `.trim();
    }
    /**
     * Call OpenRouter API
     */
    async callOpenRouter(messages, options) {
        const apiMessages = [...messages];
        if (options?.systemPrompt) {
            apiMessages.unshift({
                role: 'system',
                content: options.systemPrompt,
            });
        }
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: this.model,
            messages: apiMessages,
            max_tokens: options?.maxTokens || 4096,
            temperature: options?.temperature || 0.7,
        }, {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'CodingAgent',
            },
        });
        return response.data.choices[0]?.message?.content || '';
    }
    /**
     * Execute a shell script tool
     */
    async executeTool(toolName, args, workingDir) {
        const toolPath = path.join(__dirname, 'tools', `${toolName}.sh`);
        try {
            // Check if tool exists
            await fs.access(toolPath);
            // Execute tool
            const { stdout, stderr } = await execAsync(`bash "${toolPath}" ${args.map(arg => `"${arg}"`).join(' ')}`, { cwd: workingDir });
            if (stderr) {
                console.warn(`Tool ${toolName} stderr:`, stderr);
            }
            return stdout;
        }
        catch (error) {
            throw new Error(`Failed to execute tool ${toolName}: ${error.message}`);
        }
    }
}
export default CodingAgent;
//# sourceMappingURL=index.js.map