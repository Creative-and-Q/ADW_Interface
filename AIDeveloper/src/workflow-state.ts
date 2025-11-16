/**
 * Workflow state management
 * Handles workflow and agent execution records in database
 */

import { insert, update, query, queryOne } from './database.js';
import {
  WorkflowType,
  WorkflowStatus,
  WorkflowExecution,
  AgentExecution,
  AgentType,
  AgentStatus,
  WebhookPayload,
  Artifact,
  ArtifactType,
} from './types.js';
import * as logger from './utils/logger.js';
// WebSocket emitters for real-time updates (to be integrated)
/* import {
  emitWorkflowUpdated,
  emitAgentUpdated,
  emitArtifactCreated,
  emitWorkflowCompleted,
  emitWorkflowFailed,
  emitStatsUpdated,
} from './websocket-emitter.js'; */

/**
 * Create a new workflow
 */
export async function createWorkflow(
  type: WorkflowType,
  payload: WebhookPayload,
  targetModule: string = 'AIDeveloper'
): Promise<number> {
  try {
    const workflowId = await insert('workflows', {
      workflow_type: type,
      target_module: targetModule,
      status: WorkflowStatus.PENDING,
      payload: JSON.stringify(payload),
    });

    logger.info(`Workflow created: ${workflowId}`, { type, targetModule });
    return workflowId;
  } catch (error) {
    logger.error('Failed to create workflow', error as Error);
    throw error;
  }
}

/**
 * Update workflow status
 */
export async function updateWorkflowStatus(
  id: number,
  status: WorkflowStatus,
  branchName?: string
): Promise<void> {
  try {
    const updateData: any = { status };

    if (branchName) {
      updateData.branch_name = branchName;
    }

    if (status === WorkflowStatus.COMPLETED || status === WorkflowStatus.FAILED) {
      updateData.completed_at = new Date();
    }

    await update('workflows', updateData, 'id = ?', [id]);

    logger.debug(`Workflow ${id} status updated to ${status}`);
  } catch (error) {
    logger.error('Failed to update workflow status', error as Error);
    throw error;
  }
}

/**
 * Get workflow by ID
 */
export async function getWorkflow(id: number): Promise<WorkflowExecution | null> {
  try {
    const row = await queryOne<any>(
      'SELECT * FROM workflows WHERE id = ?',
      [id]
    );

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      webhookId: row.webhook_id,
      type: row.workflow_type as WorkflowType,
      target_module: row.target_module,
      status: row.status as WorkflowStatus,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      branchName: row.branch_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    };
  } catch (error) {
    logger.error('Failed to get workflow', error as Error);
    throw error;
  }
}

/**
 * Get workflow status with agent executions
 */
export async function getWorkflowStatus(id: number): Promise<{
  workflow: WorkflowExecution;
  agents: AgentExecution[];
  artifacts: Artifact[];
} | null> {
  try {
    const workflow = await getWorkflow(id);
    if (!workflow) {
      return null;
    }

    const agents = await getAgentExecutions(id);
    const artifacts = await getArtifacts(id);

    return {
      workflow,
      agents,
      artifacts,
    };
  } catch (error) {
    logger.error('Failed to get workflow status', error as Error);
    throw error;
  }
}

/**
 * Create agent execution record
 */
export async function createAgentExecution(
  workflowId: number,
  agentType: AgentType,
  input: any
): Promise<number> {
  try {
    const executionId = await insert('agent_executions', {
      workflow_id: workflowId,
      agent_type: agentType,
      status: AgentStatus.PENDING,
      input: JSON.stringify(input),
      retry_count: 0,
    });

    logger.debug(`Agent execution created: ${executionId}`, {
      workflowId,
      agentType,
    });

    return executionId;
  } catch (error) {
    logger.error('Failed to create agent execution', error as Error);
    throw error;
  }
}

/**
 * Update agent execution
 */
export async function updateAgentExecution(
  id: number,
  status: AgentStatus,
  output?: any,
  errorMessage?: string
): Promise<void> {
  try {
    const updateData: any = { status };

    if (output) {
      updateData.output = JSON.stringify(output);
    }

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    if (status === AgentStatus.RUNNING) {
      updateData.started_at = new Date();
    }

    if (status === AgentStatus.COMPLETED || status === AgentStatus.FAILED) {
      updateData.completed_at = new Date();
    }

    await update('agent_executions', updateData, 'id = ?', [id]);

    logger.debug(`Agent execution ${id} status updated to ${status}`);
  } catch (error) {
    logger.error('Failed to update agent execution', error as Error);
    throw error;
  }
}

/**
 * Get agent executions for a workflow
 */
