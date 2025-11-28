/**
 * CodeTestingAgent
 * Generates and executes tests for code
 * Read, write, and execute access - can read code, write tests, and execute tests
 *
 * Uses an agentic loop to:
 * 1. Read source code
 * 2. Write test files
 * 3. Execute tests
 * 4. Fix failing tests
 * 5. Repeat until tests pass
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
 * CodeTestingAgent
 */
export class CodeTestingAgent {
    model;
    apiKey;
    constructor() {
        // Defer environment variable loading to execute() method
        this.apiKey = '';
        this.model = 'anthropic/claude-3.5-haiku';
    }
    /**
     * Execute the testing agent with agentic loop
     */
    async execute(input) {
        // Validate workingDir is provided
        if (!input.workingDir) {
            throw new Error('workingDir is required for CodeTestingAgent');
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
            this.model = input.env?.OPENROUTER_MODEL_TESTING || process.env.OPENROUTER_MODEL_TESTING || 'x-ai/grok-code-fast-1';
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
            const maxIterations = 8;
            const toolResults = [];
            let allResponses = [];
            let testsPass = false;
            while (iterations < maxIterations) {
                iterations++;
                console.log(`CodeTestingAgent iteration ${iterations}/${maxIterations}`);
                // Call OpenRouter API
                const aiResponse = await this.callOpenRouter(messages, {
                    systemPrompt,
                    maxTokens: 16384,
                    temperature: 0.3,
                });
                allResponses.push(aiResponse);
                // Parse and execute tool calls OR auto-extract test files
                const executed = await this.parseAndExecuteTools(aiResponse, input.workingDir);
                if (executed.length === 0) {
                    console.log('No actions taken from response, considering complete');
                    toolResults.push(`No actions: ${aiResponse.substring(0, 200)}`);
                    break;
                }
                // Check if tests passed
                const testsPassed = executed.some(r => r.includes('✅ Tests passed') || r.includes('All tests pass'));
                if (testsPassed) {
                    testsPass = true;
                    console.log(`CodeTestingAgent: Tests passed after ${iterations} iterations`);
                    toolResults.push(...executed);
                    break;
                }
                // Check if AI says complete
                if (aiResponse.toLowerCase().includes('testing complete') ||
                    aiResponse.toLowerCase().includes('all tests pass') ||
                    executed.some(r => r.includes('Auto-wrote'))) {
                    console.log(`CodeTestingAgent completed after ${iterations} iterations`);
                    toolResults.push(...executed);
                    break;
                }
                // Add AI response and tool results to conversation
                messages.push({
                    role: 'assistant',
                    content: aiResponse,
                });
                messages.push({
                    role: 'user',
                    content: `Tool execution results:\n${executed.join('\n\n')}\n\nContinue with next steps or say "TESTING COMPLETE" if done.`,
                });
                toolResults.push(...executed);
            }
            // Parse and return response
            return {
                success: testsPass || toolResults.length > 0,
                artifacts: [{
                        type: 'test',
                        content: allResponses.join('\n\n---\n\n'),
                        metadata: {
                            workflowId: input.workflowId,
                            iterations,
                            toolsExecuted: toolResults.length,
                            testsPass,
                        },
                    }],
                summary: `Generated and executed tests for workflow ${input.workflowId} (${iterations} iterations, tests ${testsPass ? 'PASSED' : 'completed'})`,
                metadata: {
                    workflowId: input.workflowId,
                    iterations,
                    toolsExecuted: toolResults.length,
                    testsPass,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                artifacts: [],
                summary: `CodeTestingAgent failed: ${error.message}`,
            };
        }
    }
    /**
     * Parse AI response and execute any tool calls OR auto-extract test files
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
                results.push(`✅ ${toolName}: ${output.substring(0, 500)}`);
                // Check if this was a test run
                if (toolName === 'run-tests') {
                    if (output.includes('passed') && !output.includes('failed')) {
                        results.push('✅ Tests passed');
                    }
                    else if (output.includes('failed')) {
                        results.push(`❌ Some tests failed: ${output.substring(0, 300)}`);
                    }
                }
            }
            catch (error) {
                const errorMsg = error.message;
                console.error(`Tool execution failed: ${toolName}`, errorMsg);
                results.push(`❌ ${toolName} failed: ${errorMsg}`);
            }
        }
        // Strategy 2: If no explicit tools, auto-extract test files and write them
        if (!toolsFound) {
            console.log('No explicit tool calls found, auto-extracting test files...');
            const extracted = await this.autoExtractAndWriteTests(response, workingDir);
            results.push(...extracted);
        }
        return results;
    }
    /**
     * Auto-extract test code blocks from AI response and write to files
     */
    async autoExtractAndWriteTests(response, workingDir) {
        const results = [];
        // Pattern 1: Code block with file path in header (```tsx:path/to/file.test.tsx)
        const pattern1 = /```(?:typescript|tsx|ts|javascript|jsx|js):([^\n]+\.(?:test|spec)\.[^\n]+)\n([\s\S]*?)```/g;
        let match;
        while ((match = pattern1.exec(response)) !== null) {
            const filePath = match[1].trim();
            const code = match[2].trim();
            try {
                const fullPath = path.join(workingDir, filePath);
                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                await fs.writeFile(fullPath, code, 'utf-8');
                results.push(`✅ Auto-wrote test: ${filePath} (${code.length} bytes)`);
                console.log(`Auto-wrote test file: ${filePath}`);
            }
            catch (error) {
                results.push(`❌ Failed to write ${filePath}: ${error.message}`);
            }
        }
        // Pattern 2: Code block with comment on first line containing .test. or .spec.
        const pattern2 = /```(?:typescript|tsx|ts|javascript|jsx|js)?\n\/\/\s*([^\n]+\.(?:test|spec)\.[^\n]+)\n([\s\S]*?)```/g;
        while ((match = pattern2.exec(response)) !== null) {
            const filePath = match[1].trim();
            const code = match[2].trim();
            if (results.some(r => r.includes(filePath)))
                continue;
            try {
                const fullPath = path.join(workingDir, filePath);
                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                await fs.writeFile(fullPath, code, 'utf-8');
                results.push(`✅ Auto-wrote test: ${filePath} (${code.length} bytes)`);
                console.log(`Auto-wrote test file: ${filePath}`);
            }
            catch (error) {
                results.push(`❌ Failed to write ${filePath}: ${error.message}`);
            }
        }
        if (results.length === 0) {
            results.push('⚠️ No test files found in response');
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
        return `You are a CodeTestingAgent responsible for generating and executing tests.

## Available Tools

${toolsDoc}

## CRITICAL: How to Write and Run Tests

You MUST actually create test files. Use ONE of these methods:

**Method 1 - Direct Code (PREFERRED):**
Show the complete test file content with the file path in the code block header:

\`\`\`tsx:src/__tests__/Component.test.tsx
import { render, screen } from '@testing-library/react';
import Component from '../Component';

describe('Component', () => {
  it('renders correctly', () => {
    render(<Component />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
\`\`\`

**Method 2 - Tool Commands:**
\`\`\`bash
./tools/write-file.sh "src/__tests__/Component.test.tsx" "test content here"
./tools/run-tests.sh
\`\`\`

**Both methods will write the files automatically!**

After implementing and running tests, say: "TESTING COMPLETE"

## Your Responsibilities

1. **ALWAYS** read source code first using ./tools/read-file.sh
2. **ALWAYS** write test files using ./tools/write-file.sh or code blocks
3. **ALWAYS** run tests using ./tools/run-tests.sh
4. If tests fail, analyze errors and fix them
5. Repeat until all tests pass

## Permissions

- ✅ Read files (use read-file.sh)
- ✅ Write test files (use write-file.sh)
- ✅ Run tests (use run-tests.sh)
- ⚠️  All operations restricted to working directory

## Important

- Create comprehensive test coverage
- Test edge cases and error conditions
- Use appropriate testing framework (Jest, Vitest, etc.)
- After all tests pass, say "TESTING COMPLETE"`;
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

GENERATE AND EXECUTE TESTS:

1. First, read the source files to understand what to test
2. Write comprehensive test files with the file path in code block headers:

\`\`\`tsx:src/__tests__/ComponentName.test.tsx
// test code here
\`\`\`

3. Run the tests using ./tools/run-tests.sh
4. Fix any failing tests
5. When all tests pass, say: "TESTING COMPLETE"
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
                'X-Title': 'CodeTestingAgent',
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
            const { stdout, stderr } = await execAsync(`bash "${toolPath}" ${args.map(arg => `"${arg}"`).join(' ')}`, { cwd: workingDir, timeout: 60000 });
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
export default CodeTestingAgent;
//# sourceMappingURL=index.js.map