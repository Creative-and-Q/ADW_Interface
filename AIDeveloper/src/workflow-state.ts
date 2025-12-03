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
  targetModule: string = 'AIDeveloper',
  options?: {
    parentWorkflowId?: number;
    workflowDepth?: number;
    executionOrder?: number;
    branchName?: string;
    autoExecuteChildren?: boolean;
  }
): Promise<number> {
  try {
    const data: Record<string, any> = {
      workflow_type: type,
      target_module: targetModule,
      status: WorkflowStatus.PENDING,
      payload: JSON.stringify(payload),
    };

    // Add hierarchy fields if provided
    if (options) {
      if (options.parentWorkflowId !== undefined) {
        data.parent_workflow_id = options.parentWorkflowId;
      }
      if (options.workflowDepth !== undefined) {
        data.workflow_depth = options.workflowDepth;
      }
      if (options.executionOrder !== undefined) {
        data.execution_order = options.executionOrder;
      }
      if (options.branchName) {
        data.branch_name = options.branchName;
      }
      if (options.autoExecuteChildren !== undefined) {
        data.auto_execute_children = options.autoExecuteChildren;
      }
    }

    const workflowId = await insert('workflows', data);

    logger.info(`Workflow created: ${workflowId}`, { 
      type, 
      targetModule,
      parentWorkflowId: options?.parentWorkflowId,
      depth: options?.workflowDepth || 0,
    });
    return workflowId;
  } catch (error) {
    logger.error('Failed to create workflow', error as Error);
    throw error;
  }
}

/**
 * Save structured plan to workflow
 */
