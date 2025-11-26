/**
 * Sub-Workflow Queue Manager
 * Handles hierarchical workflow execution and sub-task queuing
 */

import { insert, update, query, queryOne } from './database.js';
import { SubWorkflowQueueEntry, WorkflowExecution, WorkflowStatus, WorkflowType } from './types.js';
import { getWorkflow, updateWorkflowStatus } from './workflow-state.js';
import * as logger from './utils/logger.js';

/**
 * Create sub-workflows from a parent workflow plan
 */
export async function createSubWorkflows(
  parentWorkflowId: number,
  subTasks: Array<{
    title: string;
    description: string;
    workflowType: WorkflowType;
    targetModule?: string;
    priority: number;
    dependsOn?: number[];
    metadata?: Record<string, any>;
  }>
): Promise<number[]> {
  try {
    const parentWorkflow = await getWorkflow(parentWorkflowId);
    if (!parentWorkflow) {
      throw new Error(`Parent workflow ${parentWorkflowId} not found`);
    }

    const childWorkflowIds: number[] = [];
    const currentDepth = (parentWorkflow.workflowDepth || 0) + 1;

    // Create each sub-workflow
    for (let i = 0; i < subTasks.length; i++) {
      const subTask = subTasks[i];
      
      // Build payload for sub-workflow
      const subWorkflowPayload: any = {
        taskDescription: subTask.description,
        title: subTask.title,
        metadata: {
          ...subTask.metadata,
          parentWorkflowId,
          subTaskIndex: i,
          totalSubTasks: subTasks.length,
        },
      };

      // Create the sub-workflow
      const childWorkflowId = await insert('workflows', {
        parent_workflow_id: parentWorkflowId,
        workflow_type: subTask.workflowType,
        target_module: subTask.targetModule || parentWorkflow.target_module,
        status: WorkflowStatus.PENDING,
        payload: JSON.stringify(subWorkflowPayload),
        workflow_depth: currentDepth,
        execution_order: i,
        branch_name: parentWorkflow.branchName, // Use same branch as parent
        auto_execute_children: false, // Sub-workflows don't auto-create more children by default
      });

      childWorkflowIds.push(childWorkflowId);

      // Add to queue
      await insert('sub_workflow_queue', {
        parent_workflow_id: parentWorkflowId,
        child_workflow_id: childWorkflowId,
        execution_order: i,
        status: 'pending',
        depends_on: subTask.dependsOn ? JSON.stringify(subTask.dependsOn) : null,
      });

      logger.info(`Created sub-workflow ${childWorkflowId} for parent ${parentWorkflowId}`, {
        order: i,
        type: subTask.workflowType,
        title: subTask.title,
      });
    }

    return childWorkflowIds;
  } catch (error) {
    logger.error('Failed to create sub-workflows', error as Error);
    throw error;
  }
}

/**
 * Get all sub-workflows for a parent workflow
 */
export async function getSubWorkflows(parentWorkflowId: number): Promise<WorkflowExecution[]> {
  try {
    const rows = await query<any[]>(
      `SELECT w.* FROM workflows w
       INNER JOIN sub_workflow_queue q ON w.id = q.child_workflow_id
       WHERE q.parent_workflow_id = ?
       ORDER BY q.execution_order ASC`,
      [parentWorkflowId]
    );

    return rows.map((row) => ({
      id: row.id,
      webhookId: row.webhook_id,
      type: row.workflow_type as WorkflowType,
      target_module: row.target_module,
      task_description: row.task_description,
      status: row.status as WorkflowStatus,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      branchName: row.branch_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at, // Fallback to created_at if updated_at doesn't exist
      completedAt: row.completed_at,
      parentWorkflowId: row.parent_workflow_id,
      workflowDepth: row.workflow_depth,
      executionOrder: row.execution_order,
      planJson: typeof row.plan_json === 'string' ? JSON.parse(row.plan_json) : row.plan_json,
      autoExecuteChildren: row.auto_execute_children,
    }));
  } catch (error) {
    logger.error('Failed to get sub-workflows', error as Error);
    throw error;
  }
}

/**
 * Get next executable sub-workflow from queue
 * Returns the next workflow that has all dependencies completed
 */
export async function getNextExecutableSubWorkflow(
  parentWorkflowId: number
): Promise<SubWorkflowQueueEntry | null> {
  try {
    // Get all queue entries for parent
    const queueEntries = await query<any[]>(
      `SELECT * FROM sub_workflow_queue
       WHERE parent_workflow_id = ?
       ORDER BY execution_order ASC`,
      [parentWorkflowId]
    );

    if (queueEntries.length === 0) {
      return null;
    }

    // Find first pending workflow with all dependencies met
    for (const entry of queueEntries) {
      if (entry.status !== 'pending') continue;

      // Check if dependencies are met
      const dependsOn = entry.depends_on
        ? (typeof entry.depends_on === 'string' ? JSON.parse(entry.depends_on) : entry.depends_on)
        : [];

      if (dependsOn.length === 0) {
        // No dependencies - can execute
        return mapQueueEntry(entry);
      }

      // Check if all dependencies are completed
      const allDependenciesMet = await checkDependenciesCompleted(entry.parent_workflow_id, dependsOn);
      if (allDependenciesMet) {
        return mapQueueEntry(entry);
      }
    }

    // Check if there are any in-progress workflows
    const hasInProgress = queueEntries.some((e) => e.status === 'in_progress');
    if (hasInProgress) {
      return null; // Wait for current workflow to complete
    }

    // Check if all are completed or failed
    const allCompleted = queueEntries.every((e) =>
      ['completed', 'failed', 'skipped'].includes(e.status)
    );
    if (allCompleted) {
      return null; // Queue is finished
    }

    // Deadlock detection: If we have pending workflows but none can execute
    logger.warn(`Potential deadlock in workflow ${parentWorkflowId} sub-workflow queue`);
    return null;
  } catch (error) {
    logger.error('Failed to get next executable sub-workflow', error as Error);
    throw error;
  }
}