export async function getAgentExecutions(workflowId: number): Promise<AgentExecution[]> {
  try {
    const results = await query<any[]>(
      'SELECT * FROM agent_executions WHERE workflow_id = ? ORDER BY started_at ASC',
      [workflowId]
    );

    return results.map(row => ({
      id: row.id,
      workflowId: row.workflow_id,
      agentType: row.agent_type as AgentType,
      status: row.status as AgentStatus,
      input: typeof row.input === 'string' ? JSON.parse(row.input) : row.input,
      output: row.output ? (typeof row.output === 'string' ? JSON.parse(row.output) : row.output) : undefined,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    }));
  } catch (error) {
    logger.error('Failed to get agent executions', error as Error);
    throw error;
  }
}

/**
 * Save artifact
 */
export async function saveArtifact(
  workflowId: number,
  executionId: number | null,
  type: ArtifactType,
  content: string,
  filePath?: string,
  metadata?: any
): Promise<number> {
  try {
    const artifactId = await insert('artifacts', {
      workflow_id: workflowId,
      agent_execution_id: executionId,
      artifact_type: type,
      file_path: filePath || null,
      content,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });

    logger.debug(`Artifact saved: ${artifactId}`, {
      workflowId,
      type,
    });

    return artifactId;
  } catch (error) {
    logger.error('Failed to save artifact', error as Error);
    throw error;
  }
}

/**
 * Get artifacts for a workflow
 */
export async function getArtifacts(
  workflowId: number,
  type?: ArtifactType
): Promise<Artifact[]> {
  try {
    let sql = 'SELECT * FROM artifacts WHERE workflow_id = ?';
    const params: any[] = [workflowId];

    if (type) {
      sql += ' AND artifact_type = ?';
      params.push(type);
    }

    sql += ' ORDER BY created_at ASC';

    const results = await query<any[]>(sql, params);

    return results.map(row => ({
      id: row.id,
      workflowId: row.workflow_id,
      agentExecutionId: row.agent_execution_id,
      type: row.artifact_type as ArtifactType,
      filePath: row.file_path,
      content: row.content,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
      createdAt: row.created_at,
    }));
  } catch (error) {
    logger.error('Failed to get artifacts', error as Error);
    throw error;
  }
}

/**
 * Complete workflow
 */
export async function completeWorkflow(id: number): Promise<void> {
  try {
    await updateWorkflowStatus(id, WorkflowStatus.COMPLETED);
    logger.info(`Workflow completed: ${id}`);
  } catch (error) {
    logger.error('Failed to complete workflow', error as Error);
    throw error;
  }
}

/**
 * Fail workflow and clean up any running agent executions
 */
export async function failWorkflow(id: number, reason?: string): Promise<void> {
  try {
    // First, mark any running agents as failed to prevent orphaned executions
    await failRunningAgents(id, reason || 'Workflow failed');

    // Then update the workflow status
    await updateWorkflowStatus(id, WorkflowStatus.FAILED);
    logger.error(`Workflow failed: ${id}`, new Error(reason || 'Unknown error'));
  } catch (error) {
    logger.error('Failed to fail workflow', error as Error);
    throw error;
  }
}

/**
 * Mark all running agent executions as failed
 * This prevents orphaned agents stuck in "running" state
 */
export async function failRunningAgents(workflowId: number, reason: string): Promise<void> {
  try {
    const agents = await getAgentExecutions(workflowId);
    const runningAgents = agents.filter(a => a.status === AgentStatus.RUNNING);

    if (runningAgents.length > 0) {
      logger.info(`Marking ${runningAgents.length} running agent(s) as failed for workflow ${workflowId}`);

      for (const agent of runningAgents) {
        await updateAgentExecution(
          agent.id,
          AgentStatus.FAILED,
          undefined,
          `Agent terminated: ${reason}`
        );
        logger.debug(`Marked agent execution ${agent.id} (${agent.agentType}) as failed`);
      }
    }
  } catch (error) {
    logger.error('Failed to fail running agents', error as Error);
    // Don't throw - we still want to fail the workflow even if this cleanup fails
  }
}

/**
 * Clean up stuck agent executions that have been running for too long
 * Returns the number of agents cleaned up
 */
