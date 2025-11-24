/**
 * CodePlannerAgent
 * Analyzes codebase and creates implementation plans
 * Read-only access - can read files but not write or copy
 * Includes screenshot capability for visual analysis of existing UI
 */

import axios from 'axios';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import {
  ScreenshotManager,
  formatImageForVision,
  createScreenshotArtifact,
  type ScreenshotResult,
} from 'screenshot-tools';

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
  screenshotUrls?: string[]; // URLs to capture for visual planning reference
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
  structuredPlan?: StructuredPlan; // New: structured plan for sub-workflow creation
}

/**
 * Structured Plan for Sub-Workflow Generation
 */
export interface StructuredPlan {
  objective: string;
  totalSteps: number;
  estimatedDuration?: string;
  subTasks: SubTask[];
  dependencies?: Record<number, number[]>;
}

/**
 * Sub-task definition
 */
export interface SubTask {
  id: number;
  title: string;
  description: string;
  workflowType: 'feature' | 'bugfix' | 'documentation' | 'refactor';
  targetModule?: string;
  priority: number;
  estimatedComplexity: 'low' | 'medium' | 'high';
  dependsOn?: number[];
  acceptanceCriteria?: string[];
  metadata?: Record<string, any>;
}

/**
 * OpenRouter API Message - supports multimodal content
 */
interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; source?: any }>;
}

/**
 * CodePlannerAgent
 */
