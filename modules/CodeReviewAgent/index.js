/**
 * CodeReviewAgent
 * Reviews code and generates review reports
 * Read-only access - can read files and analyze code but not write
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
 * CodeReviewAgent
 */
export class CodeReviewAgent {
    model;
    apiKey;
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY || '';
        this.model = process.env.OPENROUTER_MODEL_REVIEW || 'anthropic/claude-3.5-sonnet';
        if (!this.apiKey) {
            throw new Error('OPENROUTER_API_KEY environment variable is required');
        }
    }
    /**
     * Execute the review agent
     */
    async execute(input) {
        // Validate workingDir is provided
        if (!input.workingDir) {
            throw new Error('workingDir is required for CodeReviewAgent');
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
            // Load system prompt
            const systemPrompt = this.buildSystemPrompt(toolsDoc);
            // Build user prompt
            const userPrompt = this.buildUserPrompt(input);
            // Call OpenRouter API
            const aiResponse = await this.callOpenRouter([
                {
                    role: 'user',
                    content: userPrompt,
                },
            ], {
                systemPrompt,
                maxTokens: 8192,
                temperature: 0.7,
            });
            // Parse and return response
            return this.parseResponse(aiResponse, input);
        }
        catch (error) {
            return {
                success: false,
                artifacts: [],
                summary: `CodeReviewAgent failed: ${error.message}`,
            };
        }
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
        return `You are a CodeReviewAgent responsible for reviewing code and generating comprehensive review reports.

## Available Tools

${toolsDoc}

## Your Responsibilities

1. Read code files to understand the implementation
2. Analyze code quality, security, and best practices
3. Identify potential issues, bugs, and improvements
4. Generate detailed review reports with recommendations

## Restrictions

- You can ONLY read files - you cannot write, modify, or copy files
- Use the read-only tools provided to gather information
- Focus on analysis and review, not implementation`;
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

Please review the code and generate a comprehensive review report.
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
                'X-Title': 'CodeReviewAgent',
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
    /**
     * Parse AI response
     */
    parseResponse(response, input) {
        // Basic parsing - can be enhanced based on actual response format
        return {
            success: true,
            artifacts: [{
                    type: 'review_report',
                    content: response,
                    metadata: {
                        workflowId: input.workflowId,
                    },
                }],
            summary: `Generated review report for workflow ${input.workflowId}`,
            metadata: {
                workflowId: input.workflowId,
                responseLength: response.length,
            },
        };
    }
}
export default CodeReviewAgent;
//# sourceMappingURL=index.js.map