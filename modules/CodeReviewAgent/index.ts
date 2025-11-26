/**
 * CodeReviewAgent
 * Reviews code and generates review reports
 * Read-only access - can read files and analyze code but not write
 *
 * Uses an agentic loop to:
 * 1. Read source code files
 * 2. Analyze code quality and security
 * 3. Generate structured review report
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
 * Agent Input Interface
 */
export interface AgentInput {
  workflowId: number;
  workflowType?: string;
  targetModule?: string;
  taskDescription?: string;
  branchName?: string;
  workingDir: string; // Required
  metadata?: Record<string, any>;
  context?: Record<string, any>;
  env?: Record<string, string>; // Environment variables
}

/**
 * Agent Output Interface
 */
export interface AgentOutput {
  success: boolean;
  artifacts: Array<{
    type: string;
    content: string;
    filePath?: string;
    metadata?: Record<string, any>;
  }>;
  summary: string;
  suggestions?: string[];
  requiresRetry?: boolean;
  retryReason?: string;
  metadata?: Record<string, any>;
}

/**
 * OpenRouter API Message
 */
interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * CodeReviewAgent
 */
export class CodeReviewAgent {
  private model: string;
  private apiKey: string;

  constructor() {
    // Defer environment variable loading to execute() method
    this.apiKey = '';
    this.model = 'anthropic/claude-3.5-sonnet';
  }

  /**
   * Execute the review agent with agentic loop
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    // Validate workingDir is provided
    if (!input.workingDir) {
      throw new Error('workingDir is required for CodeReviewAgent');
    }

    // Verify workingDir exists
    try {
      await fs.access(input.workingDir);
    } catch (error) {
      throw new Error(`Working directory does not exist: ${input.workingDir}`);
    }

    // Load environment variables from input.env or process.env
    if (!this.apiKey) {
      this.apiKey = input.env?.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '';
      this.model = input.env?.OPENROUTER_MODEL_REVIEW || process.env.OPENROUTER_MODEL_REVIEW || 'x-ai/grok-code-fast-1';
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
      const messages: AIMessage[] = [{
        role: 'user',
        content: userPrompt,
      }];

      let iterations = 0;
      const maxIterations = 5;
      const toolResults: string[] = [];
      let allResponses: string[] = [];
      let filesReviewed: string[] = [];

      while (iterations < maxIterations) {
        iterations++;
        console.log(`CodeReviewAgent iteration ${iterations}/${maxIterations}`);

        // Call OpenRouter API
        const aiResponse = await this.callOpenRouter(messages, {
          systemPrompt,
          maxTokens: 8192,
          temperature: 0.7,
        });

        allResponses.push(aiResponse);

        // Parse and execute tool calls
        const executed = await this.parseAndExecuteTools(aiResponse, input.workingDir);

        // Track files that were read
        executed.forEach(r => {
          const fileMatch = r.match(/read-file: (.+?)(?:\s|$)/);
          if (fileMatch) filesReviewed.push(fileMatch[1]);
        });

        // Check if AI is done (has generated a final report)
        if (aiResponse.toLowerCase().includes('review complete') ||
            aiResponse.toLowerCase().includes('## summary') ||
            aiResponse.includes('## Code Review Report')) {
          console.log(`CodeReviewAgent completed after ${iterations} iterations`);
          toolResults.push(...executed);
          break;
        }

        if (executed.length === 0) {
          console.log('No more tool calls, review complete');
          break;
        }

        // Add AI response and tool results to conversation
        messages.push({
          role: 'assistant',
          content: aiResponse,
        });

        messages.push({
          role: 'user',
          content: `Tool execution results:\n${executed.join('\n\n')}\n\nContinue analyzing or generate the final review report with "REVIEW COMPLETE".`,
        });

        toolResults.push(...executed);
      }

      // Extract structured review from final response
      const finalResponse = allResponses[allResponses.length - 1];
      const reviewReport = this.extractReviewReport(finalResponse);

      return {
        success: true,
        artifacts: [{
          type: 'review_report',
          content: reviewReport,
          metadata: {
            workflowId: input.workflowId,
            iterations,
            filesReviewed: filesReviewed.length,
          },
        }],
        summary: `Generated code review for workflow ${input.workflowId} (${iterations} iterations, ${filesReviewed.length} files reviewed)`,
        suggestions: this.extractSuggestions(finalResponse),
        metadata: {
          workflowId: input.workflowId,
          iterations,
          filesReviewed,
        },
      };
    } catch (error) {
      return {
        success: false,
        artifacts: [],
        summary: `CodeReviewAgent failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Parse AI response and execute any tool calls
   */
  private async parseAndExecuteTools(response: string, workingDir: string): Promise<string[]> {
    const results: string[] = [];

    // Try to execute explicit tool calls
    const toolCallRegex = /\.\/tools\/([\w-]+)\.sh\s+([^\n]+)/g;
    let match;

    while ((match = toolCallRegex.exec(response)) !== null) {
      const toolName = match[1];
      const argsString = match[2];

      // Parse arguments (simple quoted string extraction)
      const args: string[] = [];
      const argRegex = /"([^"]*)"/g;
      let argMatch;
      while ((argMatch = argRegex.exec(argsString)) !== null) {
        args.push(argMatch[1]);
      }

