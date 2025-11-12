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
} from './types.js';
import { config } from './config.js';
import * as logger from './utils/logger.js';
import {
  getWorkflow,
  updateWorkflowStatus,
  completeWorkflow,
  failWorkflow,
} from './workflow-state.js';
import { agentManager } from './agent-manager.js';
import { createBranch } from './utils/git-helper.js';
import {
  createWorkflowDirectory,
  logAgentStage,
  createStageDoc,
  updateWorkflowStatus as updateWorkflowDirStatus,
} from './utils/workflow-directory-manager.js';

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

    // Feature workflow: Plan → Code → Test → Review → Document
    configs.set(WorkflowType.FEATURE, {
      type: WorkflowType.FEATURE,
      agents: [
        AgentType.PLAN,
        AgentType.CODE,
        AgentType.TEST,
        AgentType.REVIEW,
        AgentType.DOCUMENT,
      ],
      maxRetries: 3,
      timeoutMs: config.agents.timeoutMs,
    });

    // Bugfix workflow: Plan → Code → Test → Review
    configs.set(WorkflowType.BUGFIX, {
      type: WorkflowType.BUGFIX,
      agents: [AgentType.PLAN, AgentType.CODE, AgentType.TEST, AgentType.REVIEW],
      maxRetries: 3,
      timeoutMs: config.agents.timeoutMs,
    });

    // Refactor workflow: Plan → Code → Test → Review → Document
    configs.set(WorkflowType.REFACTOR, {
      type: WorkflowType.REFACTOR,
      agents: [
        AgentType.PLAN,
        AgentType.CODE,
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

      // Create git branch for this workflow
      branchName = await this.createWorkflowBranch(input.workflowId, plan.config.type);

      // Create workflow directory
      await createWorkflowDirectory(input.workflowId, branchName, plan.config.type);

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
   * Create workflow branch
   */
  private async createWorkflowBranch(
    workflowId: number,
    workflowType: WorkflowType
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const branchName = `workflow/${workflowType}-${workflowId}-${timestamp}`;

    const result = await createBranch(branchName);

    if (!result.success) {
      throw new Error(`Failed to create branch: ${result.error}`);
    }

    logger.info(`Created workflow branch: ${branchName}`);
    return branchName;
  }

  /**
   * Execute workflow
   */
  private async executeWorkflow(
    plan: ExecutionPlan,
    branchName: string
  ): Promise<AgentOutput> {
    const results: AgentOutput[] = [];
    const artifacts: any[] = [];

    logger.info('Executing workflow', {
      workflowId: plan.workflowId,
      type: plan.config.type,
      steps: plan.steps,
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
          results
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
    previousResults: AgentOutput[]
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

    const input: AgentInput = {
      workflowId,
      taskDescription,
      webhookPayload: workflow.payload,
      context: {
        previousResults,
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
