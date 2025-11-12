/**
 * Code Agent
 * Generates and writes code based on implementation plans
 */

import { BaseAgent } from './base-agent.js';
import { AgentType, AgentInput, AgentOutput, ArtifactType } from '../types.js';
import { config } from '../config.js';
import * as logger from '../utils/logger.js';
import { getArtifacts } from '../workflow-state.js';
import { writeFile } from '../utils/file-system.js';
import {
  createBranch,
  getCurrentBranch,
  commitChanges,
} from '../utils/git-helper.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * Code generation result from AI
 */
interface CodeGenerationResult {
  success: boolean;
  branch: string;
  files: Array<{
    path: string;
    action: 'create' | 'modify' | 'delete';
    content: string;
    description: string;
  }>;
  commit: {
    message: string;
    description: string;
  };
  notes: string[];
}

export class CodeAgent extends BaseAgent {
  constructor() {
    super(AgentType.CODE, config.openrouter.models.coding);
  }

  /**
   * Execute code agent
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    try {
      logger.info('Code agent starting', { workflowId: input.workflowId });

      // Load plan from artifacts
      const plan = await this.loadPlanArtifact(input.workflowId);

      // Load system prompt
      const systemPrompt = await this.loadSystemPrompt('code-agent-prompt.md');

      // Build coding prompt
      const userPrompt = this.buildCodingPrompt(plan, input);

      // Call AI API
      logger.info('Calling AI for code generation');
      const aiResponse = await this.callOpenRouter(
        [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        {
          systemPrompt,
          maxTokens: 16384,
          temperature: 0.3, // Lower temperature for more consistent code
        }
      );

      // Parse AI response
      const codeResult = this.parseCodeResponse(aiResponse);

      // Validate code result
      this.validateCodeResult(codeResult);

      // Create git branch
      await getCurrentBranch();
      logger.info('Creating git branch', { branch: codeResult.branch });
      await createBranch(codeResult.branch);

      // Write files to disk
      const filesWritten = await this.writeFiles(codeResult.files);

      // Commit changes
      logger.info('Committing changes');
      const commitMessage = `${codeResult.commit.message}\n\n${codeResult.commit.description}\n\nFiles changed: ${filesWritten.join(', ')}`;
      await commitChanges(commitMessage);

      // Save code artifacts
      const artifactIds: number[] = [];
      for (const file of codeResult.files) {
        const artifactId = await this.saveArtifact({
          workflowId: input.workflowId,
          agentExecutionId: this.executionId!,
          type: ArtifactType.CODE,
          content: file.content,
          metadata: {
            filePath: file.path,
            action: file.action,
            description: file.description,
            branch: codeResult.branch,
          },
        });
        artifactIds.push(artifactId);
      }

      logger.info('Code generation successful', {
        filesWritten: filesWritten.length,
        branch: codeResult.branch,
        artifactIds: artifactIds.length,
      });

      return {
        success: true,
        artifacts: codeResult.files.map((file) => ({
          workflowId: input.workflowId,
          agentExecutionId: this.executionId!,
          type: ArtifactType.CODE,
          content: file.content,
        })),
        summary: `Generated ${filesWritten.length} files on branch '${codeResult.branch}'. ${codeResult.commit.message}`,
      };
    } catch (error) {
      logger.error('Code agent failed', error as Error);
      return {
        success: false,
        artifacts: [],
        summary: `Code generation failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Load plan artifact from previous agent
   */
  private async loadPlanArtifact(workflowId: number): Promise<any> {
    try {
      const artifacts = await getArtifacts(workflowId);
      const planArtifacts = artifacts.filter(
        (a: any) => a.type === ArtifactType.PLAN
      );

      if (planArtifacts.length === 0) {
        throw new Error('No plan artifact found - Plan agent must run first');
      }

      // Get most recent plan
      const planArtifact = planArtifacts[planArtifacts.length - 1];
      return JSON.parse(planArtifact.content);
    } catch (error) {
      logger.error('Failed to load plan artifact', error as Error);
      throw new Error(
        `Could not load plan: ${(error as Error).message}`
      );
    }
  }

