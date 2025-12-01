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

const execAsync = promisify(exec);

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the agent's own directory (not cwd)
dotenv.config({ path: path.join(__dirname, '.env') });

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
  /** Full conversation history from the agent's API interactions */
  conversationHistory?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolCalls?: Array<{
      name: string;
      input: any;
      result?: string;
    }>;
  }>;
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
      const maxBuildRetries = 3; // Number of times to retry if build fails
      let buildRetryCount = 0;
      const toolResults: string[] = [];
      let allResponses: string[] = [];
      let lastBuildError: string | null = null;

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
        const aiSaysComplete = aiResponse.toLowerCase().includes('implementation complete') ||
            aiResponse.toLowerCase().includes('all changes implemented') ||
            aiResponse.toLowerCase().includes('task complete') ||
            aiResponse.toLowerCase().includes('build error fixed') ||
            executed.some(r => r.includes('Auto-wrote'));

        if (aiSaysComplete) {
          // AI is done or files were auto-extracted - VERIFY BUILD BEFORE ACCEPTING
          console.log(`CodingAgent: AI indicates completion after ${iterations} iterations, verifying build...`);
          toolResults.push(...executed);

          // Run build verification NOW (inside the loop)
          const buildVerification = await this.verifyBuild(input.workingDir);

          if (buildVerification.success) {
            // Build passed! We're done
            console.log(`CodingAgent: Build verification PASSED after ${iterations} iterations`);
            toolResults.push(`Build verification: PASSED`);
            toolResults.push(`Final: ${aiResponse.substring(0, 300)}`);
            lastBuildError = null;
            break;
          } else {
            // Build failed - retry if we haven't exceeded max retries
            buildRetryCount++;
            lastBuildError = buildVerification.error || 'Unknown build error';

            if (buildRetryCount >= maxBuildRetries) {
              console.error(`CodingAgent: Build failed after ${buildRetryCount} retry attempts`);
              toolResults.push(`Build verification: FAILED (attempt ${buildRetryCount}/${maxBuildRetries})`);
              break;
            }

            console.log(`CodingAgent: Build FAILED (attempt ${buildRetryCount}/${maxBuildRetries}), asking AI to fix...`);
            toolResults.push(`Build verification: FAILED (attempt ${buildRetryCount}/${maxBuildRetries}): ${lastBuildError}`);

            // Add build error to conversation so AI can fix it
            messages.push({
              role: 'assistant',
              content: aiResponse,
            });

            // Build enhanced error message based on error type
            let additionalGuidance = '';
            if (lastBuildError.includes('react-icons') || lastBuildError.includes('has no exported member')) {
              additionalGuidance = `
## REACT-ICONS SPECIFIC FIX:
The error suggests you used an icon that doesn't exist. Common non-existent icons:
- GiDiceSeven, GiSeven, GiEight, GiNine - DON'T EXIST
- FaApple, FaBanana - DON'T EXIST

Use these REAL alternatives:
- For "seven": GiSevenPointedStar
- For fruits: GiCherry, GiLemon, GiOrange, GiGrapes, GiBanana
- For treasure: GiOpenTreasureChest
- For bells: GiRingingBell
- For valuable: GiDiamondHard, GiCrown, GiCoins

Also use IconType from 'react-icons' for typing, not React.ComponentType.
`;
            }
            if (lastBuildError.includes('.module.css') || lastBuildError.includes('Cannot find module')) {
              additionalGuidance += `
## CSS MODULE FIX:
If using CSS modules, ensure the .module.css file exists and has the classes you're using.
Or remove the CSS module import and use inline styles instead.
`;
            }
            if (lastBuildError.includes('Property') && lastBuildError.includes('does not exist on type')) {
              additionalGuidance += `
## TYPE PROPERTY FIX:
You're using a property that doesn't exist on the type.
READ the interface/type definition and use the EXACT property names.
Common mistakes: 'multiplier' vs 'value', 'Symbol' vs 'SymbolConfig'
`;
            }

            messages.push({
              role: 'user',
              content: `⚠️ BUILD VERIFICATION FAILED (attempt ${buildRetryCount}/${maxBuildRetries})

The code you wrote has the following build errors:

\`\`\`
${lastBuildError}
\`\`\`

PLEASE FIX THESE ERRORS:
1. Analyze the error messages carefully
2. Identify the file(s) and line(s) causing the errors
3. Write the CORRECTED file content with the errors fixed

Common fixes include:
- **"Cannot find module 'X'"**: Add the package to package.json dependencies and update the import OR use a different approach that doesn't require external packages
- **"Could not find a declaration file for module 'X'"**: Add @types/X to devDependencies in package.json OR add a declare module statement
- **"has no exported member 'X'"**: The export doesn't exist - use a different one that DOES exist
- **"declared but never used"**: Remove the unused import/variable
- **Type errors**: Fix the type annotations
- **Syntax errors**: Fix the syntax
${additionalGuidance}
IMPORTANT: If you need to add new packages to package.json, show the updated package.json file with the new dependencies.

Show the complete fixed file(s) and then say "BUILD ERROR FIXED".`,
            });

            // Continue the loop to let AI fix the error
            continue;
          }
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

      // Final build check if we exited the loop without a successful build check
      if (lastBuildError === null) {
        console.log('CodingAgent: Running final build verification...');
        const finalBuildCheck = await this.verifyBuild(input.workingDir);
        if (!finalBuildCheck.success) {
          lastBuildError = finalBuildCheck.error || 'Unknown build error';
        }
      }

      if (lastBuildError !== null) {
        console.error('CodingAgent: Build verification FAILED');
        return {
          success: false,
          artifacts: [{
            type: 'code',
            content: allResponses.join('\n\n---\n\n'),
            metadata: {
              workflowId: input.workflowId,
              iterations,
              toolsExecuted: toolResults.length,
              buildError: lastBuildError,
              buildRetryAttempts: buildRetryCount,
            },
          }],
          summary: `CodingAgent wrote files but BUILD FAILED after ${buildRetryCount} fix attempts: ${lastBuildError}`,
          requiresRetry: true,
          retryReason: `Build verification failed after ${buildRetryCount} attempts: ${lastBuildError}`,
          metadata: {
            workflowId: input.workflowId,
            iterations,
            toolsExecuted: toolResults.length,
            buildVerification: 'FAILED',
            buildError: lastBuildError,
            buildRetryAttempts: buildRetryCount,
          },
          conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
        };
      }

      console.log('CodingAgent: Build verification PASSED');

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
            buildVerification: 'PASSED',
          },
        }],
        summary: `Implemented code changes for workflow ${input.workflowId} (${iterations} iterations, ${toolResults.length} tools executed) - Build verified`,
        metadata: {
          workflowId: input.workflowId,
          iterations,
          toolsExecuted: toolResults.length,
          buildVerification: 'PASSED',
        },
        conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
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
    // Supports: typescript, tsx, ts, javascript, jsx, js, css, html, json, svg, xml, scss, sass, dockerfile, yaml, yml, sh, bash, text, plain, env, gitignore, dockerignore, md, markdown
    const pattern1 = /```(?:typescript|tsx|ts|javascript|jsx|js|css|html|json|svg|xml|scss|sass|dockerfile|yaml|yml|sh|bash|text|plain|env|gitignore|dockerignore|md|markdown)?:([^\n]+)\n([\s\S]*?)```/g;
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

    // Validate react-icons in all written files
    for (const result of results) {
      if (result.includes('Auto-wrote') || result.includes('Smart-merged')) {
        const fileMatch = result.match(/(?:Auto-wrote|Smart-merged[^:]*): ([^\s]+)/);
        if (fileMatch) {
          const filePath = fileMatch[1];
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(workingDir, filePath);
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            if (content.includes('react-icons')) {
              const validation = await this.validateReactIcons(workingDir, content);
              if (!validation.valid) {
                results.push(`⚠️ INVALID REACT-ICONS in ${filePath}: ${validation.invalidIcons.join(', ')}`);
                for (const [icon, suggestions] of Object.entries(validation.suggestions)) {
                  if (suggestions.length > 0) {
                    results.push(`   → Replace "${icon}" with one of: ${suggestions.join(', ')}`);
                  }
                }
              }
            }
          } catch {
            // File read failed - skip validation
          }
        }
      }
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
   * Scan working directory to get file structure with better context
   */
  private async scanWorkingDirectory(workingDir: string): Promise<string> {
    try {
      const results: string[] = [];

      // First, get the directory tree structure (directories only, max depth 3)
      try {
        const { stdout: dirTree } = await execAsync(
          `find . -maxdepth 3 -type d ! -name "node_modules" ! -name ".git" ! -name "dist" ! -name "build" ! -name ".next" ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/.next/*" | sort`,
          { cwd: workingDir }
        );
        if (dirTree.trim()) {
          results.push('## Directory Structure:\n' + dirTree.trim());
        }
      } catch (e) {
        // Ignore directory tree errors
      }

      // Check for frontend/backend split
      try {
        const { stdout: hasFrontend } = await execAsync(
          `test -d frontend && echo "yes" || echo "no"`,
          { cwd: workingDir }
        );
        if (hasFrontend.trim() === 'yes') {
          results.push('\n## Project Type: FULLSTACK (has frontend/ directory)');
          results.push('- Backend code is in: src/ or root directory');
          results.push('- Frontend code is in: frontend/src/');
          results.push('- Frontend assets should go in: frontend/src/assets/ or frontend/public/');
        }
      } catch (e) {
        // Ignore
      }

      // Get source files with better extensions (increased limit)
      const { stdout: files } = await execAsync(
        `find . -type f \\( -name "*.js" -o -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" -o -name "*.css" -o -name "*.scss" -o -name "*.json" -o -name "*.svg" -o -name "*.html" -o -name "*.md" \\) ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/.next/*" | sort | head -100`,
        { cwd: workingDir }
      );

      if (files.trim()) {
        results.push('\n## Source Files:\n' + files.trim());
      }

      // Check for package.json to understand project type
      try {
        const { stdout: pkgExists } = await execAsync(
          `test -f package.json && echo "yes" || echo "no"`,
          { cwd: workingDir }
        );
        if (pkgExists.trim() === 'yes') {
          // Read dependencies to understand project type
          const { stdout: deps } = await execAsync(
            `cat package.json | grep -E '"react"|"vue"|"angular"|"express"|"koa"|"fastify"' | head -5 || echo ""`,
            { cwd: workingDir }
          );
          if (deps.trim()) {
            results.push('\n## Key Dependencies:\n' + deps.trim());
          }
        }
      } catch (e) {
        // Ignore
      }

      // Check for frontend package.json too
      try {
        const { stdout: frontendPkg } = await execAsync(
          `test -f frontend/package.json && cat frontend/package.json | grep -E '"react"|"vue"|"vite"' | head -3 || echo ""`,
          { cwd: workingDir }
        );
        if (frontendPkg.trim()) {
          results.push('\n## Frontend Dependencies:\n' + frontendPkg.trim());
        }
      } catch (e) {
        // Ignore
      }

      return results.join('\n') || 'No source files found';
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

## CRITICAL: Fullstack Project Structure

Many modules have SEPARATE frontend and backend code:

**If you see "Project Type: FULLSTACK" in the file list:**
- Backend/server code lives in: \`src/\` (e.g., src/server.ts)
- Frontend React/Vue code lives in: \`frontend/src/\` (e.g., frontend/src/pages/MyComponent.tsx)
- Frontend assets (images, SVGs, CSS) go in: \`frontend/src/assets/\` or \`frontend/public/\`
- DO NOT put frontend components in \`src/\` - that's for backend!
- DO NOT put backend code in \`frontend/src/\` - that's for UI!

**Look at the Directory Structure section** to understand where files should go.

## Creating New Files (SVGs, Images, Assets)

When creating NEW files that don't exist yet:
1. Check the Directory Structure to find the appropriate location
2. For frontend assets (SVGs, images, icons):
   - If \`frontend/src/assets/\` exists, put them there
   - If \`frontend/public/\` exists, put them there for static assets
   - Create subdirectories as needed (e.g., \`frontend/src/assets/icons/\`)
3. ALWAYS use the file path format: \`\`\`svg:frontend/src/assets/icons/myicon.svg

## Your Responsibilities

1. **ALWAYS** check the file list AND directory structure to find the correct file path
2. **ALWAYS** read existing files first using ./tools/read-file.sh before modifying
3. **ALWAYS** write changes using ./tools/write-file.sh with the CORRECT path
4. **ALWAYS** respect the frontend/backend separation in fullstack projects
5. Create directories with ./tools/create-directory.sh only if needed
6. Make actual file changes - don't just describe what to do
7. After making all changes, explicitly say "TASK COMPLETE"

## Permissions

- ✅ Read files (use read-file.sh)
- ✅ Write and modify files (use write-file.sh)
- ✅ Create directories (use create-directory.sh)
- ✅ Copy files (use copy-file.sh)
- ⚠️  All operations restricted to working directory

## CRITICAL: react-icons Usage

When using react-icons, you MUST use ONLY icons that actually exist. Common mistakes:
- ❌ GiDiceSeven, GiSeven, GiEight, GiNine - DO NOT EXIST
- ❌ FaApple, FaBanana - DO NOT EXIST
- ❌ GiStar2, GiStar3 - DO NOT EXIST

**Instead use these REAL icons:**
- ✅ GiSevenPointedStar (for "seven")
- ✅ GiCherry, GiLemon, GiOrange, GiGrapes, GiBanana (for fruits)
- ✅ GiOpenTreasureChest, GiTreasureMap (for treasure)
- ✅ GiBarn, GiChurch, GiRingingBell (for buildings/bells)
- ✅ GiDiamondHard, GiCrown, GiCoins, GiClover (for valuable items)

**BEFORE using any icon, verify it exists by checking the project's node_modules/react-icons/[set]/index.d.ts**

Also remember to import IconType for proper typing:
\`\`\`typescript
import { IconType } from 'react-icons';
// Then use: icon: IconType (not React.ComponentType)
\`\`\`

## CRITICAL: TypeScript Type Matching

When using existing interfaces/types, you MUST:
1. READ the existing type definition first
2. Use the EXACT property names from the type
3. Common mistakes to avoid:
   - Using \`multiplier\` when the type has \`value\`
   - Using \`Symbol\` when export is \`SymbolConfig\`
   - Using \`keyof typeof array\` (doesn't work on arrays)

## CSS Modules

When using CSS modules (*.module.css), the system auto-generates type declarations.
However, if using CSS modules, make sure the .css file actually exists!

## Important

- NEVER just describe changes - EXECUTE them using tools
- NEVER assume file paths - use the EXACT paths from the file list
- NEVER create files at paths that don't match the project structure
- NEVER put frontend code in backend directories or vice versa
- NEVER use react-icons without verifying they exist
- ALWAYS read existing type definitions before using them
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

This will ADD the field to existing package.json, preserving all other content!

## CRITICAL: Package Types that DON'T EXIST

Many modern packages include their own TypeScript types. Do NOT add separate @types packages for:

- ❌ @types/socket.io - socket.io v4+ includes its own types
- ❌ @types/vite - vite includes its own types
- ❌ @types/react-router-dom - v6+ includes its own types
- ❌ @types/axios - axios includes its own types
- ❌ @types/tailwindcss - tailwindcss includes its own types

When using these packages:
- socket.io: Import types directly: \`import { Server, Socket } from 'socket.io'\`
- vite: Types are built-in
- axios: Types are built-in
- tailwindcss: Types are built-in

If you see "npm error ETARGET No matching version found for @types/X", the package likely includes its own types - remove the @types/X dependency!

## CRITICAL: Consistent Export Patterns

When creating multiple related files (e.g., routes), use CONSISTENT export patterns:

**Named exports (PREFERRED for multiple exports):**
\`\`\`typescript
// routes/auth.ts
const router = express.Router();
// ... route handlers ...
export { router as authRoutes };
export { authenticateToken }; // export any middleware too!

// routes/game.ts
const router = express.Router();
// ... route handlers ...
export { router as gameRoutes };
\`\`\`

**Then import consistently:**
\`\`\`typescript
// server.ts
import { authRoutes } from './routes/auth';
import { gameRoutes } from './routes/game';
\`\`\`

**NEVER mix patterns:**
- ❌ \`export default router\` in one file and \`export { router as X }\` in another
- ❌ \`import X from './routes/x'\` when the file uses named exports
- ❌ \`import { X } from './routes/x'\` when the file uses default export

## CRITICAL: Reference Validation

Before writing code that imports a function/class/constant:
1. Make sure you CREATE that export in the source file
2. If you import \`{ authenticateToken }\` from \`./auth\`, you MUST export \`authenticateToken\` from auth.ts
3. If you reference a model like \`User\`, ensure the User model is properly exported

## CRITICAL: npm Package Versions

Use ONLY these VERIFIED package versions in package.json:

**Dependencies:**
- express: "^4.18.2" (NOT 4.19.x)
- cors: "^2.8.5" (NOT 2.8.13)
- bcrypt: "^5.1.0" or "^5.1.1" (NOT 5.2.x)
- jsonwebtoken: "^9.0.0" or "^9.0.2"
- mongoose: "^8.0.0" or "^7.0.0"
- socket.io: "^4.7.5" or "^4.6.0"
- axios: "^1.6.2" or "^1.7.0"

**DevDependencies:**
- typescript: "^5.3.3" or "^5.4.0"
- @types/node: "^20.10.0" or "^20.11.0"
- @types/express: "^4.17.21"
- @types/cors: "^2.8.17"
- @types/bcrypt: "^5.0.0" (NOT 5.0.4)
- @types/jsonwebtoken: "^9.0.5" or "^9.0.6"

**DO NOT use these non-existent versions:**
- ❌ @types/bcrypt@^5.0.4 - use ^5.0.0
- ❌ cors@^2.8.13 - use ^2.8.5
- ❌ @types/socket.io - doesn't exist (socket.io has built-in types)
- ❌ Any @types package with version > what exists on npm

## CRITICAL: Adding New Dependencies

When you import a new package that isn't in package.json, you MUST also update package.json!

**WRONG - import without adding to package.json:**
\`\`\`tsx
// In your code file
import { GiCherry } from 'react-icons/gi';  // react-icons not in package.json!
\`\`\`

**CORRECT - update package.json when adding imports:**

1. First, add the package to the appropriate package.json:
\`\`\`json
// frontend/package.json (for frontend dependencies)
{
  "dependencies": {
    "react-icons": "^5.0.0"  // ADD THIS LINE
  }
}
\`\`\`

2. Then import in your code:
\`\`\`tsx
import { GiCherry } from 'react-icons/gi';  // Now this works!
\`\`\`

**Common packages to add:**
- Frontend: react-icons, axios, react-router-dom, tailwindcss
- Backend: mongoose, bcrypt, jsonwebtoken, socket.io

**ALWAYS check:** Before importing any package, verify it's in the relevant package.json. If not, add it first!

The npm install step runs automatically but ONLY installs what's in package.json.

## CRITICAL: COMPLETE File Output - NO PLACEHOLDERS

When outputting code files, you MUST include the COMPLETE file content. NEVER use placeholder comments like:
- ❌ "// ... rest of the file"
- ❌ "// ... route handlers ..."
- ❌ "// remaining code stays the same"
- ❌ "// ... (rest unchanged)"
- ❌ "// etc."
- ❌ Any variant of "..." to skip code

Every file you output MUST be complete and runnable. If the file is long, still output the entire thing.

**WRONG (will break the code):**
\`\`\`typescript
// routes/auth.ts
import express from 'express';
const router = express.Router();
// ... rest of the file
\`\`\`

**CORRECT (complete file):**
\`\`\`typescript
// routes/auth.ts
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashedPassword });
    res.status(201).json({ message: 'User registered' });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret');
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

export { router as authRoutes };
\`\`\`

REMEMBER: Every code block you output will be written to a file EXACTLY as you write it. Placeholder comments become broken code!

## CRITICAL: React Component Props Consistency (TS2322 IntrinsicAttributes)

When creating React components across multiple files, you MUST:

1. **Define a Props interface in EVERY component that accepts props**
2. **Apply that interface to the function parameter**
3. **Match prop names exactly between parent and child**

**WRONG (no props interface - causes TS2322 IntrinsicAttributes error):**
\`\`\`tsx
// Login.tsx - THIS WILL FAIL!
function Login() {  // No props typed!
  // ...
}
export default Login;

// App.tsx - passes props that Login doesn't accept
<Login onLogin={handleLogin} />  // TS2322: 'onLogin' does not exist on type 'IntrinsicAttributes'
\`\`\`

**WRONG (prop name mismatch):**
\`\`\`tsx
// App.tsx
<Login onLogin={handleLogin} />  // passes "onLogin"

// Login.tsx
interface LoginProps {
  setToken: React.Dispatch<...>;  // expects "setToken" - MISMATCH!
}
\`\`\`

**CORRECT - Always define and apply Props interface:**
\`\`\`tsx
// Login.tsx
interface LoginProps {
  onLogin: (token: string) => void;
}

function Login({ onLogin }: LoginProps) {  // Props interface APPLIED to function!
  const handleSubmit = () => {
    onLogin(token);  // Use the prop
  };
  return <form onSubmit={handleSubmit}>...</form>;
}

export default Login;

// App.tsx
<Login onLogin={handleLogin} />  // Works! Login accepts this prop.
\`\`\`

**CHECKLIST for every component with props:**
1. Define \`interface ComponentNameProps { ... }\`
2. Apply it: \`function ComponentName({ prop1, prop2 }: ComponentNameProps)\`
3. Ensure parent passes the exact prop names defined in the interface

## CRITICAL: Avoid Unused Variables/Imports (TS6133)

TypeScript strict mode fails on unused declarations. Follow these rules:

1. **Only import hooks you ACTUALLY call:**
   \`\`\`tsx
   // WRONG - useEffect imported but never called
   import { useState, useEffect } from 'react';  // TS6133: 'useEffect' is declared but never read

   function MyComponent() {
     const [state, setState] = useState(0);
     // no useEffect() call anywhere!
     return <div>{state}</div>;
   }

   // CORRECT - only import what you use
   import { useState } from 'react';  // No useEffect because we don't use it

   function MyComponent() {
     const [state, setState] = useState(0);
     return <div>{state}</div>;
   }
   \`\`\`

2. **Don't import React explicitly with react-jsx:**
   \`\`\`tsx
   // WRONG - React import unused with jsx: "react-jsx"
   import React, { useState } from 'react';

   // CORRECT - only import what you use
   import { useState } from 'react';
   \`\`\`

3. **Use all declared variables:**
   \`\`\`tsx
   // WRONG - newBalance declared but never used
   const [balance, setBalance] = useState(0);
   const newBalance = balance + 10; // unused!

   // CORRECT - either use it or don't declare it
   const [balance, setBalance] = useState(0);
   setBalance(balance + 10);
   \`\`\`

4. **For React.FC type, import React as type only:**
   \`\`\`tsx
   import type { FC } from 'react';
   import { useState } from 'react';

   const MyComponent: FC<Props> = ({ ... }) => { ... };
   \`\`\`

   Or just use function components without FC:
   \`\`\`tsx
   import { useState } from 'react';

   function MyComponent({ prop1, prop2 }: Props) { ... }
   \`\`\`

**BEFORE writing any file, scan your code and ask: "Did I import anything I don't use?"**

## CRITICAL: Node.js ESM Module Configuration

When creating a backend with \`"type": "module"\` in package.json, you MUST follow these rules for the application to run:

### 1. Use tsx instead of ts-node for dev script

\`ts-node\` does NOT work with ESM modules. Use \`tsx\` instead:

\`\`\`json
// package.json
{
  "type": "module",
  "scripts": {
    "dev": "tsx src/server.ts",         // CORRECT - tsx works with ESM
    "start": "node dist/server.js",
    "build": "tsc"
  },
  "devDependencies": {
    "tsx": "^4.7.0"    // REQUIRED for dev script
  }
}
\`\`\`

**WRONG:**
\`\`\`json
"dev": "ts-node src/server.ts"  // ERR_UNKNOWN_FILE_EXTENSION with "type": "module"
\`\`\`

### 2. Add .js extension to ALL local imports

Node.js ESM requires file extensions. TypeScript compiles imports as-is, so you MUST add \`.js\` to your TypeScript source:

\`\`\`typescript
// src/server.ts - CORRECT
import { authRoutes } from './routes/auth.js';     // .js extension required!
import { gameRoutes } from './routes/game.js';     // .js extension required!
import { User } from './models/User.js';           // .js extension required!
\`\`\`

\`\`\`typescript
// src/server.ts - WRONG (ERR_MODULE_NOT_FOUND at runtime)
import { authRoutes } from './routes/auth';        // Missing .js!
import { gameRoutes } from './routes/game';        // Missing .js!
\`\`\`

### 3. Configure tsconfig.json for ESM

\`\`\`json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",           // Use NodeNext for proper ESM support
    "moduleResolution": "NodeNext", // Use NodeNext (not "node")
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
\`\`\`

### 4. Complete working example

**package.json:**
\`\`\`json
{
  "name": "my-backend",
  "type": "module",
  "scripts": {
    "dev": "tsx src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "tsx": "^4.7.0",
    "@types/node": "^20.10.0",
    "@types/express": "^4.17.21"
  }
}
\`\`\`

**src/server.ts:**
\`\`\`typescript
import express from 'express';
import { authRoutes } from './routes/auth.js';  // Note: .js extension!

const app = express();
app.use('/api/auth', authRoutes);
app.listen(5000, () => console.log('Server running'));
\`\`\`

**CHECKLIST before writing backend code:**
1. ✅ Use \`tsx\` in dev script (NOT ts-node)
2. ✅ Add \`.js\` extension to ALL local imports
3. ✅ Use \`"module": "NodeNext"\` in tsconfig.json
4. ✅ Include \`tsx\` in devDependencies

## CRITICAL: Type setState Callback Parameters (TS7006)

When using functional updates with setState, you MUST type the callback parameter:

\`\`\`tsx
// WRONG - TS7006: Parameter 'prev' implicitly has an 'any' type
setBalance(prev => prev + 100);
setItems(prev => [...prev, newItem]);

// CORRECT - Type the callback parameter
setBalance((prev: number) => prev + 100);
setItems((prev: ItemType[]) => [...prev, newItem]);
setUser((prev: User | null) => prev ? { ...prev, name: 'new' } : null);
\`\`\`

**Common patterns:**
\`\`\`tsx
// Numbers
const [count, setCount] = useState(0);
setCount((prev: number) => prev + 1);

// Booleans
const [open, setOpen] = useState(false);
setOpen((prev: boolean) => !prev);

// Arrays
const [items, setItems] = useState<string[]>([]);
setItems((prev: string[]) => [...prev, 'new item']);

// Objects
interface User { name: string; balance: number; }
const [user, setUser] = useState<User | null>(null);
setUser((prev: User | null) => prev ? { ...prev, balance: prev.balance + 10 } : null);
\`\`\`

**RULE:** Every setState callback with \`prev =>\` MUST have \`(prev: Type) =>\``;
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

      // Execute tool with timeout to prevent hanging
      const { stdout, stderr } = await execAsync(
        `bash "${toolPath}" ${args.map(arg => `"${arg}"`).join(' ')}`,
        {
          cwd: workingDir,
          timeout: 30000, // 30 second timeout
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        }
      );

      if (stderr) {
        console.warn(`Tool ${toolName} stderr:`, stderr);
      }

      return stdout;
    } catch (error: any) {
      // Check if it was a timeout
      if (error.killed) {
        throw new Error(`Tool ${toolName} timed out after 30 seconds`);
      }
      throw new Error(`Failed to execute tool ${toolName}: ${(error as Error).message}`);
    }
  }

  /**
   * Validate react-icons imports by checking actual exports
   * Returns list of invalid icons and suggestions for valid alternatives
   */
  private async validateReactIcons(workingDir: string, code: string): Promise<{
    valid: boolean;
    invalidIcons: string[];
    suggestions: Record<string, string[]>;
  }> {
    const invalidIcons: string[] = [];
    const suggestions: Record<string, string[]> = {};

    // Extract react-icons imports
    const importMatches = code.matchAll(/import\s*{([^}]+)}\s*from\s*['"]react-icons\/(gi|fa|md|ai|bi|bs|cg|di|fc|fi|go|gr|hi|im|io|io5|ri|si|sl|tb|ti|vsc|wi)['"]/g);

    for (const match of importMatches) {
      const icons = match[1].split(',').map(s => s.trim()).filter(s => s);
      const iconSet = match[2];
      const typesPath = `${workingDir}/node_modules/react-icons/${iconSet}/index.d.ts`;

      try {
        const typesContent = await fs.readFile(typesPath, 'utf-8');

        for (const icon of icons) {
          // Check if the icon is actually exported
          const exportRegex = new RegExp(`export declare const ${icon}:\\s*IconType`);
          if (!exportRegex.test(typesContent)) {
            invalidIcons.push(icon);

            // Find similar icons for suggestions
            const baseName = icon.replace(/^(Gi|Fa|Md|Ai|Bi|Bs|Cg|Di|Fc|Fi|Go|Gr|Hi|Im|Io|Ri|Si|Sl|Tb|Ti|Vsc|Wi)/, '').toLowerCase();
            const similarMatches = typesContent.matchAll(/export declare const ((?:Gi|Fa|Md|Ai|Bi|Bs|Cg|Di|Fc|Fi|Go|Gr|Hi|Im|Io|Ri|Si|Sl|Tb|Ti|Vsc|Wi)[A-Za-z0-9]+):/g);
            const similarIcons: string[] = [];

            for (const simMatch of similarMatches) {
              const simIcon = simMatch[1];
              const simBaseName = simIcon.replace(/^(Gi|Fa|Md|Ai|Bi|Bs|Cg|Di|Fc|Fi|Go|Gr|Hi|Im|Io|Ri|Si|Sl|Tb|Ti|Vsc|Wi)/, '').toLowerCase();
              if (simBaseName.includes(baseName) || baseName.includes(simBaseName.substring(0, 4))) {
                similarIcons.push(simIcon);
                if (similarIcons.length >= 5) break;
              }
            }

            suggestions[icon] = similarIcons;
          }
        }
      } catch (error) {
        // Can't read types file - react-icons may not be installed yet
        console.warn(`CodingAgent: Could not validate react-icons for ${iconSet}:`, (error as Error).message);
      }
    }

    return {
      valid: invalidIcons.length === 0,
      invalidIcons,
      suggestions,
    };
  }

  /**
   * Ensure CSS module type declarations exist
   * Creates a global.d.ts if needed for CSS modules
   */
  private async ensureCssModuleTypes(workingDir: string): Promise<void> {
    const declarationContent = `// Auto-generated CSS module type declarations
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.module.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.css' {
  const content: string;
  export default content;
}
`;

    // Check for common declaration file locations
    const possiblePaths = [
      path.join(workingDir, 'src', 'global.d.ts'),
      path.join(workingDir, 'src', 'types', 'css.d.ts'),
      path.join(workingDir, 'global.d.ts'),
      path.join(workingDir, 'frontend', 'src', 'global.d.ts'),
    ];

    // Check if any declaration already exists
    for (const declPath of possiblePaths) {
      try {
        const content = await fs.readFile(declPath, 'utf-8');
        if (content.includes('*.module.css')) {
          console.log(`CodingAgent: CSS module types already exist at ${declPath}`);
          return; // Already has CSS module types
        }
      } catch {
        // File doesn't exist, continue checking
      }
    }

    // Create declaration file in src/ or root
    const srcDir = path.join(workingDir, 'src');
    const frontendSrcDir = path.join(workingDir, 'frontend', 'src');

    let targetPath: string;
    try {
      await fs.access(frontendSrcDir);
      targetPath = path.join(frontendSrcDir, 'global.d.ts');
    } catch {
      try {
        await fs.access(srcDir);
        targetPath = path.join(srcDir, 'global.d.ts');
      } catch {
        targetPath = path.join(workingDir, 'global.d.ts');
      }
    }

    try {
      // Check if file exists and append, otherwise create
      try {
        const existing = await fs.readFile(targetPath, 'utf-8');
        if (!existing.includes('*.module.css')) {
          await fs.writeFile(targetPath, existing + '\n' + declarationContent);
          console.log(`CodingAgent: Appended CSS module types to ${targetPath}`);
        }
      } catch {
        await fs.writeFile(targetPath, declarationContent);
        console.log(`CodingAgent: Created CSS module types at ${targetPath}`);
      }
    } catch (error) {
      console.warn(`CodingAgent: Could not create CSS module types:`, (error as Error).message);
    }
  }

  /**
   * Ensure tsconfig.json excludes test files to prevent test code from breaking builds
   */
  private async ensureTsconfigExcludesTests(tsconfigPath: string): Promise<void> {
    try {
      const content = await fs.readFile(tsconfigPath, 'utf-8');
      const tsconfig = JSON.parse(content);

      // Check if there's already an exclude array
      if (!tsconfig.exclude) {
        tsconfig.exclude = [];
      }

      // Check if tests are already excluded
      const testExcludes = ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'];
      let modified = false;

      for (const exclude of testExcludes) {
        if (!tsconfig.exclude.includes(exclude)) {
          tsconfig.exclude.push(exclude);
          modified = true;
        }
      }

      if (modified) {
        console.log(`CodingAgent: Adding test exclusions to ${tsconfigPath}`);
        await fs.writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2));
      }
    } catch (error) {
      // If we can't parse or modify tsconfig, just continue
      console.warn(`CodingAgent: Could not update tsconfig at ${tsconfigPath}:`, (error as Error).message);
    }
  }

  /**
   * Verify build by running TypeScript compilation check
   * Checks both root tsconfig.json and frontend/tsconfig.json if they exist
   * Runs npm install first to ensure all dependencies are installed
   */
  private async verifyBuild(workingDir: string): Promise<{ success: boolean; error?: string }> {
    const results: string[] = [];
    let hasError = false;

    // Step -2: Ensure CSS module type declarations exist
    await this.ensureCssModuleTypes(workingDir);

    // Step -1: Ensure tsconfig excludes test files
    try {
      const rootTsconfig = path.join(workingDir, 'tsconfig.json');
      await fs.access(rootTsconfig);
      await this.ensureTsconfigExcludesTests(rootTsconfig);
    } catch {
      // No root tsconfig - skip
    }

    try {
      const frontendTsconfig = path.join(workingDir, 'frontend', 'tsconfig.json');
      await fs.access(frontendTsconfig);
      await this.ensureTsconfigExcludesTests(frontendTsconfig);
    } catch {
      // No frontend tsconfig - skip
    }

    // Step 0: Run npm install in root directory if package.json exists
    try {
      const rootPackageJson = path.join(workingDir, 'package.json');
      await fs.access(rootPackageJson);
      console.log('CodingAgent: Running npm install in root directory...');
      try {
        await execAsync('npm install', {
          cwd: workingDir,
          maxBuffer: 10 * 1024 * 1024,
          timeout: 180000, // 3 minute timeout
        });
        console.log('CodingAgent: npm install completed successfully');
      } catch (installError: any) {
        const errorOutput = installError.stdout || installError.stderr || installError.message;
        console.error('CodingAgent: npm install failed:', errorOutput.substring(0, 500));
        hasError = true;
        results.push(`npm install FAILED:\n${errorOutput}`);
      }
    } catch {
      // No package.json - skip npm install
    }

    // Step 0b: Run npm install in frontend directory if package.json exists
    try {
      const frontendPackageJson = path.join(workingDir, 'frontend', 'package.json');
      await fs.access(frontendPackageJson);
      console.log('CodingAgent: Running npm install in frontend directory...');
      try {
        await execAsync('npm install', {
          cwd: path.join(workingDir, 'frontend'),
          maxBuffer: 10 * 1024 * 1024,
          timeout: 180000, // 3 minute timeout
        });
        console.log('CodingAgent: frontend npm install completed successfully');
      } catch (installError: any) {
        const errorOutput = installError.stdout || installError.stderr || installError.message;
        console.error('CodingAgent: frontend npm install failed:', errorOutput.substring(0, 500));
        hasError = true;
        results.push(`Frontend npm install FAILED:\n${errorOutput}`);
      }
    } catch {
      // No frontend/package.json - skip
    }

    // If npm install already failed, return early
    if (hasError) {
      return { success: false, error: results.join('\n\n') };
    }

    // Check 1: Root tsconfig.json (backend code)
    try {
      const rootTsconfig = path.join(workingDir, 'tsconfig.json');
      await fs.access(rootTsconfig);
      console.log('CodingAgent: Found root tsconfig.json, running tsc --noEmit...');

      try {
        const { stdout } = await execAsync('npx tsc --noEmit', {
          cwd: workingDir,
          maxBuffer: 10 * 1024 * 1024,
        });
        results.push('Root TypeScript: OK');
        if (stdout) console.log('tsc stdout:', stdout.substring(0, 500));
      } catch (tscError: any) {
        hasError = true;
        const errorOutput = tscError.stdout || tscError.stderr || tscError.message;
        results.push(`Root TypeScript FAILED:\n${errorOutput}`);
        console.error('Root tsc error:', errorOutput.substring(0, 1000));
      }
    } catch {
      // No root tsconfig.json - skip
      console.log('CodingAgent: No root tsconfig.json found, skipping root check');
    }

    // Check 2: Frontend tsconfig.json (if exists)
    try {
      const frontendTsconfig = path.join(workingDir, 'frontend', 'tsconfig.json');
      await fs.access(frontendTsconfig);
      console.log('CodingAgent: Found frontend/tsconfig.json, running tsc --noEmit...');

      try {
        const { stdout } = await execAsync('npx tsc --noEmit', {
          cwd: path.join(workingDir, 'frontend'),
          maxBuffer: 10 * 1024 * 1024,
        });
        results.push('Frontend TypeScript: OK');
        if (stdout) console.log('frontend tsc stdout:', stdout.substring(0, 500));
      } catch (tscError: any) {
        hasError = true;
        const errorOutput = tscError.stdout || tscError.stderr || tscError.message;
        results.push(`Frontend TypeScript FAILED:\n${errorOutput}`);
        console.error('Frontend tsc error:', errorOutput.substring(0, 1000));
      }
    } catch {
      // No frontend tsconfig.json - skip
      console.log('CodingAgent: No frontend/tsconfig.json found, skipping frontend check');
    }

    // Check 3: Try npm run build if package.json has build script
    try {
      const packageJsonPath = path.join(workingDir, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

      if (packageJson.scripts?.build) {
        console.log('CodingAgent: Found build script, running npm run build...');
        try {
          const { stdout } = await execAsync('npm run build', {
            cwd: workingDir,
            maxBuffer: 10 * 1024 * 1024,
          });
          results.push('npm run build: OK');
          if (stdout) console.log('npm build stdout:', stdout.substring(0, 500));
        } catch (buildError: any) {
          hasError = true;
          const errorOutput = buildError.stdout || buildError.stderr || buildError.message;
          results.push(`npm run build FAILED:\n${errorOutput}`);
          console.error('npm build error:', errorOutput.substring(0, 1000));
        }
      }
    } catch {
      // No package.json or can't parse - skip
    }

    // If no checks were performed (no tsconfig files), assume success
    if (results.length === 0) {
      console.log('CodingAgent: No TypeScript config found, skipping build verification');
      return { success: true };
    }

    return {
      success: !hasError,
      error: hasError ? results.join('\n\n') : undefined,
    };
  }

}

export default CodingAgent;


