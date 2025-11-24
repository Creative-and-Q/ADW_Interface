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
 * CodingAgent
 */
export class CodingAgent {
  private model: string;
  private apiKey: string;

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
  async execute(input: AgentInput): Promise<AgentOutput> {
    // Validate workingDir is provided
    if (!input.workingDir) {
      throw new Error('workingDir is required for CodingAgent');
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

      // Load system prompt with explicit tool usage instructions
      const systemPrompt = this.buildSystemPrompt(toolsDoc);

      // Build user prompt
      const userPrompt = this.buildUserPrompt(input);

      // Agentic loop: Call AI, execute tools, repeat until done
      const messages: AIMessage[] = [{
        role: 'user',
        content: userPrompt,
      }];

      let iterations = 0;
      const maxIterations = 10;
      const toolResults: string[] = [];
      let allResponses: string[] = [];

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

        // Check if AI is done (no more tool calls)
        if (aiResponse.toLowerCase().includes('task complete') || 
            aiResponse.toLowerCase().includes('implementation complete') ||
            aiResponse.toLowerCase().includes('all changes implemented') ||
            !aiResponse.includes('./tools/')) {
          // AI is done
          console.log(`CodingAgent completed after ${iterations} iterations`);
          toolResults.push(`Final response: ${aiResponse.substring(0, 500)}`);
          break;
        }

        // Parse and execute tool calls
        const executed = await this.parseAndExecuteTools(aiResponse, input.workingDir);
        
        if (executed.length === 0) {
          // No tools found to execute
          console.log('No tools found in AI response, considering complete');
          toolResults.push(`No executable tools found: ${aiResponse.substring(0, 200)}`);
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
    } catch (error) {
      return {
        success: false,
        artifacts: [],
        summary: `CodingAgent failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Parse AI response and execute any tool calls
   */
  private async parseAndExecuteTools(response: string, workingDir: string): Promise<string[]> {
    const results: string[] = [];
    
    // Match tool calls in format: ./tools/tool-name.sh "arg1" "arg2"
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
        await this.executeTool(toolName, args, workingDir);
        results.push(`✅ ${toolName}: Success`);
      } catch (error) {
        const errorMsg = (error as Error).message;
        console.error(`Tool execution failed: ${toolName}`, errorMsg);
        results.push(`❌ ${toolName} failed: ${errorMsg}`);
      }
    }

    return results;
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
    return `You are a CodingAgent responsible for implementing code changes based on plans.

## Available Tools

${toolsDoc}

## CRITICAL: How to Use Tools

You MUST use the tools to make changes. Simply describing changes is NOT enough.

**Example - CORRECT way to implement:**

1. Read existing file:
\`\`\`bash
./tools/read-file.sh "frontend/src/pages/Component.tsx"
\`\`\`

2. After seeing content, write the updated version:
\`\`\`bash
./tools/write-file.sh "frontend/src/pages/Component.tsx" "import { useState } from 'react';

export default function Component() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}"
\`\`\`

3. When all changes made, say: "TASK COMPLETE"

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
  private buildUserPrompt(input: AgentInput): string {
    return `
Workflow ID: ${input.workflowId}
Workflow Type: ${input.workflowType || 'unknown'}
Target Module: ${input.targetModule || 'none'}
Task Description: ${input.taskDescription || 'none'}
Working Directory: ${input.workingDir}

CRITICAL INSTRUCTIONS:
You MUST use the tools to implement changes. Do NOT just describe or show code - EXECUTE the tools!

STEP 1: Read the existing file
./tools/read-file.sh "frontend/src/pages/SimpleCalculator3.tsx"

STEP 2: After seeing the content, write the NEW implementation
./tools/write-file.sh "frontend/src/pages/SimpleCalculator3.tsx" "import { useState } from 'react';

export default function SimpleCalculator3() {
  const [count, setCount] = useState(0);
  
  return (
    <div className=\\"p-6\\">
      <div className=\\"text-4xl\\">{count}</div>
      <button onClick={() => setCount(count + 1)} className=\\"bg-green-500 px-4 py-2 rounded\\">+ Increment</button>
      <button onClick={() => setCount(count - 1)} className=\\"bg-red-500 px-4 py-2 rounded\\">- Decrement</button>
    </div>
  );
}"

STEP 3: Say "TASK COMPLETE"

Use EXACTLY this format. The system will execute your tool commands.
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
          'X-Title': 'CodingAgent',
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

}

export default CodingAgent;


