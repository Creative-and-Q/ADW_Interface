/**
 * CodeDocumentationAgent
 * Generates documentation for code
 * Read and write access - can read code and write documentation files
 *
 * Uses an agentic loop to:
 * 1. Read source code files
 * 2. Understand the codebase structure
 * 3. Generate and write documentation files
 */
import axios from 'axios';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
const execAsync = promisify(exec);
// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load .env from the agent's own directory (not cwd)
dotenv.config({ path: path.join(__dirname, '.env') });
/**
 * CodeDocumentationAgent
 */
export class CodeDocumentationAgent {
    model;
    apiKey;
    constructor() {
        // Defer environment variable loading to execute() method
        this.apiKey = '';
        this.model = 'anthropic/claude-3.5-haiku';
    }
    /**
     * Execute the documentation agent with agentic loop
     */
    async execute(input) {
        // Validate workingDir is provided
        if (!input.workingDir) {
            throw new Error('workingDir is required for CodeDocumentationAgent');
        }
        // Verify workingDir exists
        try {
            await fs.access(input.workingDir);
        }
        catch (error) {
            throw new Error(`Working directory does not exist: ${input.workingDir}`);
        }
        // Load environment variables from input.env or process.env
        if (!this.apiKey) {
            this.apiKey = input.env?.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '';
            this.model = input.env?.OPENROUTER_MODEL_DOCS || process.env.OPENROUTER_MODEL_DOCS || 'x-ai/grok-code-fast-1';
        }
        if (!this.apiKey) {
            throw new Error('OPENROUTER_API_KEY environment variable is required');
        }
        try {
            // Load tools.md to inform AI about available tools
            const toolsDoc = await this.loadToolsDocumentation();
            // Load system prompt
            const systemPrompt = this.buildSystemPrompt(toolsDoc);
            // Build user prompt
            const userPrompt = this.buildUserPrompt(input);
            // Agentic loop: Call AI, execute tools, repeat until done
            const messages = [{
                    role: 'user',
                    content: userPrompt,
                }];
            let iterations = 0;
            const maxIterations = 6;
            const toolResults = [];
            let allResponses = [];
            let filesWritten = [];
            while (iterations < maxIterations) {
                iterations++;
                console.log(`CodeDocumentationAgent iteration ${iterations}/${maxIterations}`);
                // Call OpenRouter API
                const aiResponse = await this.callOpenRouter(messages, {
                    systemPrompt,
                    maxTokens: 8192,
                    temperature: 0.7,
                });
                allResponses.push(aiResponse);
                // Parse and execute tool calls OR auto-extract documentation files
                const executed = await this.parseAndExecuteTools(aiResponse, input.workingDir);
                // Track files that were written
                executed.forEach(r => {
                    const writeMatch = r.match(/Auto-wrote: (.+?) \(/);
                    if (writeMatch)
                        filesWritten.push(writeMatch[1]);
                });
                // Check if AI is done
                if (aiResponse.toLowerCase().includes('documentation complete') ||
                    aiResponse.toLowerCase().includes('all documentation generated') ||
                    executed.some(r => r.includes('Auto-wrote'))) {
                    console.log(`CodeDocumentationAgent completed after ${iterations} iterations`);
                    toolResults.push(...executed);
                    break;
                }
                if (executed.length === 0) {
                    console.log('No more tool calls, documentation complete');
                    break;
                }
                // Add AI response and tool results to conversation
                messages.push({
                    role: 'assistant',
                    content: aiResponse,
                });
                messages.push({
                    role: 'user',
                    content: `Tool execution results:\n${executed.join('\n\n')}\n\nContinue generating documentation or say "DOCUMENTATION COMPLETE" when done.`,
                });
                toolResults.push(...executed);
            }
            return {
                success: filesWritten.length > 0 || toolResults.length > 0,
                artifacts: [{
                        type: 'documentation',
                        content: allResponses.join('\n\n---\n\n'),
                        metadata: {
                            workflowId: input.workflowId,
                            iterations,
                            filesWritten: filesWritten.length,
                        },
                    }],
                summary: `Generated documentation for workflow ${input.workflowId} (${iterations} iterations, ${filesWritten.length} files written)`,
                metadata: {
                    workflowId: input.workflowId,
                    iterations,
                    filesWritten,
                },
                conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
            };
        }
        catch (error) {
            return {
                success: false,
                artifacts: [],
                summary: `CodeDocumentationAgent failed: ${error.message}`,
            };
        }
    }
    /**
     * Parse AI response and execute any tool calls OR auto-extract documentation files
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
                const output = await this.executeTool(toolName, args, workingDir);
                results.push(`✅ ${toolName}: ${args[0] || ''}\n${output.substring(0, 1000)}`);
            }
            catch (error) {
                const errorMsg = error.message;
                console.error(`Tool execution failed: ${toolName}`, errorMsg);
                results.push(`❌ ${toolName} failed: ${errorMsg}`);
            }
        }
        // Strategy 2: If no explicit tools, auto-extract markdown files and write them
        if (!toolsFound) {
            console.log('No explicit tool calls found, auto-extracting documentation files...');
            const extracted = await this.autoExtractAndWriteDocs(response, workingDir);
            results.push(...extracted);
        }
        return results;
    }
    /**
     * Auto-extract documentation from AI response and write to files
     */
    async autoExtractAndWriteDocs(response, workingDir) {
        const results = [];
        // Pattern 1: Code block with file path in header (```md:README.md)
        const pattern1 = /```(?:markdown|md):([^\n]+\.md)\n([\s\S]*?)```/g;
        let match;
        while ((match = pattern1.exec(response)) !== null) {
            const filePath = match[1].trim();
            const content = match[2].trim();
            try {
                const fullPath = path.join(workingDir, filePath);
                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                await fs.writeFile(fullPath, content, 'utf-8');
                results.push(`✅ Auto-wrote: ${filePath} (${content.length} bytes)`);
                console.log(`Auto-wrote documentation: ${filePath}`);
            }
            catch (error) {
                results.push(`❌ Failed to write ${filePath}: ${error.message}`);
            }
        }
        // Pattern 2: Code block with comment on first line containing .md
        const pattern2 = /```(?:markdown|md)?\n(?:<!--\s*)?([^\n]+\.md)(?:\s*-->)?\n([\s\S]*?)```/g;
        while ((match = pattern2.exec(response)) !== null) {
            const filePath = match[1].trim();
            const content = match[2].trim();
            if (results.some(r => r.includes(filePath)))
                continue;
            try {
                const fullPath = path.join(workingDir, filePath);
                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                await fs.writeFile(fullPath, content, 'utf-8');
                results.push(`✅ Auto-wrote: ${filePath} (${content.length} bytes)`);
                console.log(`Auto-wrote documentation: ${filePath}`);
            }
            catch (error) {
                results.push(`❌ Failed to write ${filePath}: ${error.message}`);
            }
        }
        if (results.length === 0) {
            results.push('⚠️ No documentation files found in response');
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
        return `You are a CodeDocumentationAgent responsible for generating comprehensive documentation.

## Available Tools

${toolsDoc}

## CRITICAL: How to Generate Documentation

You MUST actually create documentation files. Use ONE of these methods:

**Method 1 - Direct Markdown (PREFERRED):**
Show the complete documentation content with the file path in the code block header:

\`\`\`md:README.md
# Project Name

## Description
This project does X, Y, Z.

## Installation
\\\`\\\`\\\`bash
npm install
\\\`\\\`\\\`

## Usage
...
\`\`\`

**Method 2 - Tool Commands:**
\`\`\`bash
./tools/write-file.sh "README.md" "# Project Name..."
\`\`\`

**Both methods will write the files automatically!**

After generating all documentation, say: "DOCUMENTATION COMPLETE"

## Your Responsibilities

1. **ALWAYS** read source code first using ./tools/read-file.sh
2. **ALWAYS** write documentation files using code blocks with file paths
3. Generate README.md with project overview
4. Generate API documentation if applicable
5. Include installation, usage, and examples

## Permissions

- ✅ Read files (use read-file.sh)
- ✅ Write documentation files (use write-file.sh or code blocks)
- ⚠️  All operations restricted to working directory

## Documentation Files to Generate

1. **README.md** - Project overview, installation, usage
2. **docs/API.md** - API documentation (if applicable)
3. **docs/DEVELOPMENT.md** - Development guide (if applicable)`;
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

GENERATE DOCUMENTATION:

1. First, read the source files to understand the project
2. Write documentation files with the file path in code block headers:

\`\`\`md:README.md
# Project Name
...documentation content...
\`\`\`

3. Generate README.md at minimum
4. When all documentation is written, say: "DOCUMENTATION COMPLETE"
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
                'X-Title': 'CodeDocumentationAgent',
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
            const { stdout, stderr } = await execAsync(`bash "${toolPath}" ${args.map(arg => `"${arg}"`).join(' ')}`, { cwd: workingDir, timeout: 30000 });
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
export default CodeDocumentationAgent;
//# sourceMappingURL=index.js.map