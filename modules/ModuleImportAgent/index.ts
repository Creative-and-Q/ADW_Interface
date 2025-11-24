/**
 * ModuleImportAgent
 *
 * AI-powered agent that analyzes newly imported modules and automatically
 * generates appropriate module.json configuration files.
 */

import axios from 'axios';
import { readFile, writeFile, access, readdir } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Agent input structure
 */
export interface AgentInput {
  modulePath: string;      // Absolute path to the module directory
  moduleName: string;      // Name of the module
  workingDir: string;      // Working directory for the agent
  taskDescription?: string;
  workflowId?: number;
}

/**
 * Script validation result
 */
interface ScriptValidationResult {
  script: string;
  command: string;
  success: boolean;
  error?: string;
  output?: string;
}

/**
 * Validation summary
 */
interface ValidationSummary {
  allPassed: boolean;
  results: ScriptValidationResult[];
  workflowTriggered?: boolean;
  workflowId?: number;
}

/**
 * Agent output structure
 */
export interface AgentOutput {
  success: boolean;
  message: string;
  artifacts: Artifact[];
  error?: string;
  validation?: ValidationSummary;
}

/**
 * Artifact structure for generated files
 */
export interface Artifact {
  type: string;
  content: string;
  filePath?: string;
  metadata?: Record<string, any>;
}

/**
 * Module.json structure
 */
interface ModuleJson {
  name: string;
  version: string;
  description: string;
  category: string;
  project: string;
  tags: string[];
  scripts?: {
    install?: string;
    build?: string;
    start?: string;
    dev?: string;
    test?: string;
    typecheck?: string;
  };
  envVars?: EnvVariable[];
  pages?: any[];
  dashboardWidgets?: any[];
  apiRoutes?: any[];
}

/**
 * Environment variable definition
 */
interface EnvVariable {
  key: string;
  description: string;
  required: boolean;
  defaultValue?: string;
  type: string;
  secret?: boolean;
}

/**
 * Module analysis result
 */
interface ModuleAnalysis {
  hasPackageJson: boolean;
  packageJson?: any;
  hasReadme: boolean;
  readmeContent?: string;
  hasEnvExample: boolean;
  envExampleContent?: string;
  hasSourceCode: boolean;
  sourceFiles?: string[];
  envVariablesFound?: string[];
  nestedPackageJsons?: Array<{ path: string; content: any }>; // Nested package.json files (e.g., frontend/)
}

/**
 * ModuleImportAgent class
 */
