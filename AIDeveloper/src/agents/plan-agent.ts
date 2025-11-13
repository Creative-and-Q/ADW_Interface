/**
 * Plan Agent
 * Analyzes tasks and creates comprehensive implementation plans
 */

import { BaseAgent } from './base-agent.js';
import { AgentType, AgentInput, AgentOutput, ArtifactType } from '../types.js';
import { config } from '../config.js';
import * as logger from '../utils/logger.js';
import { getProjectStructure, getCodebaseStatistics } from '../utils/code-analyzer.js';

/**
 * Plan structure
 */
interface Plan {
  summary: string;
  scope: string;
  complexity: string;
  estimatedFiles: number;
  files: {
    create: string[];
    modify: string[];
    delete: string[];
  };
  steps: Array<{
    number: number;
    action: string;
    files: string[];
    reason: string;
  }>;
  risks: Array<{
    risk: string;
    mitigation: string;
  }>;
  testStrategy: string;
  dependencies: string[];
}

export class PlanAgent extends BaseAgent {
  constructor() {
    super(AgentType.PLAN, config.openrouter.models.planning);
  }

  /**
   * Execute plan agent
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    try {
      logger.info('Plan agent starting', { workflowId: input.workflowId });

      // Log step: Extract task information
      if (this.executionLogger) {
        await this.executionLogger.logStep('Extracting task description');
      }
      const taskDescription = this.extractTaskDescription(input);

      // Log step: Gather codebase context
      if (this.executionLogger) {
        await this.executionLogger.logStep('Gathering codebase context');
      }
      const codebaseContext = await this.gatherCodebaseContext();

      // Log step: Load system prompt
      if (this.executionLogger) {
        await this.executionLogger.logStep('Loading system prompt', {
          promptFile: 'plan-agent-prompt.md',
        });
      }
      const systemPrompt = await this.loadSystemPrompt('plan-agent-prompt.md');

      // Extract review feedback from context (for retry attempts)
      const reviewFeedback = input.context?.reviewFeedback;

      // Log step: Build planning prompt
      if (this.executionLogger) {
        await this.executionLogger.logStep('Building planning prompt', {
          taskDescriptionLength: taskDescription.length,
          codebaseContextLength: codebaseContext.length,
          hasReviewFeedback: !!reviewFeedback,
        });
      }
      const userPrompt = this.buildPlanningPrompt(taskDescription, codebaseContext, reviewFeedback);

      // Call AI API (already logged by BaseAgent)
      logger.info('Calling AI for plan generation');
      const aiResponse = await this.callOpenRouter(
        [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        {
          systemPrompt,
          maxTokens: 8192,
          temperature: 0.7,
        }
      );

      // Log step: Parse AI response
      if (this.executionLogger) {
        await this.executionLogger.logStep('Parsing AI response', {
          responseLength: aiResponse.length,
        });
      }
      const plan = this.parsePlanResponse(aiResponse);

      // Log step: Validate plan
      if (this.executionLogger) {
        await this.executionLogger.logStep('Validating plan', {
          stepsCount: plan.steps.length,
          filesToCreate: plan.files.create.length,
          filesToModify: plan.files.modify.length,
        });
      }
      this.validatePlan(plan);

      // Log step: Save plan as artifact
      if (this.executionLogger) {
        await this.executionLogger.logStep('Saving plan artifact');
      }
      const artifactId = await this.saveArtifact({
        workflowId: input.workflowId,
        agentExecutionId: this.executionId!,
        type: ArtifactType.PLAN,
        content: JSON.stringify(plan, null, 2),
        metadata: {
          taskDescription,
          estimatedFiles: plan.estimatedFiles,
          complexity: plan.complexity,
        },
      });

      // Log plan generated
      if (this.executionLogger) {
        await this.executionLogger.logPlanGenerated(plan);
      }

      logger.info('Plan generated successfully', {
        artifactId,
        steps: plan.steps.length,
        estimatedFiles: plan.estimatedFiles,
      });

      return {
        success: true,
        artifacts: [
          {
            workflowId: input.workflowId,
            agentExecutionId: this.executionId!,
            type: ArtifactType.PLAN,
            content: JSON.stringify(plan, null, 2),
            id: artifactId,
          },
        ],
        summary: `Plan created: ${plan.summary}. ${plan.steps.length} steps, ${plan.estimatedFiles} files affected.`,
      };
    } catch (error) {
      // Log exception
      if (this.executionLogger) {
        await this.executionLogger.logException(error as Error, {
          stage: 'plan generation',
        });
      }

      logger.error('Plan agent failed', error as Error);
      return {
        success: false,
        artifacts: [],
        summary: `Plan generation failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Extract task description from input
   */
  private extractTaskDescription(input: AgentInput): string {
    if (input.taskDescription) {
      return input.taskDescription;
    }

    if (input.webhookPayload?.customData?.taskDescription) {
      return input.webhookPayload.customData.taskDescription;
    }

    if (input.context?.previousResults?.length) {
      // Try to extract from previous results
      return 'Continue from previous steps';
    }

    return 'No task description provided';
  }

