/**
 * ModuleScaffoldAgent
 * Creates module scaffolds and uses AI to decompose requirements into sub-workflows
 */
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * ModuleScaffoldAgent
 */
export class ModuleScaffoldAgent {
    apiKey = '';
    model = 'anthropic/claude-sonnet-4-20250514';
    constructor() { }
    /**
     * Execute the scaffolding agent
     */
    async execute(input) {
        // Load API key from input.env or process.env
        this.apiKey = input.env?.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '';
        this.model = input.env?.OPENROUTER_MODEL_PLANNING || process.env.OPENROUTER_MODEL_PLANNING || 'anthropic/claude-sonnet-4-20250514';
        if (!input.targetModule) {
            throw new Error('targetModule is required for ModuleScaffoldAgent');
        }
        if (!input.taskDescription) {
            throw new Error('taskDescription is required for ModuleScaffoldAgent');
        }
        try {
            console.log(`[ModuleScaffoldAgent] Creating scaffold for ${input.targetModule}`);
            // Dynamically import module-creator (from dist after AIDeveloper is built)
            // @ts-ignore - Dynamic import path resolved at runtime
            const moduleCreatorPath = 'file:///home/kevin/Home/ex_nihilo/AIDeveloper/dist/utils/module-creator.js';
            const { createNewModule } = await import(moduleCreatorPath);
            // Configure module creation
            const moduleConfig = {
                name: input.targetModule,
                description: input.taskDescription,
                type: (input.metadata?.moduleType || 'service'),
                port: input.metadata?.port,
                hasFrontend: input.metadata?.hasFrontend ?? true,
                frontendPort: input.metadata?.frontendPort,
                relatedModules: input.metadata?.relatedModules || [],
                workflowId: input.workflowId,
            };
            // Create the module scaffold
            const result = await createNewModule(moduleConfig);
            if (!result.success) {
                throw new Error(result.error || 'Module creation failed');
            }
            console.log(`[ModuleScaffoldAgent] Scaffold created successfully at ${result.modulePath}`);
            // Use AI to decompose the task into sub-workflows
            const subTasks = await this.decomposeTaskWithAI(input.targetModule, input.taskDescription, input.metadata);
            // Generate structured plan for implementation
            const plan = {
                title: `Implement ${input.targetModule} functionality`,
                subTasks,
            };
            console.log(`[ModuleScaffoldAgent] Generated ${subTasks.length} sub-tasks for implementation`);
            // Return artifacts with structured plan
            return {
                success: true,
                artifacts: [
                    {
                        type: 'module_scaffold',
                        content: `Module ${input.targetModule} scaffolded successfully`,
                        metadata: {
                            modulePath: result.modulePath,
                            workflowPath: result.workflowPath,
                            repoUrl: result.repoUrl,
                        },
                    },
                    {
                        type: 'structured_plan',
                        content: JSON.stringify(plan, null, 2),
                        metadata: {
                            totalSubTasks: plan.subTasks.length,
                            workflowType: 'new_module',
                        },
                    },
                ],
                summary: `Created module scaffold for ${input.targetModule} at ${result.modulePath}. Decomposed into ${subTasks.length} implementation tasks.`,
                suggestions: [
                    `${subTasks.length} feature workflows will be created to implement the functionality`,
                    'The module has been pushed to GitHub',
                    'Frontend and backend scaffolds are ready',
                ],
            };
        }
        catch (error) {
            console.error(`[ModuleScaffoldAgent] Error:`, error);
            return {
                success: false,
                artifacts: [],
                summary: `Failed to create module scaffold: ${error.message}`,
                requiresRetry: false,
            };
        }
    }
    /**
     * Use AI to decompose the task description into focused sub-tasks
     */
    async decomposeTaskWithAI(moduleName, taskDescription, metadata) {
        // If no API key, fall back to basic decomposition
        if (!this.apiKey) {
            console.warn('[ModuleScaffoldAgent] No OPENROUTER_API_KEY available, using basic decomposition');
            return this.basicDecomposition(moduleName, taskDescription, metadata);
        }
        const systemPrompt = `You are a software architect responsible for breaking down module requirements into focused, sequential implementation tasks.

Your job is to analyze the task description and create a list of 3-7 focused sub-tasks that will implement the module functionality.

## Guidelines for Sub-Tasks:

1. **Each sub-task should be focused** - one specific feature, component, or piece of functionality
2. **Order matters** - foundation tasks first (data models, core logic), then build on top (UI, integrations)
3. **Use dependencies** - if task B requires task A, put A's index in B's dependsOn array
4. **Be specific** - include file names, component names, and specific functionality
5. **Balance granularity** - not too broad (entire module) or too narrow (single line change)

## Sub-Task Types:
- "feature": New functionality (most common for new modules)
- "refactor": Code improvements without changing behavior
- "bugfix": Fixing issues (rare for new modules)
- "documentation": Adding docs (usually last task)

## Complexity Guidelines:
- "low": < 50 lines, single file, straightforward logic
- "medium": 50-200 lines, 2-3 files, moderate complexity
- "high": > 200 lines, multiple files, complex logic or architectural decisions

## Response Format:
Return ONLY a valid JSON array of sub-tasks. No explanation, no markdown code blocks, just the JSON array.

Example response:
[
  {
    "title": "Create data models and types",
    "description": "Define TypeScript interfaces and types for the module's core data structures in src/types.ts",
    "workflowType": "feature",
    "targetModule": "ModuleName",
    "priority": 1,
    "estimatedComplexity": "low",
    "dependsOn": [],
    "acceptanceCriteria": ["Types are exported", "Types cover all data structures"]
  },
  {
    "title": "Implement core business logic",
    "description": "Create the main service/controller with core functionality in src/index.ts",
    "workflowType": "feature",
    "targetModule": "ModuleName",
    "priority": 2,
    "estimatedComplexity": "medium",
    "dependsOn": [0],
    "acceptanceCriteria": ["Core functions work", "Error handling in place"]
  }
]`;
        const userPrompt = `Module Name: ${moduleName}
Module Type: ${metadata?.moduleType || 'service'}
Has Frontend: ${metadata?.hasFrontend ?? true}
${metadata?.port ? `Backend Port: ${metadata.port}` : ''}
${metadata?.frontendPort ? `Frontend Port: ${metadata.frontendPort}` : ''}

Task Description:
${taskDescription}

Break this down into 3-7 focused implementation sub-tasks. Return ONLY the JSON array.`;
        try {
            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: this.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                max_tokens: 4096,
                temperature: 0.7,
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'ModuleScaffoldAgent',
                },
            });
            const content = response.data.choices[0]?.message?.content || '';
            console.log(`[ModuleScaffoldAgent] AI response received, parsing sub-tasks...`);
            // Parse the JSON response
            const subTasks = this.parseSubTasksFromResponse(content, moduleName);
            if (subTasks.length >= 2) {
                return subTasks;
            }
            // If AI returned too few tasks, supplement with basic decomposition
            console.warn('[ModuleScaffoldAgent] AI returned insufficient tasks, supplementing with basic decomposition');
            return this.basicDecomposition(moduleName, taskDescription, metadata);
        }
        catch (error) {
            console.error('[ModuleScaffoldAgent] AI decomposition failed:', error.message);
            return this.basicDecomposition(moduleName, taskDescription, metadata);
        }
    }
    /**
     * Parse sub-tasks from AI response
     */
    parseSubTasksFromResponse(content, moduleName) {
        try {
            // Try to parse as direct JSON array
            let jsonContent = content.trim();
            // Remove markdown code blocks if present
            const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonContent = jsonMatch[1].trim();
            }
            const parsed = JSON.parse(jsonContent);
            if (!Array.isArray(parsed)) {
                throw new Error('Response is not an array');
            }
            // Validate and normalize each sub-task
            return parsed.map((task, index) => ({
                title: task.title || `Task ${index + 1}`,
                description: task.description || '',
                workflowType: ['feature', 'bugfix', 'documentation', 'refactor'].includes(task.workflowType)
                    ? task.workflowType
                    : 'feature',
                targetModule: task.targetModule || moduleName,
                priority: typeof task.priority === 'number' ? task.priority : index + 1,
                estimatedComplexity: ['low', 'medium', 'high'].includes(task.estimatedComplexity)
                    ? task.estimatedComplexity
                    : 'medium',
                dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn : [],
                acceptanceCriteria: Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [],
            }));
        }
        catch (error) {
            console.error('[ModuleScaffoldAgent] Failed to parse AI response:', error.message);
            return [];
        }
    }
    /**
     * Basic decomposition fallback when AI is unavailable
     */
    basicDecomposition(moduleName, taskDescription, metadata) {
        const hasFrontend = metadata?.hasFrontend ?? true;
        const subTasks = [];
        let priority = 1;
        // Task 1: Core types and interfaces
        subTasks.push({
            title: `Define types and interfaces for ${moduleName}`,
            description: `Create TypeScript interfaces and types that define the data structures for ${moduleName}. Based on: ${taskDescription}`,
            workflowType: 'feature',
            targetModule: moduleName,
            priority: priority++,
            estimatedComplexity: 'low',
            dependsOn: [],
            acceptanceCriteria: ['Types are exported', 'Types cover all data structures needed'],
        });
        // Task 2: Core backend logic
        subTasks.push({
            title: `Implement core backend logic for ${moduleName}`,
            description: `Create the main service/controller with core functionality. Implement the primary business logic based on: ${taskDescription}`,
            workflowType: 'feature',
            targetModule: moduleName,
            priority: priority++,
            estimatedComplexity: 'medium',
            dependsOn: [0],
            acceptanceCriteria: ['Core functions implemented', 'Error handling in place', 'Exports work correctly'],
        });
        // Task 3: API endpoints (if service type)
        if (metadata?.moduleType !== 'library') {
            subTasks.push({
                title: `Create API endpoints for ${moduleName}`,
                description: `Set up Express routes and API endpoints to expose the module's functionality. Include proper request validation and error responses.`,
                workflowType: 'feature',
                targetModule: moduleName,
                priority: priority++,
                estimatedComplexity: 'medium',
                dependsOn: [1],
                acceptanceCriteria: ['API routes defined', 'Request/response types correct', 'Error handling works'],
            });
        }
        // Task 4: Frontend components (if has frontend)
        if (hasFrontend) {
            subTasks.push({
                title: `Build frontend UI for ${moduleName}`,
                description: `Create React components for the module's frontend interface. Include state management and API integration.`,
                workflowType: 'feature',
                targetModule: moduleName,
                priority: priority++,
                estimatedComplexity: 'medium',
                dependsOn: metadata?.moduleType !== 'library' ? [2] : [1],
                acceptanceCriteria: ['Components render correctly', 'State management works', 'API calls succeed'],
            });
        }
        // Task 5: Integration and polish
        subTasks.push({
            title: `Integrate and test ${moduleName}`,
            description: `Wire up all components, add finishing touches, and ensure the module works end-to-end. Fix any integration issues.`,
            workflowType: 'feature',
            targetModule: moduleName,
            priority: priority++,
            estimatedComplexity: 'low',
            dependsOn: subTasks.map((_, i) => i),
            acceptanceCriteria: ['Module loads without errors', 'All features work together', 'No console errors'],
        });
        return subTasks;
    }
}
export default ModuleScaffoldAgent;
