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
 * CodingAgent
 */
export class CodingAgent {
    model;
    apiKey;
    constructor() {
        this.apiKey = '';
        this.model = 'anthropic/claude-3.5-sonnet';
    }
    /**
     * Execute the coding agent
     */
    async execute(input) {
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
        }
        catch (error) {
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
            const messages = [{
                    role: 'user',
                    content: userPrompt,
                }];
            let iterations = 0;
            const maxIterations = 10;
            const maxBuildRetries = 3; // Number of times to retry if build fails
            let buildRetryCount = 0;
            const toolResults = [];
            let allResponses = [];
            let lastBuildError = null;
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
                    }
                    else {
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
- **"declared but never used"**: Remove the unused import/variable
- **Type errors**: Fix the type annotations
- **Syntax errors**: Fix the syntax

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
        while ((match = toolCallRegex.exec(response)) !== null) {
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
    async autoExtractAndWriteCode(response, workingDir) {
        const results = [];
        /**
         * Resolve file path - handles both absolute and relative paths
         * If path is absolute, use it directly; if relative, join with workingDir
         */
        const resolveFilePath = (filePath) => {
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
        const smartWriteJson = async (fullPath, newContent, filePath) => {
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
                }
                catch (readError) {
                    // File doesn't exist or isn't valid JSON, write as-is
                    await fs.writeFile(fullPath, JSON.stringify(newJson, null, 2), 'utf-8');
                    return `✅ Auto-wrote: ${filePath} (${newContent.length} bytes)`;
                }
            }
            catch (parseError) {
                // New content isn't valid JSON, write as-is
                await fs.writeFile(fullPath, newContent, 'utf-8');
                return `✅ Auto-wrote: ${filePath} (${newContent.length} bytes)`;
            }
        };
        // Pattern 1: Code block with file path in header (```tsx:path/to/file.tsx)
        // Supports: typescript, tsx, ts, javascript, jsx, js, css, html, json, svg, xml, scss, sass
        const pattern1 = /```(?:typescript|tsx|ts|javascript|jsx|js|css|html|json|svg|xml|scss|sass):([^\n]+)\n([\s\S]*?)```/g;
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
                }
                else {
                    await fs.writeFile(fullPath, code, 'utf-8');
                    results.push(`✅ Auto-wrote: ${filePath} (${code.length} bytes)`);
                }
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
                const fullPath = resolveFilePath(filePath);
                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                // Use smart JSON merge for package.json
                if (filePath.endsWith('package.json')) {
                    const result = await smartWriteJson(fullPath, code, filePath);
                    results.push(result);
                }
                else {
                    await fs.writeFile(fullPath, code, 'utf-8');
                    results.push(`✅ Auto-wrote: ${filePath} (${code.length} bytes)`);
                }
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
                const fullPath = resolveFilePath(filePath);
                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                // Use smart JSON merge for package.json
                if (filePath.endsWith('package.json')) {
                    const result = await smartWriteJson(fullPath, code, filePath);
                    results.push(result);
                }
                else {
                    await fs.writeFile(fullPath, code, 'utf-8');
                    results.push(`✅ Auto-wrote: ${filePath} (${code.length} bytes)`);
                }
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
     * Deep merge two JSON objects
     * newObj properties override existingObj, but existingObj properties are preserved if not in newObj
     */
    deepMergeJson(existingObj, newObj) {
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
            }
            else {
                // New value overrides existing
                result[key] = newObj[key];
            }
        }
        return result;
    }
    /**
     * Scan working directory to get file structure with better context
     */
    async scanWorkingDirectory(workingDir) {
        try {
            const results = [];
            // First, get the directory tree structure (directories only, max depth 3)
            try {
                const { stdout: dirTree } = await execAsync(`find . -maxdepth 3 -type d ! -name "node_modules" ! -name ".git" ! -name "dist" ! -name "build" ! -name ".next" ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/.next/*" | sort`, { cwd: workingDir });
                if (dirTree.trim()) {
                    results.push('## Directory Structure:\n' + dirTree.trim());
                }
            }
            catch (e) {
                // Ignore directory tree errors
            }
            // Check for frontend/backend split
            try {
                const { stdout: hasFrontend } = await execAsync(`test -d frontend && echo "yes" || echo "no"`, { cwd: workingDir });
                if (hasFrontend.trim() === 'yes') {
                    results.push('\n## Project Type: FULLSTACK (has frontend/ directory)');
                    results.push('- Backend code is in: src/ or root directory');
                    results.push('- Frontend code is in: frontend/src/');
                    results.push('- Frontend assets should go in: frontend/src/assets/ or frontend/public/');
                }
            }
            catch (e) {
                // Ignore
            }
            // Get source files with better extensions (increased limit)
            const { stdout: files } = await execAsync(`find . -type f \\( -name "*.js" -o -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" -o -name "*.css" -o -name "*.scss" -o -name "*.json" -o -name "*.svg" -o -name "*.html" -o -name "*.md" \\) ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/.next/*" | sort | head -100`, { cwd: workingDir });
            if (files.trim()) {
                results.push('\n## Source Files:\n' + files.trim());
            }
            // Check for package.json to understand project type
            try {
                const { stdout: pkgExists } = await execAsync(`test -f package.json && echo "yes" || echo "no"`, { cwd: workingDir });
                if (pkgExists.trim() === 'yes') {
                    // Read dependencies to understand project type
                    const { stdout: deps } = await execAsync(`cat package.json | grep -E '"react"|"vue"|"angular"|"express"|"koa"|"fastify"' | head -5 || echo ""`, { cwd: workingDir });
                    if (deps.trim()) {
                        results.push('\n## Key Dependencies:\n' + deps.trim());
                    }
                }
            }
            catch (e) {
                // Ignore
            }
            // Check for frontend package.json too
            try {
                const { stdout: frontendPkg } = await execAsync(`test -f frontend/package.json && cat frontend/package.json | grep -E '"react"|"vue"|"vite"' | head -3 || echo ""`, { cwd: workingDir });
                if (frontendPkg.trim()) {
                    results.push('\n## Frontend Dependencies:\n' + frontendPkg.trim());
                }
            }
            catch (e) {
                // Ignore
            }
            return results.join('\n') || 'No source files found';
        }
        catch (error) {
            console.warn('Failed to scan working directory:', error.message);
            return 'Unable to scan directory';
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

## Important

- NEVER just describe changes - EXECUTE them using tools
- NEVER assume file paths - use the EXACT paths from the file list
- NEVER create files at paths that don't match the project structure
- NEVER put frontend code in backend directories or vice versa
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
    buildUserPrompt(input, fileStructure) {
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
            // Execute tool with timeout to prevent hanging
            const { stdout, stderr } = await execAsync(`bash "${toolPath}" ${args.map(arg => `"${arg}"`).join(' ')}`, {
                cwd: workingDir,
                timeout: 30000, // 30 second timeout
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            });
            if (stderr) {
                console.warn(`Tool ${toolName} stderr:`, stderr);
            }
            return stdout;
        }
        catch (error) {
            // Check if it was a timeout
            if (error.killed) {
                throw new Error(`Tool ${toolName} timed out after 30 seconds`);
            }
            throw new Error(`Failed to execute tool ${toolName}: ${error.message}`);
        }
    }
    /**
     * Verify build by running TypeScript compilation check
     * Checks both root tsconfig.json and frontend/tsconfig.json if they exist
     * Runs npm install first to ensure all dependencies are installed
     */
    async verifyBuild(workingDir) {
        const results = [];
        let hasError = false;
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
            }
            catch (installError) {
                const errorOutput = installError.stdout || installError.stderr || installError.message;
                console.error('CodingAgent: npm install failed:', errorOutput.substring(0, 500));
                hasError = true;
                results.push(`npm install FAILED:\n${errorOutput}`);
            }
        }
        catch {
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
            }
            catch (installError) {
                const errorOutput = installError.stdout || installError.stderr || installError.message;
                console.error('CodingAgent: frontend npm install failed:', errorOutput.substring(0, 500));
                hasError = true;
                results.push(`Frontend npm install FAILED:\n${errorOutput}`);
            }
        }
        catch {
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
                if (stdout)
                    console.log('tsc stdout:', stdout.substring(0, 500));
            }
            catch (tscError) {
                hasError = true;
                const errorOutput = tscError.stdout || tscError.stderr || tscError.message;
                results.push(`Root TypeScript FAILED:\n${errorOutput}`);
                console.error('Root tsc error:', errorOutput.substring(0, 1000));
            }
        }
        catch {
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
                if (stdout)
                    console.log('frontend tsc stdout:', stdout.substring(0, 500));
            }
            catch (tscError) {
                hasError = true;
                const errorOutput = tscError.stdout || tscError.stderr || tscError.message;
                results.push(`Frontend TypeScript FAILED:\n${errorOutput}`);
                console.error('Frontend tsc error:', errorOutput.substring(0, 1000));
            }
        }
        catch {
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
                    if (stdout)
                        console.log('npm build stdout:', stdout.substring(0, 500));
                }
                catch (buildError) {
                    hasError = true;
                    const errorOutput = buildError.stdout || buildError.stderr || buildError.message;
                    results.push(`npm run build FAILED:\n${errorOutput}`);
                    console.error('npm build error:', errorOutput.substring(0, 1000));
                }
            }
        }
        catch {
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
//# sourceMappingURL=index.js.map