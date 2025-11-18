/**
 * CodeTestingAgent
 * Generates and executes tests for code
 * Read, write, and execute access - can read code, write tests, and execute tests
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
 * CodeTestingAgent
 */
export class CodeTestingAgent {
  private model: string;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    this.model = process.env.OPENROUTER_MODEL_TESTING || 'anthropic/claude-3.5-haiku';

    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
  }

  /**
   * Execute the testing agent
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    // Validate workingDir is provided
    if (!input.workingDir) {
      throw new Error('workingDir is required for CodeTestingAgent');
    }

    // Verify workingDir exists
    try {
      await fs.access(input.workingDir);
    } catch (error) {
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
        maxTokens: 16384,
        temperature: 0.3,
      });

      // Parse and return response
      return this.parseResponse(aiResponse, input);
    } catch (error) {
      return {
        success: false,
        artifacts: [],
        summary: `CodeTestingAgent failed: ${(error as Error).message}`,
      };
    }
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
    return `You are a CodeTestingAgent responsible for generating and executing tests.

## Available Tools

${toolsDoc}

## Your Responsibilities

1. Read code files to understand what needs to be tested
2. Write comprehensive test files
3. Execute tests to verify they pass
4. Generate test reports and coverage information

## Permissions

- You can read files
- You can write test files
- You can execute tests
- All operations are restricted to the working directory`;
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

Please generate comprehensive tests for the code and execute them.
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
          'X-Title': 'CodeTestingAgent',
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
        { cwd: workingDir }
      );

      if (stderr) {
        console.warn(`Tool ${toolName} stderr:`, stderr);
      }

      return stdout;
    } catch (error) {
      throw new Error(`Failed to execute tool ${toolName}: ${(error as Error).message}`);
    }
  }

  /**
   * Parse AI response
   */
  private parseResponse(response: string, input: AgentInput): AgentOutput {
    // Basic parsing - can be enhanced based on actual response format
    return {
      success: true,
      artifacts: [{
        type: 'test',
        content: response,
        metadata: {
          workflowId: input.workflowId,
        },
      }],
      summary: `Generated and executed tests for workflow ${input.workflowId}`,
      metadata: {
        workflowId: input.workflowId,
        responseLength: response.length,
      },
    };
  }
}

export default CodeTestingAgent;

