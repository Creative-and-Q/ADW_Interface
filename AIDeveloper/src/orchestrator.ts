/**
 * Orchestrator Agent
 * Main AI agent that coordinates workflow execution
 */

import { BaseAgent } from './agents/base-agent.js';
import {
  AgentType,
  AgentInput,
  AgentOutput,
  WorkflowType,
  WorkflowStatus,
  AgentStatus,
} from './types.js';
import { config } from './config.js';
import * as logger from './utils/logger.js';
import {
  getWorkflow,
  updateWorkflowStatus,
  completeWorkflow,
  failWorkflow,
  getWorkflowResumeState,
  resetWorkflowForResume,
} from './workflow-state.js';
import { agentManager } from './agent-manager.js';
import { createBranch } from './utils/git-helper.js';
import {
  createWorkflowDirectory,
  logAgentStage,
  createStageDoc,
  updateWorkflowStatus as updateWorkflowDirStatus,
  getWorkflowRepoPath,
} from './utils/workflow-directory-manager.js';
import { createPullRequest } from './utils/github-helper.js';

/**
 * Workflow configuration
 */
interface WorkflowConfig {
  type: WorkflowType;
  agents: AgentType[];
  maxRetries: number;
  timeoutMs: number;
}

/**
 * Workflow execution plan
 */
interface ExecutionPlan {
  workflowId: number;
  config: WorkflowConfig;
  steps: AgentType[];
}

/**
 * Orchestrator Agent
 */
export class Orchestrator extends BaseAgent {
  private workflowConfigs: Map<WorkflowType, WorkflowConfig>;

  constructor() {
    super(AgentType.ORCHESTRATOR, config.openrouter.models.planning);
    this.workflowConfigs = this.initializeWorkflowConfigs();
  }

  /**
   * Initialize workflow configurations
   */
  private initializeWorkflowConfigs(): Map<WorkflowType, WorkflowConfig> {
    const configs = new Map<WorkflowType, WorkflowConfig>();

    // Feature workflow: Plan → Code → Security Lint → Test → Review → Document
    configs.set(WorkflowType.FEATURE, {
      type: WorkflowType.FEATURE,
      agents: [
        AgentType.PLAN,
        AgentType.CODE,
        AgentType.SECURITY_LINT,
        AgentType.TEST,
        AgentType.REVIEW,
        AgentType.DOCUMENT,
      ],
      maxRetries: 3,
      timeoutMs: config.agents.timeoutMs,
    });

    // Bugfix workflow: Plan → Code → Security Lint → Test → Review
    configs.set(WorkflowType.BUGFIX, {
      type: WorkflowType.BUGFIX,
      agents: [AgentType.PLAN, AgentType.CODE, AgentType.SECURITY_LINT, AgentType.TEST, AgentType.REVIEW],
      maxRetries: 3,
      timeoutMs: config.agents.timeoutMs,
    });

    // Refactor workflow: Plan → Code → Security Lint → Test → Review → Document
    configs.set(WorkflowType.REFACTOR, {
      type: WorkflowType.REFACTOR,
      agents: [
        AgentType.PLAN,
        AgentType.CODE,
        AgentType.SECURITY_LINT,
        AgentType.TEST,
        AgentType.REVIEW,
        AgentType.DOCUMENT,
      ],
      maxRetries: 3,
      timeoutMs: config.agents.timeoutMs,
    });

    // Documentation workflow: Document only
    configs.set(WorkflowType.DOCUMENTATION, {
      type: WorkflowType.DOCUMENTATION,
      agents: [AgentType.DOCUMENT],
      maxRetries: 2,
      timeoutMs: config.agents.timeoutMs,
    });

    // Review workflow: Review only
    configs.set(WorkflowType.REVIEW, {
      type: WorkflowType.REVIEW,
      agents: [AgentType.REVIEW],
      maxRetries: 2,
      timeoutMs: config.agents.timeoutMs,
    });

    return configs;
  }