  /**
   * Build coding prompt with plan and context
   */
  private buildCodingPrompt(plan: any, input: AgentInput): string {
    const taskDescription =
      input.taskDescription || plan.summary || 'No description';

    return `
Task: ${taskDescription}

Implementation Plan:
${JSON.stringify(plan, null, 2)}

Please generate the code to implement this plan. Follow these guidelines:
1. Create clean, well-documented TypeScript code
2. Follow SOLID principles and best practices
3. Use existing patterns and utilities in the codebase
4. Include proper error handling
5. Add JSDoc comments for public APIs
6. Ensure security best practices (no SQL injection, XSS, etc.)

Respond with JSON following this format:
{
  "success": true,
  "branch": "feature/descriptive-name",
  "files": [
    {
      "path": "src/example.ts",
      "action": "create|modify|delete",
      "content": "full file content...",
      "description": "what was changed"
    }
  ],
  "commit": {
    "message": "feat: short description",
    "description": "detailed explanation"
  },
  "notes": ["any important notes"]
}
    `.trim();
  }

  /**
   * Parse code response from AI
   */
  private parseCodeResponse(response: string): CodeGenerationResult {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const result = JSON.parse(jsonMatch[0]);

      // Ensure all required fields exist
      return {
        success: result.success !== false,
        branch: result.branch || 'feature/auto-generated',
        files: result.files || [],
        commit: {
          message: result.commit?.message || 'feat: auto-generated code',
          description:
            result.commit?.description || 'Code generated by AI agent',
        },
        notes: result.notes || [],
      };
    } catch (error) {
      logger.error('Failed to parse code response', error as Error);

      // Return a basic fallback
      return {
        success: false,
        branch: 'feature/fallback',
        files: [],
        commit: {
          message: 'feat: fallback implementation',
          description: 'AI response parsing failed, using fallback',
        },
        notes: ['Failed to parse AI response'],
      };
    }
  }

  /**
   * Validate code generation result
   */
  private validateCodeResult(result: CodeGenerationResult): void {
    if (!result.branch) {
      throw new Error('Code result must include a branch name');
    }

    if (!result.files || result.files.length === 0) {
      throw new Error('Code result must include at least one file');
    }

    for (const file of result.files) {
      if (!file.path) {
        throw new Error('Each file must have a path');
      }
      if (!file.action || !['create', 'modify', 'delete'].includes(file.action)) {
        throw new Error(`Invalid action for file ${file.path}: ${file.action}`);
      }
      if (file.action !== 'delete' && !file.content) {
        throw new Error(`File ${file.path} must have content`);
      }
    }

    logger.debug('Code result validation passed');
  }

  /**
   * Write files to disk
   */
  private async writeFiles(
    files: Array<{
      path: string;
      action: 'create' | 'modify' | 'delete';
      content: string;
    }>
  ): Promise<string[]> {
    const written: string[] = [];

    for (const file of files) {
      const fullPath = path.resolve(process.cwd(), file.path);

      try {
        if (file.action === 'delete') {
          // Delete file
          await fs.unlink(fullPath);
          logger.info('Deleted file', { path: file.path });
          written.push(file.path);
        } else if (file.action === 'create' || file.action === 'modify') {
          // Ensure directory exists
          const dir = path.dirname(fullPath);
          await fs.mkdir(dir, { recursive: true });

          // Write file
          await writeFile(file.path, file.content);
          logger.info(`${file.action === 'create' ? 'Created' : 'Modified'} file`, {
            path: file.path,
          });
          written.push(file.path);
        }
      } catch (error) {
        logger.error('Failed to write file', error as Error, {
          path: file.path,
        });
        throw new Error(
          `Failed to write file ${file.path}: ${(error as Error).message}`
        );
      }
    }

    return written;
  }

  /**
   * Override input validation - Code agent has different requirements
   */
  protected validateInput(input: AgentInput): void {
    if (!input.workflowId) {
      throw new Error('Missing required input: workflowId');
    }
    // Task description is optional - we'll load from plan artifact
  }
}