class ModuleImportAgent {
  private apiKey: string;
  private model: string;
  private apiUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    this.model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';

    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
  }

  /**
   * Execute the agent to analyze a module and generate module.json
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    try {
      console.log(`Analyzing module: ${input.moduleName} at ${input.modulePath}`);

      // Step 1: Analyze the module directory
      const analysis = await this.analyzeModule(input.modulePath);

      if (!analysis.hasPackageJson) {
        return {
          success: false,
          message: 'No package.json found - cannot generate module.json',
          artifacts: [],
          error: 'package.json is required for module analysis',
        };
      }

      // Step 2: Use AI to generate module.json configuration
      const moduleConfig = await this.generateModuleConfig(input.moduleName, analysis);

      // Step 3: Write module.json to the module directory
      const moduleJsonPath = join(input.modulePath, 'module.json');
      const moduleJsonContent = JSON.stringify(moduleConfig, null, 2);
      await writeFile(moduleJsonPath, moduleJsonContent, 'utf-8');

      // Step 4: Validate scripts actually work
      console.log(`Validating scripts for ${input.moduleName}...`);
      const validation = await this.validateScripts(input.modulePath, moduleConfig, analysis.packageJson);

      // Step 5: If validation failed, trigger a bugfix workflow
      if (!validation.allPassed) {
        console.log(`Script validation failed for ${input.moduleName}, triggering bugfix workflow...`);
        const workflowResult = await this.triggerBugfixWorkflow(input.moduleName, validation);
        validation.workflowTriggered = workflowResult.triggered;
        validation.workflowId = workflowResult.workflowId;
      }

      return {
        success: true,
        message: validation.allPassed
          ? `Successfully generated and validated module.json for ${input.moduleName}`
          : `Generated module.json for ${input.moduleName} but validation failed - bugfix workflow triggered`,
        artifacts: [
          {
            type: 'module-config',
            content: moduleJsonContent,
            filePath: moduleJsonPath,
            metadata: {
              moduleName: input.moduleName,
              category: moduleConfig.category,
              project: moduleConfig.project,
              envVarsCount: moduleConfig.envVars?.length || 0,
            },
          },
        ],
        validation,
      };
    } catch (error: any) {
      console.error('Error in ModuleImportAgent:', error);
      return {
        success: false,
        message: `Failed to generate module.json: ${error.message}`,
        artifacts: [],
        error: error.message,
      };
    }
  }

  /**
   * Analyze the module directory to gather information
   */
  private async analyzeModule(modulePath: string): Promise<ModuleAnalysis> {
    const analysis: ModuleAnalysis = {
      hasPackageJson: false,
      hasReadme: false,
      hasEnvExample: false,
      hasSourceCode: false,
    };

    // Check for package.json
    try {
      const packageJsonPath = join(modulePath, 'package.json');
      await access(packageJsonPath);
      const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
      analysis.hasPackageJson = true;
      analysis.packageJson = JSON.parse(packageJsonContent);
    } catch (error) {
      // package.json not found
    }

    // Check for README.md
    try {
      const readmePath = join(modulePath, 'README.md');
      await access(readmePath);
      analysis.hasReadme = true;
      analysis.readmeContent = await readFile(readmePath, 'utf-8');
    } catch (error) {
      // README.md not found
    }

    // Check for .env.example files (both root and nested like frontend/)
    try {
      const envExamplePath = join(modulePath, '.env.example');
      await access(envExamplePath);
      analysis.hasEnvExample = true;
      analysis.envExampleContent = await readFile(envExamplePath, 'utf-8');
    } catch (error) {
      // Try nested .env.example (like frontend/.env.example)
      try {
        const frontendEnvPath = join(modulePath, 'frontend', '.env.example');
        await access(frontendEnvPath);
        analysis.hasEnvExample = true;
        analysis.envExampleContent = await readFile(frontendEnvPath, 'utf-8');
      } catch {
        // No .env.example found
      }
    }

    // Scan for nested package.json files (e.g., frontend/package.json)
    try {
      const nestedPackageJsons = await this.findNestedPackageJsons(modulePath);
      if (nestedPackageJsons.length > 0) {
        analysis.nestedPackageJsons = nestedPackageJsons;
        console.log(`Found ${nestedPackageJsons.length} nested package.json file(s): ${nestedPackageJsons.map(p => p.path).join(', ')}`);
      }
    } catch (error) {
      console.warn('Failed to scan for nested package.json files:', error);
    }

    // Scan source code for process.env usage (including nested directories like frontend/)
    try {
      const envVariables = await this.scanForEnvVariables(modulePath);
      if (envVariables.length > 0) {
        analysis.envVariablesFound = envVariables;
        console.log(`Found ${envVariables.length} environment variables in source code: ${envVariables.join(', ')}`);
      }
    } catch (error) {
      console.warn('Failed to scan for environment variables:', error);
    }

    return analysis;
  }

  /**
   * Find all nested package.json files (excluding node_modules)
   */
  private async findNestedPackageJsons(
    dirPath: string,
    depth: number = 0
  ): Promise<Array<{ path: string; content: any }>> {
    const results: Array<{ path: string; content: any }> = [];
    const maxDepth = 3; // Prevent deep recursion
    const excludeDirs = ['node_modules', 'dist', 'build', '.git'];

    if (depth > maxDepth) return results;

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Skip excluded directories
          if (excludeDirs.includes(entry.name)) continue;

          const fullPath = join(dirPath, entry.name);
          
          // Check if this directory has a package.json
          try {
            const packageJsonPath = join(fullPath, 'package.json');
            await access(packageJsonPath);
            const content = await readFile(packageJsonPath, 'utf-8');
            const packageJson = JSON.parse(content);
            
            results.push({
              path: entry.name + '/package.json',
              content: packageJson,
            });
            
            console.log(`Found nested package.json in ${entry.name}/`);
          } catch {
            // No package.json in this directory, continue
          }

          // Recursively scan subdirectories
          const nested = await this.findNestedPackageJsons(fullPath, depth + 1);
          results.push(...nested.map(n => ({
            path: entry.name + '/' + n.path,
            content: n.content,
          })));
        }
      }
    } catch (error) {
      // Directory access failed, skip it
    }

    return results;
  }

  /**
   * Recursively scan source files for process.env usage
   */
  private async scanForEnvVariables(dirPath: string, depth: number = 0): Promise<string[]> {
    const envVars = new Set<string>();
    const maxDepth = 5; // Prevent infinite recursion
    const excludeDirs = ['node_modules', 'dist', 'build', '.git', 'coverage', '.next'];
    
    if (depth > maxDepth) return [];

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Skip excluded directories
          if (excludeDirs.includes(entry.name)) continue;
          
          // Recursively scan subdirectories
          const subDirVars = await this.scanForEnvVariables(fullPath, depth + 1);
          subDirVars.forEach(v => envVars.add(v));
        } else if (entry.isFile()) {
          // Only scan source code files
          const ext = entry.name.split('.').pop()?.toLowerCase();
          if (!ext || !['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) continue;

          try {
            const content = await readFile(fullPath, 'utf-8');
            
            // Match process.env.VARIABLE_NAME patterns
            // This regex matches: process.env.VAR_NAME or process.env['VAR_NAME'] or process.env["VAR_NAME"]
            const regex = /process\.env\.([A-Z_][A-Z0-9_]*)|process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]]/g;
            let match;
            
            while ((match = regex.exec(content)) !== null) {
              const varName = match[1] || match[2];
              if (varName) {
                envVars.add(varName);
              }
            }
          } catch (error) {
            // Skip files that can't be read
          }
        }
      }
    } catch (error) {
      // Directory access failed, skip it
    }

    return Array.from(envVars).sort();
  }

  /**
   * Use AI to generate module.json configuration based on analysis
   */
  private async generateModuleConfig(
    moduleName: string,
    analysis: ModuleAnalysis
  ): Promise<ModuleJson> {
    const prompt = this.buildAnalysisPrompt(moduleName, analysis);

    const response = await axios.post(
      this.apiUrl,
      {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/ex-nihilo/aideveloper',
          'X-Title': 'ModuleImportAgent',
        },
      }
    );

    const aiResponse = response.data.choices[0].message.content;

    // Extract JSON from the AI response
    const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch) {
      throw new Error('AI did not return valid JSON configuration');
    }

    const moduleConfig: ModuleJson = JSON.parse(jsonMatch[1]);
    return moduleConfig;
  }

  /**
   * Build the analysis prompt for the AI
   */
  private buildAnalysisPrompt(moduleName: string, analysis: ModuleAnalysis): string {
    let prompt = `You are a module configuration expert. Analyze the following module and generate a complete module.json configuration file.

Module Name: ${moduleName}

`;

    if (analysis.packageJson) {
      prompt += `Root Package.json:
\`\`\`json
${JSON.stringify(analysis.packageJson, null, 2)}
\`\`\`

`;
    }

    if (analysis.nestedPackageJsons && analysis.nestedPackageJsons.length > 0) {
      prompt += `Nested Package.json Files:\n`;
      for (const nested of analysis.nestedPackageJsons) {
        prompt += `
**${nested.path}:**
\`\`\`json
${JSON.stringify(nested.content, null, 2)}
\`\`\`

`;
      }
    }

    if (analysis.readmeContent) {
      prompt += `README.md:
\`\`\`
${analysis.readmeContent.substring(0, 2000)}${analysis.readmeContent.length > 2000 ? '...' : ''}
\`\`\`

`;
    }

    if (analysis.envExampleContent) {
      prompt += `Environment Variables (.env.example):
\`\`\`
${analysis.envExampleContent}
\`\`\`

`;
    }

    if (analysis.envVariablesFound && analysis.envVariablesFound.length > 0) {
      prompt += `Environment Variables Found in Source Code:
The following process.env variables were detected in the source code:
${analysis.envVariablesFound.map(v => `- ${v}`).join('\n')}

You MUST include all of these variables in the env array of the generated module.json.

`;
    }

    prompt += `Generate a complete module.json configuration file with the following structure:

{
  "name": "ModuleName",
  "version": "1.0.0",
  "description": "Module description from package.json",
  "category": "Controllers|AI Services|Agents|Utilities",
  "project": "Ex Nihilo|AIDeveloper",
  "tags": ["tag1", "tag2"],
  "scripts": {
    "install": "npm install",
    "build": "npm run build",
    "start": "npm start",
    "dev": "npm run dev",
    "test": "npm test",
    "typecheck": "npm run typecheck"
  },
  "envVars": [
    {
      "key": "ENV_VAR_NAME",
      "description": "Description of the variable",
      "required": true|false,
      "defaultValue": "default value (if any)",
      "type": "string|number|boolean",
      "secret": true|false
    }
  ]
}

Instructions:
1. Use the exact name from package.json (converted to PascalCase for the name field)
2. Use version and description from package.json
3. Determine the appropriate category based on the module's purpose:
   - "Controllers" for backend controllers/services
   - "AI Services" for AI-powered services
   - "Agents" for AI agents
   - "Utilities" for utility modules
4. Set project to "Ex Nihilo" for game/RPG modules, "AIDeveloper" for development tools/agents
5. Use keywords from package.json as tags
6. For scripts section, map to the package.json scripts:
   - "install": Always "npm install"
   - "build": Use "npm run build" if build script exists, otherwise omit
   - "start": Use "npm start" if start script exists, "npm run start" as fallback
   - "dev": Use "npm run dev" if dev script exists, otherwise omit
   - "test": Use "npm test" if test script exists, otherwise omit
   - "typecheck": Use "npm run typecheck" if typecheck script exists, otherwise omit
   - Only include scripts that exist in package.json (except install which is always included)
7. For envVars array:
   - CRITICAL: Include ALL variables found in source code scanning (listed above)
   - Extract from .env.example if available
   - Infer from package.json dependencies (e.g., mysql2 = MySQL variables, express = PORT)
   - Mark API keys as secret: true
   - Mark passwords/tokens as secret: true
   - Mark environment variables ending in KEY, SECRET, PASSWORD, TOKEN as secret: true
   - Provide sensible defaults where appropriate
   - For each variable, provide a clear description of its purpose
   - Variables with defaults should be marked as required: false
8. Common environment variables to include based on dependencies:
   - If express: PORT (default based on module type)
   - If mysql2: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
   - If axios + mentions OpenRouter/AI: OPENROUTER_API_KEY, OPENROUTER_MODEL
   - If dotenv: Check .env.example first
   - If nested frontend/package.json exists: FRONTEND_PORT (for Vite dev server)
   - Check BOTH root and nested package.json files for dependencies
   - Note: Nested package.json files (like frontend/) indicate multi-part modules

Return ONLY the JSON configuration wrapped in \`\`\`json\`\`\` code blocks, no additional explanation.`;

    return prompt;
  }

  /**
   * Validate that scripts in module.json actually work
   */
  private async validateScripts(
    modulePath: string,
    moduleConfig: ModuleJson,
    packageJson: any
  ): Promise<ValidationSummary> {
    const results: ScriptValidationResult[] = [];
    const scriptsToValidate: Array<{ name: string; command: string; critical: boolean }> = [];

    // Determine which scripts to validate based on what's in module.json
    if (moduleConfig.scripts?.install) {
      scriptsToValidate.push({ name: 'install', command: 'npm install', critical: true });
    }
    if (moduleConfig.scripts?.build && packageJson?.scripts?.build) {
      scriptsToValidate.push({ name: 'build', command: 'npm run build', critical: true });
    }
    if (moduleConfig.scripts?.typecheck && packageJson?.scripts?.typecheck) {
      scriptsToValidate.push({ name: 'typecheck', command: 'npm run typecheck', critical: false });
    }

    // Run each validation
    for (const script of scriptsToValidate) {
      console.log(`  Validating ${script.name}: ${script.command}`);
      const result = await this.runScript(modulePath, script.name, script.command);
      results.push(result);

      // Stop on critical failures
      if (!result.success && script.critical) {
        console.log(`  Critical script ${script.name} failed, stopping validation`);
        break;
      }
    }

    const allPassed = results.every(r => r.success);
    return { allPassed, results };
  }

  /**
   * Run a single script and capture result
   */
  private async runScript(
    modulePath: string,
    scriptName: string,
    command: string
  ): Promise<ScriptValidationResult> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: modulePath,
        timeout: 120000, // 2 minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      return {
        script: scriptName,
        command,
        success: true,
        output: (stdout + stderr).slice(-1000), // Last 1000 chars
      };
    } catch (error: any) {
      return {
        script: scriptName,
        command,
        success: false,
        error: error.message,
        output: (error.stdout || '') + (error.stderr || '').slice(-1000),
      };
    }
  }

  /**
   * Trigger a bugfix workflow to fix validation issues
   */
  private async triggerBugfixWorkflow(
    moduleName: string,
    validation: ValidationSummary
  ): Promise<{ triggered: boolean; workflowId?: number }> {
    try {
      const failedScripts = validation.results.filter(r => !r.success);
      const errorSummary = failedScripts
        .map(r => `${r.script}: ${r.error}\nOutput: ${r.output?.slice(-500) || 'N/A'}`)
        .join('\n\n');

      const taskDescription = `Fix script validation failures in ${moduleName} module:

Failed Scripts:
${errorSummary}

Please investigate and fix:
1. Missing dependencies or incorrect versions
2. TypeScript compilation errors
3. Missing configuration files
4. Build script issues

Ensure all scripts (install, build, typecheck) pass successfully.`;

      // Call the AIDeveloper API to create a bugfix workflow with callback metadata
      const apiUrl = process.env.AIDEVELOPER_API_URL || 'http://localhost:3000';
      const response = await axios.post(`${apiUrl}/api/workflows/manual`, {
        workflowType: 'bugfix',
        targetModule: moduleName,
        taskDescription,
        // Callback metadata for post-completion handling
        callback: {
          type: 'module_import_validation',
          moduleName,
          retryCount: 0,
          maxRetries: 3,
        },
      });

      if (response.data?.workflowId) {
        console.log(`  Bugfix workflow ${response.data.workflowId} triggered for ${moduleName}`);
        return { triggered: true, workflowId: response.data.workflowId };
      }

      return { triggered: false };
    } catch (error: any) {
      console.error(`  Failed to trigger bugfix workflow: ${error.message}`);
      return { triggered: false };
    }
  }
}

export default ModuleImportAgent;