/**
 * Check if all dependency workflows are completed
 */
async function checkDependenciesCompleted(
  parentWorkflowId: number,
  dependsOnOrders: number[]
): Promise<boolean> {
  if (dependsOnOrders.length === 0) return true;

  try {
    const placeholders = dependsOnOrders.map(() => '?').join(',');
    const completedCount = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM sub_workflow_queue
       WHERE parent_workflow_id = ?
       AND execution_order IN (${placeholders})
       AND status = 'completed'`,
      [parentWorkflowId, ...dependsOnOrders]
    );

    return completedCount ? completedCount.count === dependsOnOrders.length : false;
  } catch (error) {
    logger.error('Failed to check dependencies', error as Error);
    return false;
  }
}

/**
 * Update sub-workflow queue status
 */
export async function updateSubWorkflowStatus(
  childWorkflowId: number,
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped',
  errorMessage?: string
): Promise<void> {
  try {
    const updateData: Record<string, any> = {
      status,
    };

    if (status === 'in_progress') {
      const existingEntry = await getQueueEntry(childWorkflowId);
      if (!existingEntry?.startedAt) {
        updateData.started_at = new Date();
      }
    }

    if (['completed', 'failed', 'skipped'].includes(status)) {
      updateData.completed_at = new Date();
    }

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    await update(
      'sub_workflow_queue',
      updateData,
      'child_workflow_id = ?',
      [childWorkflowId]
    );

    logger.info(`Updated sub-workflow ${childWorkflowId} status to ${status}`);
  } catch (error) {
    logger.error('Failed to update sub-workflow status', error as Error);
    throw error;
  }
}

/**
 * Get queue entry for a child workflow
 */
async function getQueueEntry(childWorkflowId: number): Promise<SubWorkflowQueueEntry | null> {
  try {
    const row = await queryOne<any>(
      'SELECT * FROM sub_workflow_queue WHERE child_workflow_id = ?',
      [childWorkflowId]
    );

    return row ? mapQueueEntry(row) : null;
  } catch (error) {
    logger.error('Failed to get queue entry', error as Error);
    return null;
  }
}

/**
 * Map database row to SubWorkflowQueueEntry
 */
function mapQueueEntry(row: any): SubWorkflowQueueEntry {
  return {
    id: row.id,
    parentWorkflowId: row.parent_workflow_id,
    childWorkflowId: row.child_workflow_id,
    executionOrder: row.execution_order,
    status: row.status,
    dependsOn: row.depends_on
      ? (typeof row.depends_on === 'string' ? JSON.parse(row.depends_on) : row.depends_on)
      : undefined,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
  };
}

/**
 * Get queue status for a parent workflow
 */
export async function getQueueStatus(parentWorkflowId: number): Promise<{
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  skipped: number;
}> {
  try {
    const rows = await query<any[]>(
      'SELECT status, COUNT(*) as count FROM sub_workflow_queue WHERE parent_workflow_id = ? GROUP BY status',
      [parentWorkflowId]
    );

    const status = {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    };

    for (const row of rows) {
      const count = parseInt(row.count, 10);
      status.total += count;
      
      switch (row.status) {
        case 'pending':
          status.pending = count;
          break;
        case 'in_progress':
          status.inProgress = count;
          break;
        case 'completed':
          status.completed = count;
          break;
        case 'failed':
          status.failed = count;
          break;
        case 'skipped':
          status.skipped = count;
          break;
      }
    }

    return status;
  } catch (error) {
    logger.error('Failed to get queue status', error as Error);
    throw error;
  }
}

/**
 * Check if parent workflow has completed all sub-workflows
 */
export async function checkParentWorkflowCompletion(
  parentWorkflowId: number
): Promise<boolean> {
  const status = await getQueueStatus(parentWorkflowId);
  
  // All workflows must be in terminal state (completed, failed, or skipped)
  return status.total > 0 && status.pending === 0 && status.inProgress === 0;
}

/**
 * Auto-advance sub-workflow queue
 * Gets next executable workflow and marks it as ready to execute
 */
export async function advanceSubWorkflowQueue(
  parentWorkflowId: number
): Promise<number | null> {
  try {
    const nextWorkflow = await getNextExecutableSubWorkflow(parentWorkflowId);
    
    if (!nextWorkflow) {
      // Check if queue is complete
      const isComplete = await checkParentWorkflowCompletion(parentWorkflowId);
      if (isComplete) {
        logger.info(`All sub-workflows completed for parent ${parentWorkflowId}`);
        // Update parent workflow status
        await updateWorkflowStatus(parentWorkflowId, WorkflowStatus.COMPLETED);
      }
      return null;
    }

    // Mark as in progress
    await updateSubWorkflowStatus(nextWorkflow.childWorkflowId, 'in_progress');
    
    logger.info(`Advanced queue: sub-workflow ${nextWorkflow.childWorkflowId} ready for execution`);
    return nextWorkflow.childWorkflowId;
  } catch (error) {
    logger.error('Failed to advance sub-workflow queue', error as Error);
    throw error;
  }
}