export async function cleanupStuckAgents(timeoutMinutes: number = 60): Promise<number> {
  try {
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const cutoffTime = new Date(Date.now() - timeoutMs);

    // Find agents that have been running for longer than timeout
    const stuckAgents = await query<any[]>(
      `SELECT id, workflow_id, agent_type, started_at
       FROM agent_executions
       WHERE status = ?
       AND started_at IS NOT NULL
       AND started_at < ?`,
      [AgentStatus.RUNNING, cutoffTime]
    );

    if (stuckAgents.length === 0) {
      logger.debug('No stuck agents found');
      return 0;
    }

    logger.warn(`Found ${stuckAgents.length} stuck agent(s) running longer than ${timeoutMinutes} minutes`);

    for (const agent of stuckAgents) {
      const runningTime = Math.floor((Date.now() - new Date(agent.started_at).getTime()) / 1000 / 60);

      await updateAgentExecution(
        agent.id,
        AgentStatus.FAILED,
        undefined,
        `Agent execution timeout: exceeded ${timeoutMinutes} minute limit (ran for ${runningTime} minutes)`
      );

      logger.info(`Cleaned up stuck agent execution ${agent.id} (${agent.agent_type}) for workflow ${agent.workflow_id}`);
    }

    return stuckAgents.length;
  } catch (error) {
    logger.error('Failed to cleanup stuck agents', error as Error);
    throw error;
  }
}

/**
 * Get count of running agent executions across all workflows
 */
export async function getRunningAgentCount(): Promise<number> {
  try {
    const result = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM agent_executions WHERE status = ?',
      [AgentStatus.RUNNING]
    );
    return result?.count || 0;
  } catch (error) {
    logger.error('Failed to get running agent count', error as Error);
    return 0;
  }
}

/**
 * Get workflow resume state for checkpoint restoration
 * Returns all completed agent outputs and metadata needed to resume execution
 */
export interface WorkflowResumeState {
  workflow: WorkflowExecution;
  completedAgents: AgentExecution[];
  failedAgent: AgentExecution | null;
  pendingAgents: AgentExecution[];
  canResume: boolean;
  resumeFromIndex: number;
}

export async function getWorkflowResumeState(id: number): Promise<WorkflowResumeState | null> {
  try {
    const workflow = await getWorkflow(id);
    if (!workflow) {
      return null;
    }

    const allAgents = await getAgentExecutions(id);

    // Separate agents by status
    const completedAgents = allAgents.filter(
      a => a.status === AgentStatus.COMPLETED
    );

    const failedAgent = allAgents.find(
      a => a.status === AgentStatus.FAILED
    ) || null;

    const pendingAgents = allAgents.filter(
      a => a.status === AgentStatus.PENDING
    );

    // Can resume if workflow is failed and there are completed agents
    // BUT: Cannot resume if only the orchestrator completed (orchestrator failures require full restart)
    const hasNonOrchestratorAgents = completedAgents.some(
      a => a.agentType !== AgentType.ORCHESTRATOR
    );

    const canResume =
      workflow.status === WorkflowStatus.FAILED &&
      completedAgents.length > 0 &&
      hasNonOrchestratorAgents;

    // Calculate resume index based on unique completed agent types (not total executions)
    // Get unique completed agent types (excluding orchestrator)
    const uniqueCompletedTypes = new Set(
      completedAgents
        .filter(a => a.agentType !== AgentType.ORCHESTRATOR)
        .map(a => a.agentType)
    );

    // Standard workflow sequence
    const workflowSequence = [
      AgentType.PLAN,
      AgentType.CODE,
      AgentType.SECURITY_LINT,
      AgentType.TEST,
      AgentType.REVIEW,
      AgentType.DOCUMENT,
    ];

    // Find the last completed agent type in the workflow sequence
    let lastCompletedIndex = -1;
    for (let i = workflowSequence.length - 1; i >= 0; i--) {
      if (uniqueCompletedTypes.has(workflowSequence[i])) {
        lastCompletedIndex = i;
        break;
      }
    }

    // Resume from the next agent after the last completed one
    const resumeFromIndex = lastCompletedIndex + 1;

    logger.debug('Workflow resume state retrieved', {
      workflowId: id,
      completed: completedAgents.length,
      failed: failedAgent ? 1 : 0,
      pending: pendingAgents.length,
      canResume,
      resumeFromIndex,
    });

    return {
      workflow,
      completedAgents,
      failedAgent,
      pendingAgents,
      canResume,
      resumeFromIndex,
    };
  } catch (error) {
    logger.error('Failed to get workflow resume state', error as Error);
    throw error;
  }
}

/**
 * Reset workflow to allow resumption
 * Changes status from FAILED to PENDING
 */
export async function resetWorkflowForResume(id: number): Promise<void> {
  try {
    await updateWorkflowStatus(id, WorkflowStatus.PENDING);
    logger.info(`Workflow ${id} reset for resumption`);
  } catch (error) {
    logger.error('Failed to reset workflow for resume', error as Error);
    throw error;
  }
}
