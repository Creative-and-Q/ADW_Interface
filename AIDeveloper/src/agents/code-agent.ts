/**
 * Code Agent
 * Generates and writes code based on implementation plans
 */

import { BaseAgent } from './base-agent.js';
import { AgentType, AgentInput, AgentOutput, ArtifactType } from '../types.js';
import { config } from '../config.js';
import * as logger from '../utils/logger.js';
import { getArtifacts } from '../workflow-state.js';
import {
  createBranch,
  getCurrentBranch,
  commitChanges,
} from '../utils/git-helper.js';
import { addWorkflowStageComment } from '../utils/github-helper.js';
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

      // Get workflow directory and branch name from input (not from AI response)
      const workingDir = input.workingDir;
      const branchName = input.branchName;

      if (!workingDir) {
        throw new Error('Working directory not provided in input');
      }
      if (!branchName) {
        throw new Error('Branch name not provided in input');
      }

      // Create git branch in workflow directory (not root)
      await getCurrentBranch(workingDir);
      logger.info('Creating git branch in workflow directory', {
        branch: branchName,
        workingDir
      });
      await createBranch(branchName, workingDir);

      // Write files to workflow directory (not root)
      const filesWritten = await this.writeFiles(codeResult.files, workingDir);

      // Commit changes in workflow directory (not root)
      logger.info('Committing changes in workflow directory');
      const commitMessage = `${codeResult.commit.message}\n\n${codeResult.commit.description}\n\nFiles changed: ${filesWritten.join(', ')}`;
      await commitChanges(commitMessage, ['.'], workingDir);

      // Add GitHub comment to explain what this commit does
      const commentSummary = `${codeResult.commit.description}\n\nFiles modified:\n${filesWritten.map(f => `- ${f}`).join('\n')}`;
      await addWorkflowStageComment(
        input.workflowId,
        AgentType.CODE,
        'completed',
        commentSummary,
        workingDir,
        undefined, // duration will be calculated by base agent
        filesWritten.length
      );

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
            branch: branchName, // Use actual branch name, not AI's suggestion
          },
        });
        artifactIds.push(artifactId);
      }

      logger.info('Code generation successful', {
        filesWritten: filesWritten.length,
        branch: branchName, // Use actual branch name
        artifactIds: artifactIds.length,
        workingDir,
      });

      return {
        success: true,
        artifacts: codeResult.files.map((file) => ({
          workflowId: input.workflowId,
          agentExecutionId: this.executionId!,
          type: ArtifactType.CODE,
          content: file.content,
        })),
        summary: `Generated ${filesWritten.length} files on branch '${branchName}'. ${codeResult.commit.message}`,
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

    const reviewFeedback = input.context?.reviewFeedback;

    let prompt = `
Task: ${taskDescription}

Implementation Plan:
${JSON.stringify(plan, null, 2)}`;

    // Add feedback from previous failed attempt if this is a retry
    if (reviewFeedback) {
      prompt += `

CRITICAL - THIS IS A RETRY ATTEMPT:
The previous implementation failed security/quality checks.
You MUST fix ALL issues identified below:

`;

      if (reviewFeedback.issues || reviewFeedback.blockers) {
        prompt += `Security Lint Issues:\n`;
        const issueList = reviewFeedback.blockers || reviewFeedback.issues || [];
        issueList.forEach((issue: any, i: number) => {
          prompt += `${i + 1}. [${issue.severity}] ${issue.category}: ${issue.message}
   File: ${issue.file}${issue.line ? ` (line ${issue.line})` : ''}
   Fix: ${issue.recommendation}\n`;
        });
        prompt += '\n';
      }

      if (reviewFeedback.securityIssues) {
        prompt += `Review Security Issues:\n`;
        reviewFeedback.securityIssues.forEach((issue: any, i: number) => {
          prompt += `${i + 1}. [${issue.severity}] ${issue.category}: ${issue.description}
   ${issue.suggestion || ''}\n`;
        });
        prompt += '\n';
      }

      if (reviewFeedback.qualityIssues) {
        prompt += `Review Quality Issues:\n`;
        reviewFeedback.qualityIssues.forEach((issue: any, i: number) => {
          prompt += `${i + 1}. [${issue.severity}] ${issue.category}: ${issue.description}
   ${issue.suggestion || ''}\n`;
        });
        prompt += '\n';
      }

      prompt += `IMPORTANT: Your implementation MUST address every issue listed above. Double-check the security checklist in your system prompt.\n`;
    }

    prompt += `

Please generate the code to implement this plan. Follow these guidelines:
1. Create clean, well-documented TypeScript code
2. Follow SOLID principles and best practices
3. Use existing patterns and utilities in the codebase
4. Include proper error handling
5. Add JSDoc comments for public APIs
6. Ensure security best practices (no SQL injection, XSS, etc.)
7. CRITICAL: Follow ALL security requirements from your system prompt

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

    return prompt;
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
   * Write files to disk in the workflow directory
   */
  private async writeFiles(
    files: Array<{
      path: string;
      action: 'create' | 'modify' | 'delete';
      content: string;
    }>,
    workingDir: string
  ): Promise<string[]> {
    const written: string[] = [];

    for (const file of files) {
      // Resolve file path within the workflow directory, not the root
      const fullPath = path.resolve(workingDir, file.path);

      try {
        if (file.action === 'delete') {
          // Delete file - check if exists first
          try {
            await fs.access(fullPath);
            await fs.unlink(fullPath);
            logger.info('Deleted file', { path: file.path });
            written.push(file.path);
          } catch (accessError: any) {
            if (accessError.code === 'ENOENT') {
              logger.warn('File to delete not found, skipping', { path: file.path });
              // Still count as "written" since the desired state (file gone) is achieved
              written.push(file.path);
            } else {
              throw accessError;
            }
          }
        } else if (file.action === 'create' || file.action === 'modify') {
          // Ensure directory exists
          const dir = path.dirname(fullPath);
          await fs.mkdir(dir, { recursive: true });

          // Write file directly to the full path in the workflow directory
          await fs.writeFile(fullPath, file.content, 'utf-8');
          logger.info(`${file.action === 'create' ? 'Created' : 'Modified'} file`, {
            path: file.path,
            fullPath, // Log the full path for debugging
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