  /**
   * Execute workflow orchestration
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    logger.info(`Orchestrator executing workflow ${input.workflowId}`);

    // Validate input
    this.validateInput(input);

    let branchName = '';

    try {
      // Analyze request and create execution plan
      const plan = await this.createExecutionPlan(input.workflowId);

      if (!plan) {
        throw new Error('Failed to create execution plan');
      }

      // Generate branch name
      branchName = this.generateBranchName(input.workflowId, plan.config.type);

      // Create workflow directory (clones repo, installs deps, builds)
      await createWorkflowDirectory(input.workflowId, branchName, plan.config.type);

      // Get the workflow repository path
      const workflowRepoPath = getWorkflowRepoPath(input.workflowId, branchName);

      // Create git branch in the workflow repository
      await this.createWorkflowBranch(branchName, workflowRepoPath);

      // Update workflow status with branch name
      await updateWorkflowStatus(input.workflowId, WorkflowStatus.PLANNING, branchName);

      logger.info('Execution plan created', {
        workflowId: input.workflowId,
        type: plan.config.type,
        steps: plan.steps.length,
        branch: branchName,
      });

      // Execute workflow
      const result = await this.executeWorkflow(plan, branchName);

      if (result.success) {
        await completeWorkflow(input.workflowId);
        await updateWorkflowDirStatus(
          input.workflowId,
          branchName,
          'completed',
          result.summary
        );
        logger.info(`Workflow ${input.workflowId} completed successfully`);

        // Create pull request on GitHub
        const prResult = await createPullRequest(
          input.workflowId,
          branchName,
          plan.config.type,
          workflowRepoPath,
          result.summary
        );

        if (prResult.success) {
          logger.info('Pull request created', { prUrl: prResult.prUrl });
          result.summary += `\n\nPull Request: ${prResult.prUrl}`;
        } else {
          logger.warn('Failed to create pull request', { error: prResult.error });
        }
      } else {
        await failWorkflow(input.workflowId, result.summary);
        await updateWorkflowDirStatus(
          input.workflowId,
          branchName,
          'failed',
          result.summary
        );
        logger.error(`Workflow ${input.workflowId} failed: ${result.summary}`);
      }

      return result;
    } catch (error) {
      logger.error('Orchestrator execution failed', error as Error);

      await failWorkflow(input.workflowId, (error as Error).message);

      if (branchName) {
        await updateWorkflowDirStatus(
          input.workflowId,
          branchName,
          'failed',
          (error as Error).message
        );
      }

      return {
        success: false,
        artifacts: [],
        summary: `Orchestrator failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Resume a failed/cancelled workflow from its last checkpoint
   * Loads completed agent outputs and continues from the failure point
   */
  async resumeWorkflow(workflowId: number, fromAgentIndex?: number): Promise<AgentOutput> {
    logger.info(`Resuming workflow ${workflowId}`, { fromAgentIndex });

    try {
      // Get workflow resume state
      const resumeState = await getWorkflowResumeState(workflowId);

      if (!resumeState) {
        throw new Error('Workflow not found');
      }

      if (!resumeState.canResume) {
        throw new Error(
          `Workflow cannot be resumed. Status: ${resumeState.workflow.status}, ` +
          `Completed agents: ${resumeState.completedAgents.length}`
        );
      }

      // Get the workflow branch name
      const branchName = resumeState.workflow.branchName;
      if (!branchName) {
        throw new Error('Workflow branch name not found');
      }

      logger.info('Workflow resume state loaded', {
        workflowId,
        completedAgents: resumeState.completedAgents.length,
        failedAgent: resumeState.failedAgent?.agentType,
        branchName,
      });

      // Create execution plan
      const plan = await this.createExecutionPlan(workflowId);
      if (!plan) {
        throw new Error('Failed to create execution plan');
      }

      // Determine resume point (default to after last completed agent)
      const resumeFromIdx = fromAgentIndex ?? resumeState.resumeFromIndex;

      // Validate resume index
      if (resumeFromIdx < 0 || resumeFromIdx >= plan.steps.length) {
        throw new Error(
          `Invalid resume index ${resumeFromIdx}. Valid range: 0-${plan.steps.length - 1}`
        );
      }

      // Reconstruct previous agent outputs for context
      const previousResults: AgentOutput[] = resumeState.completedAgents.map(agent => ({
        success: agent.status === AgentStatus.COMPLETED,
        summary: agent.output?.summary || '',
        artifacts: agent.output?.artifacts || [],
      }));

      logger.info(`Resuming from agent ${resumeFromIdx}: ${plan.steps[resumeFromIdx]}`, {
        previousResults: previousResults.length,
      });

      // Reset workflow status to PENDING
      await resetWorkflowForResume(workflowId);

      // Execute remaining agents starting from resume point
      const result = await this.executeWorkflowFromCheckpoint(
        plan,
        branchName,
        resumeFromIdx,
        previousResults
      );

      if (result.success) {
        await completeWorkflow(workflowId);
        await updateWorkflowDirStatus(workflowId, branchName, 'completed', result.summary);
        logger.info(`Workflow ${workflowId} completed after resume`);

        // Get the workflow repository path
        const workflowRepoPath = getWorkflowRepoPath(workflowId, branchName);

        // Create pull request on GitHub
        const prResult = await createPullRequest(
          workflowId,
          branchName,
          plan.config.type,
          workflowRepoPath,
          result.summary
        );

        if (prResult.success) {
          logger.info('Pull request created', { prUrl: prResult.prUrl });
          result.summary += `\n\nPull Request: ${prResult.prUrl}`;
        }
      } else {
        await failWorkflow(workflowId, result.summary);
        await updateWorkflowDirStatus(workflowId, branchName, 'failed', result.summary);
        logger.error(`Workflow ${workflowId} failed after resume: ${result.summary}`);
      }

      return result;
    } catch (error) {
      logger.error('Workflow resume failed', error as Error);
      await failWorkflow(workflowId, (error as Error).message);

      return {
        success: false,
        artifacts: [],
        summary: `Resume failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Execute workflow from a specific checkpoint (resume point)
   * @param plan Execution plan
   * @param branchName Git branch name
   * @param startIndex Index of first agent to execute (checkpoint)
   * @param previousResults Outputs from completed agents before checkpoint
   */
  private async executeWorkflowFromCheckpoint(
    plan: ExecutionPlan,
    branchName: string,
    startIndex: number,
    previousResults: AgentOutput[]
  ): Promise<AgentOutput> {
    const results: AgentOutput[] = [...previousResults];
    const artifacts: any[] = [];

    logger.info('Executing workflow from checkpoint', {
      workflowId: plan.workflowId,
      startIndex,
      totalSteps: plan.steps.length,
      previousResults: previousResults.length,
    });

    // Execute remaining agents starting from checkpoint
    for (let i = startIndex; i < plan.steps.length; i++) {
      const agentType = plan.steps[i];
      const stageNumber = i + 1;
      const startTime = Date.now();

      try {
        logger.info(
          `Executing step ${stageNumber}/${plan.steps.length}: ${agentType} (resumed)`,
          { workflowId: plan.workflowId }
        );

        // Update workflow status
        await this.updateWorkflowStatusForAgent(plan.workflowId, agentType);

        // Log agent stage start
        await logAgentStage(plan.workflowId, branchName, agentType, 'start', {
          input: { workflowId: plan.workflowId, previousResults: results },
        });

        // Execute agent
        const result = await this.executeAgent(
          plan.workflowId,
          agentType,
          results,
          branchName
        );

        const duration = Date.now() - startTime;
        results.push(result);

        if (result.artifacts) {
          artifacts.push(...result.artifacts);
        }

        if (!result.success) {
          // Log agent stage failure
          await logAgentStage(plan.workflowId, branchName, agentType, 'failed', {
            output: result,
            error: result.summary,
            duration,
          });

          logger.error(`Agent ${agentType} failed during resume`, undefined, {
            workflowId: plan.workflowId,
            summary: result.summary,
          });

          return {
            success: false,
            artifacts,
            summary: `Agent ${agentType} failed: ${result.summary}`,
          };
        }

        // Log agent stage completion
        await logAgentStage(plan.workflowId, branchName, agentType, 'complete', {
          output: result,
          duration,
        });

        logger.info(`Agent ${agentType} completed successfully during resume`, {
          workflowId: plan.workflowId,
          duration,
        });
      } catch (error) {
        logger.error(`Agent ${agentType} execution error during resume`, error as Error);

        return {
          success: false,
          artifacts,
          summary: `Agent ${agentType} error: ${(error as Error).message}`,
        };
      }
    }

    return {
      success: true,
      artifacts,
      summary: 'Workflow resumed and completed successfully',
    };
  }

  /**
   * Analyze request and determine workflow type
   */
  private async analyzeRequest(payload: any): Promise<WorkflowType> {
    // For Phase 3, we extract workflow type from payload
    // Phase 4+ can use AI to analyze and determine workflow type

    if (payload?.customData?.workflowType) {
      return payload.customData.workflowType as WorkflowType;
    }

    if (payload?.workflowType) {
      return payload.workflowType as WorkflowType;
    }

    // Default to feature workflow
    return WorkflowType.FEATURE;
  }

  /**
   * Create execution plan
   */
  private async createExecutionPlan(
    workflowId: number
  ): Promise<ExecutionPlan | null> {
    const workflow = await getWorkflow(workflowId);
    if (!workflow) {
      logger.error('Workflow not found', undefined, { workflowId });
      return null;
    }

    // Determine workflow type
    const workflowType = await this.analyzeRequest(workflow.payload);

    // Get workflow configuration
    const config = this.workflowConfigs.get(workflowType);
    if (!config) {
      logger.error('Unknown workflow type', undefined, { workflowType });
      return null;
    }

    return {
      workflowId,
      config,
      steps: [...config.agents],
    };
  }

  /**
   * Generate workflow branch name
   */
  private generateBranchName(
    workflowId: number,
    workflowType: WorkflowType
  ): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `workflow/${workflowType}-${workflowId}-${timestamp}`;
  }

  /**
   * Create workflow branch in the isolated repository
   */
  private async createWorkflowBranch(
    branchName: string,
    workingDir: string
  ): Promise<void> {
    const result = await createBranch(branchName, workingDir);

    if (!result.success) {
      throw new Error(`Failed to create branch: ${result.error}`);
    }

    logger.info(`Created workflow branch: ${branchName}`, { workingDir });
  }

  /**
   * Execute workflow
   */
  private async executeWorkflow(
    plan: ExecutionPlan,
    branchName: string,
    retryCount: number = 0,
    reviewFeedback?: any
  ): Promise<AgentOutput> {
    const results: AgentOutput[] = [];
    const artifacts: any[] = [];
    const maxRetries = 5; // Allow up to 5 retries on review failure

    logger.info('Executing workflow', {
      workflowId: plan.workflowId,
      type: plan.config.type,
      steps: plan.steps,
      retryCount,
      hasReviewFeedback: !!reviewFeedback,
    });

    // Execute each agent in sequence
    for (let i = 0; i < plan.steps.length; i++) {
      const agentType = plan.steps[i];
      const stageNumber = i + 1;
      const startTime = Date.now();

      try {
        logger.info(`Executing step ${stageNumber}/${plan.steps.length}: ${agentType}`, {
          workflowId: plan.workflowId,
        });

        // Update workflow status
        await this.updateWorkflowStatusForAgent(plan.workflowId, agentType);

        // Log agent stage start
        await logAgentStage(plan.workflowId, branchName, agentType, 'start', {
          input: { workflowId: plan.workflowId, previousResults: results },
        });

        // Execute agent
        const result = await this.executeAgent(
          plan.workflowId,
          agentType,
          results,
          branchName,
          reviewFeedback
        );

        const duration = Date.now() - startTime;

        results.push(result);

        if (result.artifacts) {
          artifacts.push(...result.artifacts);
        }

        if (!result.success) {
          // Log agent stage failure
          await logAgentStage(plan.workflowId, branchName, agentType, 'failed', {
            output: result,
            error: result.summary,
            duration,
          });

          logger.error(`Agent ${agentType} failed`, undefined, {
            workflowId: plan.workflowId,
            summary: result.summary,
          });

          // Check if this is a SECURITY_LINT or REVIEW failure and we can retry
          if (
            (agentType === AgentType.SECURITY_LINT || agentType === AgentType.REVIEW) &&
            retryCount < maxRetries
          ) {
            const stageName = agentType === AgentType.SECURITY_LINT ? 'Security Lint' : 'Review';

            logger.info(`${stageName} failed - attempting retry with feedback`, {
              workflowId: plan.workflowId,
              retryCount: retryCount + 1,
              maxRetries,
            });

            // Extract feedback from artifacts
            const feedbackReport = result.artifacts?.[0]?.content
              ? JSON.parse(result.artifacts[0].content)
              : null;

            // Log retry attempt
            await logAgentStage(plan.workflowId, branchName, AgentType.PLAN, 'start', {
              input: {
                reason: `${stageName} failed - retrying from PLAN stage with feedback`,
                retryCount: retryCount + 1,
                maxRetries,
                feedback: feedbackReport,
                failedStage: agentType,
              },
            });

            // Retry workflow from PLAN stage with feedback
            return await this.executeWorkflow(
              plan,
              branchName,
              retryCount + 1,
              feedbackReport
            );
          }

          return {
            success: false,
            artifacts,
            summary: `Workflow failed at ${agentType}: ${result.summary}`,
          };
        }

        // Log agent stage completion
        await logAgentStage(plan.workflowId, branchName, agentType, 'complete', {
          output: result,
          duration,
        });

        // Create stage documentation
        await createStageDoc(plan.workflowId, branchName, agentType, stageNumber, {
          title: `${agentType} Agent Execution`,
          summary: result.summary || 'Agent executed successfully',
          input: JSON.stringify({ workflowId: plan.workflowId }, null, 2),
          output: JSON.stringify(result, null, 2),
          artifacts: result.artifacts?.map((a: any) => a.filePath || a.type) || [],
          duration,
        });

        logger.info(`Step ${stageNumber}/${plan.steps.length} completed: ${agentType}`, {
          workflowId: plan.workflowId,
        });
      } catch (error) {
        const duration = Date.now() - startTime;

        // Log agent stage error
        await logAgentStage(plan.workflowId, branchName, agentType, 'failed', {
          error: (error as Error).message,
          duration,
        });

        logger.error(`Agent ${agentType} error`, error as Error);

        return {
          success: false,
          artifacts,
          summary: `Workflow failed at ${agentType}: ${(error as Error).message}`,
        };
      }
    }

    // Generate final report
    const report = this.generateReport(plan, results);

    return {
      success: true,
      artifacts,
      summary: report,
    };
  }

  /**
   * Execute individual agent
   */
  private async executeAgent(
    workflowId: number,
    agentType: AgentType,
    previousResults: AgentOutput[],
    branchName: string,
    reviewFeedback?: any
  ): Promise<AgentOutput> {
    // Fetch workflow data to get task description and payload
    const workflow = await getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Extract task description from payload
    const payload = workflow.payload as any;
    const taskDescription =
      payload?.customData?.taskDescription ||
      payload?.taskDescription ||
      '';

    // Get workflow repository path (isolated workspace)
    const workingDir = getWorkflowRepoPath(workflowId, branchName);

    const input: AgentInput = {
      workflowId,
      branchName,
      taskDescription,
      webhookPayload: workflow.payload,
      workingDir, // Pass isolated repository directory to agents
      context: {
        previousResults,
        reviewFeedback, // Pass review feedback for retry attempts
      },
    };

    // Spawn agent
    const agentId = await agentManager.spawnAgent(agentType, input);

    logger.info('Agent started', {
      agentId,
      type: agentType,
      workflowId,
    });

    // Wait for agent completion
    const output = await agentManager.waitForAgent(
      agentId,
      config.agents.timeoutMs
    );

    logger.info('Agent completed', {
      agentId,
      type: agentType,
      workflowId,
    });

    return output;
  }

  /**
   * Update workflow status based on current agent
   */
  private async updateWorkflowStatusForAgent(
    workflowId: number,
    agentType: AgentType
  ): Promise<void> {
    let status: WorkflowStatus;

    switch (agentType) {
      case AgentType.PLAN:
        status = WorkflowStatus.PLANNING;
        break;
      case AgentType.CODE:
        status = WorkflowStatus.CODING;
        break;
      case AgentType.SECURITY_LINT:
        status = WorkflowStatus.SECURITY_LINTING;
        break;
      case AgentType.TEST:
        status = WorkflowStatus.TESTING;
        break;
      case AgentType.REVIEW:
        status = WorkflowStatus.REVIEWING;
        break;
      case AgentType.DOCUMENT:
        status = WorkflowStatus.DOCUMENTING;
        break;
      default:
        return;
    }

    await updateWorkflowStatus(workflowId, status);
  }

  /**
   * Generate workflow report
   */
  private generateReport(
    plan: ExecutionPlan,
    results: AgentOutput[]
  ): string {
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    const report = [
      `Workflow ${plan.config.type} completed`,
      `Steps executed: ${results.length}/${plan.steps.length}`,
      `Successful: ${successful}`,
      `Failed: ${failed}`,
      '',
      'Agent Results:',
      ...results.map((r, i) => `  ${i + 1}. ${plan.steps[i]}: ${r.summary}`),
    ];

    return report.join('\n');
  }

  /**
   * Handle agent failure (for retry logic - Phase 4+)
   */
  /* istanbul ignore next */
  // @ts-ignore - Will be used in Phase 4+
  private async handleAgentFailure(
    agentType: AgentType,
    error: Error
  ): Promise<void> {
    logger.error(`Agent ${agentType} failed`, error);

    // TODO: Implement retry logic in Phase 4+
  }
}