export class CodePlannerAgent {
  private model: string;
  private apiKey: string;
  private screenshotManager: ScreenshotManager;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    this.model = process.env.OPENROUTER_MODEL_PLANNING || 'anthropic/claude-sonnet-4-20250514';

    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }

    this.screenshotManager = new ScreenshotManager();
  }

  /**
   * Execute the planner agent
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    if (!input.workingDir) {
      throw new Error('workingDir is required for CodePlannerAgent');
    }

    try {
      await fs.access(input.workingDir);
    } catch (error) {
      throw new Error(`Working directory does not exist: ${input.workingDir}`);
    }

    const artifacts: AgentOutput['artifacts'] = [];

    try {
      // Capture screenshots if URLs provided for visual planning reference
      const screenshots: ScreenshotResult[] = [];
      if (input.screenshotUrls && input.screenshotUrls.length > 0) {
        for (const url of input.screenshotUrls) {
          const screenshotPath = path.join(
            input.workingDir,
            'screenshots',
            `plan-reference-${Date.now()}-${screenshots.length}.png`
          );
          const result = await this.screenshotManager.captureUrl({
            url,
            outputPath: screenshotPath,
            fullPage: true,
            waitTime: 2000,
          });
          if (result.success) {
            screenshots.push(result);
            artifacts.push(createScreenshotArtifact(result, `Visual reference for planning: ${url}`, { url }));
          }
        }
      }

      // Load tools.md to inform AI about available tools
      const toolsDoc = await this.loadToolsDocumentation();

      // Load system prompt
      const systemPrompt = this.buildSystemPrompt(toolsDoc);

      // Build user content with optional images
      const userContent = this.buildUserContent(input, screenshots);

      // Call OpenRouter API with multimodal support
      const aiResponse = await this.callOpenRouter([
        {
          role: 'user',
          content: userContent,
        },
      ], {
        systemPrompt,
        maxTokens: 8192,
        temperature: 0.7,
      });

      // Close browser
      await this.screenshotManager.close();

      // Parse and return response with screenshots
      const result = this.parseResponse(aiResponse, input);
      result.artifacts = [...artifacts, ...result.artifacts];
      return result;
    } catch (error) {
      await this.screenshotManager.close();
      return {
        success: false,
        artifacts,
        summary: `CodePlannerAgent failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Take a screenshot for planning reference
   */
  async captureReferenceScreenshot(
    url: string,
    description: string,
    outputDir: string
  ): Promise<{ artifact: AgentOutput['artifacts'][0] | null; result: ScreenshotResult }> {
    const screenshotPath = path.join(outputDir, 'screenshots', `plan-ref-${Date.now()}.png`);
    const result = await this.screenshotManager.captureUrl({
      url,
      outputPath: screenshotPath,
      fullPage: true,
      waitTime: 2000,
    });

    if (result.success) {
      return {
        artifact: createScreenshotArtifact(result, description, { url }),
        result,
      };
    }

    return { artifact: null, result };
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
    return `You are a CodePlannerAgent responsible for analyzing codebases and creating comprehensive implementation plans.

## Available Tools

${toolsDoc}

## Your Responsibilities

1. Analyze the codebase structure and understand the codebase
2. Read relevant files to understand context
3. Create detailed implementation plans WITH structured sub-tasks
4. Identify risks and dependencies
5. When screenshots are provided, incorporate visual analysis into planning
6. Break down complex tasks into sequential, manageable sub-workflows

## Structured Plan Format

For complex tasks, you MUST generate a structured plan in this exact JSON format at the END of your response:

\`\`\`json
{
  "objective": "High-level goal description",
  "totalSteps": 5,
  "estimatedDuration": "2-3 hours",
  "subTasks": [
    {
      "id": 0,
      "title": "Short task title",
      "description": "Detailed description of what needs to be done, including specific files to modify",
      "workflowType": "feature|bugfix|documentation|refactor",
      "targetModule": "ModuleName (if applicable)",
      "priority": 1,
      "estimatedComplexity": "low|medium|high",
      "dependsOn": [0, 1],
      "acceptanceCriteria": [
        "Criterion 1",
        "Criterion 2"
      ]
    }
  ],
  "dependencies": {
    "2": [0, 1]
  }
}
\`\`\`

### Sub-Task Guidelines:
- Each sub-task should be a single, focused change (one feature, one file group, one component)
- Tasks should be ordered logically (foundation first, then build on top)
- Use "dependsOn" array to specify which tasks must complete first (by id)
- Assign appropriate workflowType: "feature" for new functionality, "bugfix" for fixes, "refactor" for improvements
- Complexity: "low" (< 50 lines), "medium" (50-200 lines), "high" (> 200 lines or architectural changes)
- Each sub-task will become its own workflow executing sequentially

### When to Create Sub-Tasks:
- Task involves multiple distinct components/files
- Task has clear sequential steps
- Task is estimated to take > 30 minutes
- Task involves both backend and frontend changes

### When NOT to Create Sub-Tasks:
- Simple, single-file changes
- Quick fixes or minor updates
- Tasks < 15 minutes

## Visual Analysis for Planning

When images are provided:
- Analyze the current UI/UX state
- Identify components that need modification
- Plan visual changes and improvements
- Reference specific visual elements in your plan

## Restrictions

- You can ONLY read files - you cannot write, modify, or copy files
- Use the read-only tools provided to gather information
- Focus on analysis and planning, not implementation`;
  }

  /**
   * Build user content (text + optional images)
   */
  private buildUserContent(
    input: AgentInput,
    screenshots: ScreenshotResult[]
  ): string | Array<{ type: string; text?: string; source?: any }> {
    const textContent = `
Workflow ID: ${input.workflowId}
Workflow Type: ${input.workflowType || 'unknown'}
Target Module: ${input.targetModule || 'none'}
Task Description: ${input.taskDescription || 'none'}
Working Directory: ${input.workingDir}

Please analyze the codebase and create a comprehensive implementation plan for this task.
${screenshots.length > 0 ? `\n${screenshots.length} screenshot(s) have been captured as visual reference for your planning.` : ''}
    `.trim();

    if (screenshots.length === 0) {
      return textContent;
    }

    const content: Array<{ type: string; text?: string; source?: any }> = [
      { type: 'text', text: textContent },
    ];

    for (const screenshot of screenshots) {
      const imageContent = formatImageForVision(screenshot);
      if (imageContent) {
        content.push(imageContent as any);
      }
    }

    return content;
  }

  /**
   * Call OpenRouter API with multimodal support
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
          'X-Title': 'CodePlannerAgent',
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
      await fs.access(toolPath);

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
   * Parse AI response and extract structured plan
   */
  private parseResponse(response: string, input: AgentInput): AgentOutput {
    // Try to extract structured plan JSON from response
    let structuredPlan: StructuredPlan | undefined;
    
    try {
      // Look for JSON code block with structured plan
      const jsonMatch = response.match(/```json\s*\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        const planData = JSON.parse(jsonMatch[1]);
        
        // Validate it has the expected structure
        if (planData.objective && planData.subTasks && Array.isArray(planData.subTasks)) {
          structuredPlan = {
            objective: planData.objective,
            totalSteps: planData.totalSteps || planData.subTasks.length,
            estimatedDuration: planData.estimatedDuration,
            subTasks: planData.subTasks.map((task: any, index: number) => ({
              id: index,
              title: task.title || `Task ${index + 1}`,
              description: task.description || '',
              workflowType: task.workflowType || 'feature',
              targetModule: task.targetModule,
              priority: task.priority || index + 1,
              estimatedComplexity: task.estimatedComplexity || 'medium',
              dependsOn: task.dependsOn || [],
              acceptanceCriteria: task.acceptanceCriteria || [],
              metadata: task.metadata || {},
            })),
            dependencies: planData.dependencies || {},
          };

          console.log(`Extracted structured plan with ${structuredPlan.subTasks.length} sub-tasks for workflow ${input.workflowId}`);
        }
      }
    } catch (error) {
      console.warn('Failed to extract structured plan from response:', (error as Error).message);
      // Continue without structured plan
    }

    const artifacts: AgentOutput['artifacts'] = [{
      type: 'plan',
      content: response,
      metadata: {
        workflowId: input.workflowId,
      },
    }];

    // If structured plan was extracted, add it as a separate artifact
    if (structuredPlan) {
      artifacts.push({
        type: 'structured_plan',
        content: JSON.stringify(structuredPlan, null, 2),
        metadata: {
          workflowId: input.workflowId,
          totalSubTasks: structuredPlan.subTasks.length,
          canGenerateSubWorkflows: true,
        },
      });
    }

    return {
      success: true,
      artifacts,
      summary: structuredPlan
        ? `Created implementation plan with ${structuredPlan.subTasks.length} sub-tasks for workflow ${input.workflowId}`
        : `Created implementation plan for workflow ${input.workflowId}`,
      metadata: {
        workflowId: input.workflowId,
        responseLength: response.length,
        hasStructuredPlan: !!structuredPlan,
        subTaskCount: structuredPlan?.subTasks.length || 0,
      },
      structuredPlan,
    };
  }
}

export default CodePlannerAgent;