  /**
   * Gather codebase context
   */
  private async gatherCodebaseContext(): Promise<string> {
    try {
      const structure = await getProjectStructure(process.cwd());

      // Get all files for statistics
      const allFiles = Object.values(structure.filesByType).flat();
      const stats = await getCodebaseStatistics(allFiles);

      // Log codebase analysis
      if (this.executionLogger) {
        await this.executionLogger.logCodebaseAnalysis({
          totalFiles: stats.totalFiles,
          totalLines: stats.totalLines,
          languages: Object.keys(stats.filesByLanguage),
          directories: structure.directories.length,
          fileTypes: Object.keys(structure.filesByType),
        });
      }

      const structureStr = `Directories: ${structure.directories.length}, File Types: ${Object.keys(structure.filesByType).join(', ')}, Entry Points: ${structure.entryPoints.join(', ')}`;

      return `
Codebase Statistics:
- Total Files: ${stats.totalFiles}
- Total Lines: ${stats.totalLines}
- Languages: ${Object.keys(stats.filesByLanguage).join(', ')}

Project Structure:
${structureStr}
      `.trim();
    } catch (error) {
      // Log exception
      if (this.executionLogger) {
        await this.executionLogger.logException(error as Error, {
          operation: 'gather codebase context',
        });
      }

      logger.warn('Failed to gather codebase context', {
        error: (error as Error).message,
      });
      return 'Codebase context not available';
    }
  }