export async function saveWorkflowPlan(
  workflowId: number,
  plan: any
): Promise<void> {
  try {
    await update(
      'workflows',
      {
        plan_json: JSON.stringify(plan),
        updated_at: new Date(),
      },
      'id = ?',
      [workflowId]
    );

    logger.info(`Saved plan for workflow ${workflowId}`, {
      subTasks: plan.subTasks?.length || 0,
    });
  } catch (error) {
    logger.error('Failed to save workflow plan', error as Error);
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
      updateData.error = errorMessage;
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
      errorMessage: row.error,
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
 * Also updates workflow and sub-workflow queue statuses to maintain consistency
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

    // Track unique workflow IDs that need status updates
    const affectedWorkflowIds = new Set<number>();

    for (const agent of stuckAgents) {
      const runningTime = Math.floor((Date.now() - new Date(agent.started_at).getTime()) / 1000 / 60);
      const errorMessage = `Agent execution timeout: exceeded ${timeoutMinutes} minute limit (ran for ${runningTime} minutes)`;

      await updateAgentExecution(
        agent.id,
        AgentStatus.FAILED,
        undefined,
        errorMessage
      );

      affectedWorkflowIds.add(agent.workflow_id);

      logger.info(`Cleaned up stuck agent execution ${agent.id} (${agent.agent_type}) for workflow ${agent.workflow_id}`);
    }

    // Update workflow and sub-workflow queue statuses for affected workflows
    for (const workflowId of affectedWorkflowIds) {
      try {
        // Update workflow status to FAILED
        await updateWorkflowStatus(workflowId, WorkflowStatus.FAILED);
        logger.info(`Updated workflow ${workflowId} status to FAILED due to agent timeout`);

        // Update sub-workflow queue entry if this workflow is a child of another
        await update(
          'sub_workflow_queue',
          {
            status: 'failed',
            completed_at: new Date(),
            error_message: 'Agent execution timeout',
          },
          'child_workflow_id = ?',
          [workflowId]
        );
        logger.debug(`Updated sub-workflow queue entry for workflow ${workflowId}`);
      } catch (updateError) {
        logger.error(`Failed to update workflow ${workflowId} status after agent cleanup`, updateError as Error);
        // Continue with other workflows
      }
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

/**
 * Save a checkpoint commit for a workflow
 * Called when a workflow completes successfully
 */
export async function saveWorkflowCheckpoint(
  workflowId: number,
  commitSha: string
): Promise<void> {
  try {
    await update(
      'workflows',
      {
        checkpoint_commit: commitSha,
        checkpoint_created_at: new Date(),
      },
      'id = ?',
      [workflowId]
    );
    logger.info(`Saved checkpoint for workflow ${workflowId}`, { commitSha });
  } catch (error) {
    logger.error('Failed to save workflow checkpoint', error as Error);
    throw error;
  }
}

/**
 * Get the last successful checkpoint commit in a workflow tree
 * Traverses the hierarchy to find the most recent completed workflow with a checkpoint
 */
export async function getLastCheckpoint(workflowId: number): Promise<{
  workflowId: number;
  commitSha: string;
  createdAt: Date;
  targetModule: string;
} | null> {
  try {
    // Find the last completed workflow with a checkpoint in the tree
    // Use recursive CTE to traverse the hierarchy
    const result = await queryOne<any>(
      `WITH RECURSIVE workflow_tree AS (
        SELECT id, parent_workflow_id, status, checkpoint_commit, checkpoint_created_at, target_module
        FROM workflows WHERE id = ?
        UNION ALL
        SELECT w.id, w.parent_workflow_id, w.status, w.checkpoint_commit, w.checkpoint_created_at, w.target_module
        FROM workflows w
        INNER JOIN workflow_tree wt ON w.parent_workflow_id = wt.id
      )
      SELECT id, checkpoint_commit, checkpoint_created_at, target_module
      FROM workflow_tree
      WHERE status = 'completed' AND checkpoint_commit IS NOT NULL
      ORDER BY checkpoint_created_at DESC
      LIMIT 1`,
      [workflowId]
    );

    if (!result || !result.checkpoint_commit) {
      return null;
    }

    return {
      workflowId: result.id,
      commitSha: result.checkpoint_commit,
      createdAt: result.checkpoint_created_at,
      targetModule: result.target_module,
    };
  } catch (error) {
    logger.error('Failed to get last checkpoint', error as Error);
    throw error;
  }
}

/**
 * Get all checkpoints in a workflow tree (for display purposes)
 */
export async function getWorkflowCheckpoints(rootWorkflowId: number): Promise<Array<{
  workflowId: number;
  commitSha: string;
  createdAt: Date;
  targetModule: string;
  taskDescription: string | null;
}>> {
  try {
    const results = await query<any[]>(
      `WITH RECURSIVE workflow_tree AS (
        SELECT id, parent_workflow_id, status, checkpoint_commit, checkpoint_created_at, target_module, task_description, payload
        FROM workflows WHERE id = ?
        UNION ALL
        SELECT w.id, w.parent_workflow_id, w.status, w.checkpoint_commit, w.checkpoint_created_at, w.target_module, w.task_description, w.payload
        FROM workflows w
        INNER JOIN workflow_tree wt ON w.parent_workflow_id = wt.id
      )
      SELECT id, checkpoint_commit, checkpoint_created_at, target_module, task_description, payload
      FROM workflow_tree
      WHERE checkpoint_commit IS NOT NULL
      ORDER BY checkpoint_created_at DESC`,
      [rootWorkflowId]
    );

    return results.map(row => {
      let taskDesc = row.task_description;
      if (!taskDesc && row.payload) {
        try {
          const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
          taskDesc = payload.taskDescription || payload.title || null;
        } catch { /* ignore */ }
      }
      return {
        workflowId: row.id,
        commitSha: row.checkpoint_commit,
        createdAt: row.checkpoint_created_at,
        targetModule: row.target_module,
        taskDescription: taskDesc,
      };
    });
  } catch (error) {
    logger.error('Failed to get workflow checkpoints', error as Error);
    throw error;
  }
}

/**
 * Resume a workflow tree from the last checkpoint
 * Fully resets all workflows that fall after the checkpoint:
 * - Sub-workflows of the checkpoint workflow
 * - Sibling workflows that come after checkpoint (by execution_order or id)
 * - All descendants of those sibling workflows
 *
 * Example: For tree A, B, B1, B2, C, C1, D, D1, D2, D3
 * If checkpoint is B, removes: B1, B2, C, C1, D, D1, D2, D3
 * (keeps A and B)
 */
export async function resumeFromCheckpoint(
  rootWorkflowId: number,
  checkpointWorkflowId?: number
): Promise<{
  checkpointCommit: string;
  resetWorkflowIds: number[];
  removedWorkflowIds: number[];
  targetModule: string;
}> {
  try {
    // Get the checkpoint to resume from (either specified or last successful)
    let checkpoint;
    if (checkpointWorkflowId) {
      const row = await queryOne<any>(
        `SELECT id, checkpoint_commit, checkpoint_created_at, target_module, parent_workflow_id, execution_order
         FROM workflows WHERE id = ? AND checkpoint_commit IS NOT NULL`,
        [checkpointWorkflowId]
      );
      if (row) {
        checkpoint = {
          workflowId: row.id,
          commitSha: row.checkpoint_commit,
          createdAt: row.checkpoint_created_at,
          targetModule: row.target_module,
          parentWorkflowId: row.parent_workflow_id,
          executionOrder: row.execution_order || 0,
        };
      }
    } else {
      const lastCheckpoint = await getLastCheckpoint(rootWorkflowId);
      if (lastCheckpoint) {
        const row = await queryOne<any>(
          `SELECT parent_workflow_id, execution_order FROM workflows WHERE id = ?`,
          [lastCheckpoint.workflowId]
        );
        checkpoint = {
          ...lastCheckpoint,
          parentWorkflowId: row?.parent_workflow_id,
          executionOrder: row?.execution_order || 0,
        };
      }
    }

    if (!checkpoint) {
      throw new Error('No checkpoint found to resume from');
    }

    // Find workflows to remove - this is a multi-step process:
    // 1. All children/descendants of the checkpoint workflow
    // 2. All siblings that come AFTER the checkpoint (same parent, higher execution_order or higher id)
    // 3. All descendants of those siblings

    const workflowsToRemove: number[] = [];

    // Step 1: Get all descendants of the checkpoint workflow (its children, grandchildren, etc.)
    const checkpointDescendants = await query<any[]>(
      `WITH RECURSIVE descendants AS (
        SELECT id FROM workflows WHERE parent_workflow_id = ?
        UNION ALL
        SELECT w.id FROM workflows w
        INNER JOIN descendants d ON w.parent_workflow_id = d.id
      )
      SELECT id FROM descendants`,
      [checkpoint.workflowId]
    );
    workflowsToRemove.push(...checkpointDescendants.map(w => w.id));

    // Step 2: Get siblings that come after the checkpoint
    // (same parent, execution_order > checkpoint's or same execution_order but higher id)
    if (checkpoint.parentWorkflowId !== null) {
      const laterSiblings = await query<any[]>(
        `SELECT id FROM workflows
         WHERE parent_workflow_id = ?
           AND id != ?
           AND (
             execution_order > ?
             OR (execution_order = ? AND id > ?)
           )`,
        [
          checkpoint.parentWorkflowId,
          checkpoint.workflowId,
          checkpoint.executionOrder,
          checkpoint.executionOrder,
          checkpoint.workflowId
        ]
      );

      // Step 3: For each later sibling, get all their descendants too
      for (const sibling of laterSiblings) {
        workflowsToRemove.push(sibling.id);

        const siblingDescendants = await query<any[]>(
          `WITH RECURSIVE descendants AS (
            SELECT id FROM workflows WHERE parent_workflow_id = ?
            UNION ALL
            SELECT w.id FROM workflows w
            INNER JOIN descendants d ON w.parent_workflow_id = d.id
          )
          SELECT id FROM descendants`,
          [sibling.id]
        );
        workflowsToRemove.push(...siblingDescendants.map(w => w.id));
      }
    }

    // Deduplicate
    const uniqueRemoveIds = [...new Set(workflowsToRemove)];

    logger.info('Workflows to remove on checkpoint resume', {
      checkpointWorkflowId: checkpoint.workflowId,
      checkpointParent: checkpoint.parentWorkflowId,
      checkpointOrder: checkpoint.executionOrder,
      removeCount: uniqueRemoveIds.length,
      removeIds: uniqueRemoveIds,
    });

    if (uniqueRemoveIds.length > 0) {
      const idsPlaceholder = uniqueRemoveIds.map(() => '?').join(',');

      // STEP 0: Mark all workflows being removed as CANCELLED first
      // This allows running orchestrators to detect cancellation and stop gracefully
      await query(
        `UPDATE workflows SET status = 'cancelled' WHERE id IN (${idsPlaceholder})`,
        uniqueRemoveIds
      );
      logger.info(`Marked ${uniqueRemoveIds.length} workflows as cancelled`);

      // Also mark their sub_workflow_queue entries as cancelled
      await query(
        `UPDATE sub_workflow_queue SET status = 'cancelled' WHERE child_workflow_id IN (${idsPlaceholder})`,
        uniqueRemoveIds
      );
      logger.debug(`Marked sub_workflow_queue entries as cancelled`);

      // Wait briefly to allow running orchestrators to detect cancellation
      // This gives them time to check status and exit gracefully
      const CANCELLATION_WAIT_MS = 2000;
      logger.info(`Waiting ${CANCELLATION_WAIT_MS}ms for running orchestrators to detect cancellation...`);
      await new Promise(resolve => setTimeout(resolve, CANCELLATION_WAIT_MS));

      // Now proceed with cleanup - orchestrators should have stopped or will ignore FK errors

      // 1. Delete all agent_executions for these workflows
      await query(
        `DELETE FROM agent_executions WHERE workflow_id IN (${idsPlaceholder})`,
        uniqueRemoveIds
      );
      logger.debug(`Deleted agent_executions for ${uniqueRemoveIds.length} workflows`);

      // 2. Delete all artifacts for these workflows
      await query(
        `DELETE FROM artifacts WHERE workflow_id IN (${idsPlaceholder})`,
        uniqueRemoveIds
      );
      logger.debug(`Deleted artifacts for ${uniqueRemoveIds.length} workflows`);

      // 3. Delete all execution_logs for these workflows
      await query(
        `DELETE FROM execution_logs WHERE workflow_id IN (${idsPlaceholder})`,
        uniqueRemoveIds
      );
      logger.debug(`Deleted execution_logs for ${uniqueRemoveIds.length} workflows`);

      // 4. Delete all workflow_messages for these workflows
      await query(
        `DELETE FROM workflow_messages WHERE workflow_id IN (${idsPlaceholder})`,
        uniqueRemoveIds
      );
      logger.debug(`Deleted workflow_messages for ${uniqueRemoveIds.length} workflows`);

      // 5. Delete sub_workflow_queue entries for these workflows
      await query(
        `DELETE FROM sub_workflow_queue WHERE child_workflow_id IN (${idsPlaceholder})`,
        uniqueRemoveIds
      );
      logger.debug(`Deleted sub_workflow_queue entries for ${uniqueRemoveIds.length} workflows`);

      // 6. Delete the workflow records themselves
      await query(
        `DELETE FROM workflows WHERE id IN (${idsPlaceholder})`,
        uniqueRemoveIds
      );
      logger.debug(`Deleted ${uniqueRemoveIds.length} workflow records`);
    }

    // Reset the checkpoint workflow itself to pending so it can be re-run
    await update(
      'workflows',
      {
        status: WorkflowStatus.PENDING,
        started_at: null,
        completed_at: null,
        plan_json: null,
        // Keep checkpoint_commit so we know where to restore git to
      },
      'id = ?',
      [checkpoint.workflowId]
    );

    // Reset sub_workflow_queue entry for checkpoint workflow
    await query(
      `UPDATE sub_workflow_queue
       SET status = 'pending', started_at = NULL, completed_at = NULL, error_message = NULL
       WHERE child_workflow_id = ?`,
      [checkpoint.workflowId]
    );

    logger.info('Resumed workflow tree from checkpoint with full cleanup', {
      rootWorkflowId,
      checkpointWorkflowId: checkpoint.workflowId,
      checkpointCommit: checkpoint.commitSha,
      removedCount: uniqueRemoveIds.length,
      removedWorkflows: uniqueRemoveIds,
    });

    return {
      checkpointCommit: checkpoint.commitSha,
      resetWorkflowIds: [checkpoint.workflowId],
      removedWorkflowIds: uniqueRemoveIds,
      targetModule: checkpoint.targetModule,
    };
  } catch (error) {
    logger.error('Failed to resume from checkpoint', error as Error);
    throw error;
  }
}
