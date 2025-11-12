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
  payload: WebhookPayload
): Promise<number> {
  try {
    const workflowId = await insert('workflows', {
      workflow_type: type,
      status: WorkflowStatus.PENDING,
      payload: JSON.stringify(payload),
    });

    logger.info(`Workflow created: ${workflowId}`, { type });
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
 * Fail workflow
 */
export async function failWorkflow(id: number, reason?: string): Promise<void> {
  try {
    await updateWorkflowStatus(id, WorkflowStatus.FAILED);
    logger.error(`Workflow failed: ${id}`, new Error(reason || 'Unknown error'));
  } catch (error) {
    logger.error('Failed to fail workflow', error as Error);
    throw error;
  }
}