  /**
   * Build planning prompt
   */
  private buildPlanningPrompt(
    taskDescription: string,
    codebaseContext: string,
    reviewFeedback?: any
  ): string {
    let prompt = `
Task: ${taskDescription}

Context:
${codebaseContext}`;

    // Add review/security feedback if this is a retry attempt
    if (reviewFeedback) {
      prompt += `

IMPORTANT - RETRY ATTEMPT:
This is a retry attempt. The previous implementation failed review/security checks.
You MUST address ALL of the following issues in your new plan:

`;

      // Handle security lint feedback
      if (reviewFeedback.issues || reviewFeedback.blockers) {
        prompt += `
Security Issues Found:
- Total Issues: ${reviewFeedback.totalIssues || 0}
- Blockers (Critical/High): ${reviewFeedback.blockers?.length || 0}

`;

        if (reviewFeedback.blockers && reviewFeedback.blockers.length > 0) {
          prompt += `Blocking Security Issues:\n`;
          reviewFeedback.blockers.forEach((issue: any, i: number) => {
            prompt += `${i + 1}. [${issue.severity}] ${issue.category}: ${issue.message}
   File: ${issue.file}${issue.line ? `:${issue.line}` : ''}
   Recommendation: ${issue.recommendation}\n`;
          });
          prompt += '\n';
        }

        if (reviewFeedback.issues && reviewFeedback.issues.length > 0) {
          prompt += `All Security Issues:\n`;
          reviewFeedback.issues.forEach((issue: any, i: number) => {
            prompt += `${i + 1}. [${issue.severity}] ${issue.category}: ${issue.message}
   File: ${issue.file}${issue.line ? `:${issue.line}` : ''}
   Recommendation: ${issue.recommendation}\n`;
          });
          prompt += '\n';
        }
      }

      // Handle review feedback
      if (reviewFeedback.securityIssues || reviewFeedback.qualityIssues) {
        if (reviewFeedback.securityIssues && reviewFeedback.securityIssues.length > 0) {
          prompt += `Review - Security Issues:\n`;
          reviewFeedback.securityIssues.forEach((issue: any, i: number) => {
            prompt += `${i + 1}. [${issue.severity}] ${issue.category}: ${issue.description}
   ${issue.filePath ? `File: ${issue.filePath}${issue.lineNumber ? `:${issue.lineNumber}` : ''}` : ''}
   ${issue.suggestion ? `Suggestion: ${issue.suggestion}` : ''}\n`;
          });
          prompt += '\n';
        }

        if (reviewFeedback.qualityIssues && reviewFeedback.qualityIssues.length > 0) {
          prompt += `Review - Quality Issues:\n`;
          reviewFeedback.qualityIssues.forEach((issue: any, i: number) => {
            prompt += `${i + 1}. [${issue.severity}] ${issue.category}: ${issue.description}
   ${issue.filePath ? `File: ${issue.filePath}${issue.lineNumber ? `:${issue.lineNumber}` : ''}` : ''}
   ${issue.suggestion ? `Suggestion: ${issue.suggestion}` : ''}\n`;
          });
          prompt += '\n';
        }
      }

      prompt += `
YOUR PLAN MUST:
1. Address EVERY security issue listed above with specific fixes
2. Include proper input validation, sanitization, and security controls
3. Follow OWASP Top 10 guidelines (no SQL injection, XSS, command injection, etc.)
4. Implement proper authentication and authorization where needed
5. Include security-specific test cases to verify fixes
6. Document all security improvements made

Your revised plan should be significantly different from the failed attempt and explicitly describe how each security issue will be resolved.
`;
    }

    prompt += `

Please analyze this task and create a detailed implementation plan following the format specified in your system prompt. Provide a JSON response with the plan structure including:
- summary
- scope
- complexity
- estimatedFiles
- files (create, modify, delete arrays)
- steps (numbered with action, files, reason)
- risks (risk and mitigation)
- testStrategy
- dependencies
    `.trim();

    return prompt;
  }

  /**
   * Parse plan response from AI
   */
  private parsePlanResponse(response: string): Plan {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const plan = JSON.parse(jsonMatch[0]);

      // Ensure all required fields exist
      return {
        summary: plan.summary || 'No summary provided',
        scope: plan.scope || 'feature',
        complexity: plan.complexity || 'medium',
        estimatedFiles: plan.estimatedFiles || 0,
        files: {
          create: plan.files?.create || [],
          modify: plan.files?.modify || [],
          delete: plan.files?.delete || [],
        },
        steps: plan.steps || [],
        risks: plan.risks || [],
        testStrategy: plan.testStrategy || 'No test strategy provided',
        dependencies: plan.dependencies || [],
      };
    } catch (error) {
      logger.error('Failed to parse plan response', error as Error);

      // Log the raw response for debugging
      logger.error('Raw AI response that failed to parse', undefined, { response });

      // Throw error instead of returning useless fallback - a bad plan is worse than no plan
      throw new Error(
        `Failed to parse plan from AI response: ${(error as Error).message}. ` +
        'The AI may not be following the required JSON format.'
      );
    }
  }

  /**
   * Validate plan completeness
   */
  private validatePlan(plan: Plan): void {
    if (!plan.summary) {
      throw new Error('Plan must include a summary');
    }

    if (!plan.steps || plan.steps.length === 0) {
      throw new Error('Plan must include at least one step');
    }

    logger.debug('Plan validation passed');
  }

  /**
   * Override input validation - Plan agent has different requirements
   */
  protected validateInput(input: AgentInput): void {
    if (!input.workflowId) {
      throw new Error('Missing required input: workflowId');
    }
    // Task description is optional - we'll try to extract it from various sources
  }
}