      try {
        console.log(`Executing tool: ${toolName} with ${args.length} args`);
        const output = await this.executeTool(toolName, args, workingDir);
        results.push(`✅ ${toolName}: ${args[0] || ''}\n${output.substring(0, 2000)}`);
      } catch (error) {
        const errorMsg = (error as Error).message;
        console.error(`Tool execution failed: ${toolName}`, errorMsg);
        results.push(`❌ ${toolName} failed: ${errorMsg}`);
      }
    }

    return results;
  }

  /**
   * Extract structured review report from AI response
   */
  private extractReviewReport(response: string): string {
    // If response already has markdown structure, return as-is
    if (response.includes('## ') || response.includes('# ')) {
      return response;
    }

    // Otherwise wrap in a basic structure
    return `# Code Review Report

${response}

---
*Review generated by CodeReviewAgent*`;
  }

  /**
   * Extract suggestions from review
   */
  private extractSuggestions(response: string): string[] {
    const suggestions: string[] = [];

    // Look for bullet points after common headers
    const suggestionPatterns = [
      /(?:suggestions?|recommendations?|improvements?):\s*\n((?:[-*]\s+[^\n]+\n?)+)/gi,
      /(?:should|could|recommend|consider)(?:[^.]*)\./gi,
    ];

    for (const pattern of suggestionPatterns) {
      let match;
      while ((match = pattern.exec(response)) !== null) {
        if (match[1]) {
          // Extract bullet points
          const bullets = match[1].match(/[-*]\s+([^\n]+)/g);
          if (bullets) {
            suggestions.push(...bullets.map(b => b.replace(/^[-*]\s+/, '')));
          }
        } else {
          suggestions.push(match[0]);
        }
      }
    }

    return suggestions.slice(0, 10); // Limit to 10 suggestions
  }

  /**
   * Load tools.md documentation
   */
  private async loadToolsDocumentation(): Promise<string> {
    try {
      const toolsPath = path.join(__dirname, 'tools.md');
      return await fs.readFile(toolsPath, 'utf-8');
    } catch (error) {
      console.warn('Failed to load tools.md:', (error as Error).message);
      return 'No tools documentation available.';
    }
  }

  /**
   * Build system prompt
   */
  private buildSystemPrompt(toolsDoc: string): string {
    return `You are a CodeReviewAgent responsible for reviewing code and generating comprehensive review reports.

## Available Tools

${toolsDoc}

## CRITICAL: How to Review Code

You MUST use tools to read files before reviewing. Use this workflow:

1. First, list files to understand the structure:
\`\`\`bash
./tools/read-file.sh "package.json"
./tools/analyze-code.sh "src"
\`\`\`

2. Read key source files:
\`\`\`bash
./tools/read-file.sh "src/index.ts"
./tools/read-file.sh "src/main.tsx"
\`\`\`

3. After reading all relevant files, generate a structured report with:
   - Code quality assessment
   - Security concerns
   - Performance issues
   - Best practices violations
   - Specific suggestions for improvement

4. When done, include "REVIEW COMPLETE" and provide a summary.

## Your Responsibilities

1. **ALWAYS** read source code using ./tools/read-file.sh
2. **ALWAYS** analyze code structure using ./tools/analyze-code.sh
3. Identify bugs, security issues, and code smells
4. Suggest improvements with specific file/line references
5. Rate overall code quality

## Restrictions

- ⚠️ You can ONLY read files - you cannot write or modify
- Focus on analysis and recommendations
- Be specific about issues and fixes

## Report Format

Generate a structured markdown report:
- ## Summary
- ## Code Quality (score 1-10)
- ## Security Concerns
- ## Performance Issues
- ## Recommendations
- ## Files Reviewed`;
  }

  /**
   * Build user prompt
   */
  private buildUserPrompt(input: AgentInput): string {
    return `
Workflow ID: ${input.workflowId}
Workflow Type: ${input.workflowType || 'unknown'}
Target Module: ${input.targetModule || 'none'}
Task Description: ${input.taskDescription || 'none'}
Working Directory: ${input.workingDir}

REVIEW THIS CODE:

1. Start by reading key files using ./tools/read-file.sh
2. Analyze the code for issues
3. Generate a comprehensive review report
4. End with "REVIEW COMPLETE"
    `.trim();
  }

  /**
   * Call OpenRouter API
   */
  private async callOpenRouter(
    messages: AIMessage[],
    options?: {
      systemPrompt?: string;
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<string> {
    const apiMessages = [...messages];

    if (options?.systemPrompt) {
      apiMessages.unshift({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: this.model,
        messages: apiMessages,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature || 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'CodeReviewAgent',
        },
      }
    );

    return response.data.choices[0]?.message?.content || '';
  }

  /**
   * Execute a shell script tool
   */
  async executeTool(toolName: string, args: string[], workingDir: string): Promise<string> {
    const toolPath = path.join(__dirname, 'tools', `${toolName}.sh`);

    try {
      // Check if tool exists
      await fs.access(toolPath);

      // Execute tool
      const { stdout, stderr } = await execAsync(
        `bash "${toolPath}" ${args.map(arg => `"${arg}"`).join(' ')}`,
        { cwd: workingDir, timeout: 30000 }
      );

      if (stderr) {
        console.warn(`Tool ${toolName} stderr:`, stderr);
      }

      return stdout;
    } catch (error) {
      throw new Error(`Failed to execute tool ${toolName}: ${(error as Error).message}`);
    }
  }
}

export default CodeReviewAgent;


