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
import { fileURLToPath } from 'url';

dotenv.config();

const execAsync = promisify(exec);

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * CodingAgent
 */
export class CodingAgent {
  private model: string;
  private apiKey: string;

  constructor() {
    this.apiKey = '';
    this.model = 'anthropic/claude-3.5-sonnet';
  }

  /**
   * Execute the coding agent
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    // Load environment variables from input.env or process.env
    if (!this.apiKey) {
      this.apiKey = input.env?.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '';
      this.model = input.env?.OPENROUTER_MODEL_CODING || process.env.OPENROUTER_MODEL_CODING || 'x-ai/grok-code-fast-1';
    }

    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }

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

      // Scan working directory to include file structure in prompt
      const fileStructure = await this.scanWorkingDirectory(input.workingDir);

      // Build user prompt with file structure included
      const userPrompt = this.buildUserPrompt(input, fileStructure);

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
    } catch (error) {
      return {
        success: false,
        artifacts: [],
        summary: `CodingAgent failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Parse AI response and execute any tool calls OR auto-extract code blocks
   */
  private async parseAndExecuteTools(response: string, workingDir: string): Promise<string[]> {
    const results: string[] = [];
    
    // Strategy 1: Try to execute explicit tool calls
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

    // Strategy 2: ALWAYS try to auto-extract code blocks (regardless of tool calls)
    // This ensures code gets written even if tools fail
    console.log('Auto-extracting code blocks from response...');
    const extracted = await this.autoExtractAndWriteCode(response, workingDir);
    results.push(...extracted);

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
  private async autoExtractAndWriteCode(response: string, workingDir: string): Promise<string[]> {
    const results: string[] = [];

    /**
     * Resolve file path - handles both absolute and relative paths
     * If path is absolute, use it directly; if relative, join with workingDir
     */
    const resolveFilePath = (filePath: string): string => {
      // If it's an absolute path, use it directly
      if (path.isAbsolute(filePath)) {
        return filePath;
      }
      // Otherwise, join with workingDir
      return path.join(workingDir, filePath);
    };

    /**
     * Smart write for JSON files - merges changes instead of replacing
     * This prevents the AI from accidentally wiping out existing package.json content
     */
    const smartWriteJson = async (fullPath: string, newContent: string, filePath: string): Promise<string> => {
      try {
        // Try to parse the new content as JSON
        const newJson = JSON.parse(newContent);

        // Check if file exists and read it
        try {
          const existingContent = await fs.readFile(fullPath, 'utf-8');
          const existingJson = JSON.parse(existingContent);

          // Deep merge: new content on top of existing content
          // This preserves fields the AI didn't include
          const mergedJson = this.deepMergeJson(existingJson, newJson);

          await fs.writeFile(fullPath, JSON.stringify(mergedJson, null, 2), 'utf-8');
          return `✅ Smart-merged JSON: ${filePath} (preserved existing fields)`;
        } catch (readError) {
          // File doesn't exist or isn't valid JSON, write as-is
          await fs.writeFile(fullPath, JSON.stringify(newJson, null, 2), 'utf-8');
          return `✅ Auto-wrote: ${filePath} (${newContent.length} bytes)`;
        }
      } catch (parseError) {
        // New content isn't valid JSON, write as-is
        await fs.writeFile(fullPath, newContent, 'utf-8');
        return `✅ Auto-wrote: ${filePath} (${newContent.length} bytes)`;
      }
    };

    // Pattern 1: Code block with file path in header (```tsx:path/to/file.tsx)
    // Supports: typescript, tsx, ts, javascript, jsx, js, css, html, json
    const pattern1 = /```(?:typescript|tsx|ts|javascript|jsx|js|css|html|json):([^\n]+)\n([\s\S]*?)```/g;
    let match;

    while ((match = pattern1.exec(response)) !== null) {
      const filePath = match[1].trim();
      const code = match[2].trim();

      try {
        const fullPath = resolveFilePath(filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });

        // Use smart JSON merge for package.json
        if (filePath.endsWith('package.json')) {
          const result = await smartWriteJson(fullPath, code, filePath);
          results.push(result);
        } else {
          await fs.writeFile(fullPath, code, 'utf-8');
          results.push(`✅ Auto-wrote: ${filePath} (${code.length} bytes)`);
        }
        console.log(`Auto-wrote file: ${filePath}`);
      } catch (error) {
        results.push(`❌ Failed to write ${filePath}: ${(error as Error).message}`);
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
        const fullPath = resolveFilePath(filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });

        // Use smart JSON merge for package.json
        if (filePath.endsWith('package.json')) {
          const result = await smartWriteJson(fullPath, code, filePath);
          results.push(result);
        } else {
          await fs.writeFile(fullPath, code, 'utf-8');
          results.push(`✅ Auto-wrote: ${filePath} (${code.length} bytes)`);
        }
        console.log(`Auto-wrote file: ${filePath}`);
      } catch (error) {
        results.push(`❌ Failed to write ${filePath}: ${(error as Error).message}`);
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
        const fullPath = resolveFilePath(filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });

        // Use smart JSON merge for package.json
        if (filePath.endsWith('package.json')) {
          const result = await smartWriteJson(fullPath, code, filePath);
          results.push(result);
        } else {
          await fs.writeFile(fullPath, code, 'utf-8');
          results.push(`✅ Auto-wrote: ${filePath} (${code.length} bytes)`);
        }
        console.log(`Auto-wrote file: ${filePath}`);
      } catch (error) {
        results.push(`❌ Failed to write ${filePath}: ${(error as Error).message}`);
      }
    }

    if (results.length === 0) {
      results.push('⚠️ No code blocks with file paths found in response');
    }

    return results;
  }

  /**
   * Deep merge two JSON objects
   * newObj properties override existingObj, but existingObj properties are preserved if not in newObj
   */
  private deepMergeJson(existingObj: any, newObj: any): any {
    if (typeof newObj !== 'object' || newObj === null) {
      return newObj;
    }
    if (typeof existingObj !== 'object' || existingObj === null) {
      return newObj;
    }
    if (Array.isArray(newObj)) {
      return newObj; // Arrays are replaced, not merged
    }

    const result = { ...existingObj };

    for (const key of Object.keys(newObj)) {
      if (key in existingObj && typeof existingObj[key] === 'object' && typeof newObj[key] === 'object') {
        // Recursively merge objects
        result[key] = this.deepMergeJson(existingObj[key], newObj[key]);
      } else {
        // New value overrides existing
        result[key] = newObj[key];
      }
    }

    return result;
  }

  /**
   * Scan working directory to get file structure
   */
  private async scanWorkingDirectory(workingDir: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `find . -type f -name "*.js" -o -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" -o -name "*.css" -o -name "*.json" | grep -v node_modules | grep -v dist | sort | head -50`,
        { cwd: workingDir }
      );
      return stdout.trim() || 'No source files found';
    } catch (error) {
      console.warn('Failed to scan working directory:', (error as Error).message);
      return 'Unable to scan directory';
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
    return `You are a CodingAgent responsible for implementing code changes based on plans.

## Available Tools

${toolsDoc}

## CRITICAL: How to Implement Changes

You MUST actually modify files. Use ONE of these methods:

**Method 1 - Direct Code (PREFERRED):**
Show the complete file content with the file path in the code block header.
USE THE EXACT PATH from the file list provided - do NOT guess paths!

Example for a file at "src/SlotMachine.js":
\`\`\`javascript:src/SlotMachine.js
// Full file content here
\`\`\`

**Method 2 - Tool Commands:**
\`\`\`bash
./tools/write-file.sh "src/SlotMachine.js" "full content here"
\`\`\`

**Both methods will write the files automatically!**

After implementing all changes, say: "IMPLEMENTATION COMPLETE"

## CRITICAL RULE: Use Exact File Paths

- **LOOK AT THE FILE LIST** provided in the user prompt - these are the actual files in the project
- **USE THOSE EXACT PATHS** - don't assume or invent paths like "frontend/src/" or "pages/"
- If you see "src/SlotMachine.js" in the file list, use "src/SlotMachine.js" (not "frontend/src/SlotMachine.js")
- If you see "./src/App.tsx", use "src/App.tsx"
- The file list shows the REAL project structure - use it!

## Your Responsibilities

1. **ALWAYS** check the file list to find the correct file path
2. **ALWAYS** read existing files first using ./tools/read-file.sh
3. **ALWAYS** write changes using ./tools/write-file.sh with the CORRECT path
4. Create directories with ./tools/create-directory.sh only if needed
5. Make actual file changes - don't just describe what to do
6. After making all changes, explicitly say "TASK COMPLETE"

## Permissions

- ✅ Read files (use read-file.sh)
- ✅ Write and modify files (use write-file.sh)
- ✅ Create directories (use create-directory.sh)
- ✅ Copy files (use copy-file.sh)
- ⚠️  All operations restricted to working directory

## Important

- NEVER just describe changes - EXECUTE them using tools
- NEVER assume file paths - use the EXACT paths from the file list
- NEVER create files at paths that don't match the project structure
- When writing files with content, put full content in quotes

## CRITICAL: Modifying package.json

When modifying package.json, you MUST:
1. First read the existing package.json using ./tools/read-file.sh
2. Show ONLY the fields you want to add/modify (system will merge automatically)
3. Do NOT rewrite the entire file - just show the changes

Example for adding a devDependency:
\`\`\`json:package.json
{
  "devDependencies": {
    "@types/cors": "^2.8.17"
  }
}
\`\`\`

This will ADD the field to existing package.json, preserving all other content!`;
  }

  /**
   * Build user prompt
   */
  private buildUserPrompt(input: AgentInput, fileStructure: string): string {
    return `
Workflow ID: ${input.workflowId}
Workflow Type: ${input.workflowType || 'unknown'}
Target Module: ${input.targetModule || 'none'}
Task Description: ${input.taskDescription || 'none'}
Working Directory: ${input.workingDir}

## EXISTING FILES IN CODEBASE

\`\`\`
${fileStructure}
\`\`\`

## YOUR TASK

Based on the files listed above, implement the requested changes.

**CRITICAL RULES:**
1. You MUST use the EXACT file paths from the list above (not guessed paths)
2. If the task mentions a module like "SlotMachineV5", look for similar names in the actual files (e.g., "SlotMachine.js")
3. MODIFY existing files - do NOT create new files unless the file doesn't exist
4. Use ./tools/read-file.sh to read the current content if needed

## IMPLEMENT CHANGES

Show your COMPLETE modified file with the EXACT path from the file list:

\`\`\`javascript:src/SlotMachine.js
// Your complete modified code here (must be the FULL file content)
\`\`\`

When finished, say: "IMPLEMENTATION COMPLETE"
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


