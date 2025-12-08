/**
 * Sub-Workflow Queue Manager
 * Handles hierarchical workflow execution and sub-task queuing
 */

import { insert, update, query, queryOne } from './database.js';
import { SubWorkflowQueueEntry, WorkflowExecution, WorkflowStatus, WorkflowType } from './types.js';
import { getWorkflow, updateWorkflowStatus } from './workflow-state.js';
import * as logger from './utils/logger.js';
import { createClient, RedisClientType } from 'redis';

// Redis client for distributed locking
let redisClient: RedisClientType | null = null;

async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
    });
    redisClient.on('error', (err: Error) => logger.error('Redis client error', err));
    await redisClient.connect();
  }
  return redisClient;
}

/**
 * Acquire a lock for a master workflow tree
 * Returns true if lock acquired, false otherwise
 */
async function acquireTreeLock(masterWorkflowId: number, ttlSeconds: number = 300): Promise<boolean> {
  try {
    const client = await getRedisClient();
    const lockKey = `workflow_tree_lock:${masterWorkflowId}`;
    const result = await client.set(lockKey, Date.now().toString(), {
      NX: true, // Only set if not exists
      EX: ttlSeconds, // Expire after ttlSeconds
    });
    return result === 'OK';
  } catch (error) {
    logger.error('Failed to acquire tree lock', error as Error);
    return false;
  }
}

/**
 * Release a lock for a master workflow tree
 */
async function releaseTreeLock(masterWorkflowId: number): Promise<void> {
  try {
    const client = await getRedisClient();
    const lockKey = `workflow_tree_lock:${masterWorkflowId}`;
    await client.del(lockKey);
  } catch (error) {
    logger.error('Failed to release tree lock', error as Error);
  }
}

/**
 * Get the root master workflow ID for a given workflow
 * Traverses up the parent chain to find the top-level workflow
 */
async function getRootMasterWorkflowId(workflowId: number): Promise<number> {
  let currentId = workflowId;
  let iterations = 0;
  const maxIterations = 20; // Prevent infinite loops

  while (iterations < maxIterations) {
    const workflow = await queryOne<{ parent_workflow_id: number | null }>(
      'SELECT parent_workflow_id FROM workflows WHERE id = ?',
      [currentId]
    );

    if (!workflow || workflow.parent_workflow_id === null) {
      return currentId;
    }

    currentId = workflow.parent_workflow_id;
    iterations++;
  }

  logger.warn('Max iterations reached while finding root master workflow', { workflowId });
  return currentId;
}

/**
 * Check if any workflow in the master workflow tree is currently ACTIVELY running
 * Uses recursive CTE to find all workflows in the tree
 *
 * NOTE: 'running' status means "waiting for children to complete" - it is NOT actively executing.
 * Only the agent execution statuses (planning, coding, etc.) indicate active execution.
 */
async function hasRunningWorkflowInTree(masterWorkflowId: number): Promise<boolean> {
  const result = await queryOne<{ count: number }>(
    `WITH RECURSIVE workflow_tree AS (
      SELECT id, parent_workflow_id, status
      FROM workflows
      WHERE id = ?
      UNION ALL
      SELECT w.id, w.parent_workflow_id, w.status
      FROM workflows w
      INNER JOIN workflow_tree wt ON w.parent_workflow_id = wt.id
    )
    SELECT COUNT(*) as count
    FROM workflow_tree
    WHERE status IN ('planning', 'coding', 'testing', 'reviewing', 'documenting', 'security_linting')
      AND id != ?`,
    [masterWorkflowId, masterWorkflowId]
  );

  return (result?.count || 0) > 0;
}

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
 * Only returns a workflow if no other workflow in the master tree is currently running
 */
export async function getNextExecutableSubWorkflow(
  parentWorkflowId: number
): Promise<SubWorkflowQueueEntry | null> {
  try {
    // First, check if any workflow in the master tree is already running
    // This prevents concurrent execution of workflows that could conflict
    const masterWorkflowId = await getRootMasterWorkflowId(parentWorkflowId);
    const hasRunning = await hasRunningWorkflowInTree(masterWorkflowId);

    if (hasRunning) {
      logger.debug('Another workflow is already running in master tree, waiting...', {
        parentWorkflowId,
        masterWorkflowId,
      });
      return null;
    }

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
 * Check if parent workflow has SUCCESSFULLY completed all sub-workflows (including grandchildren)
 * A workflow is only complete when:
 * 1. All immediate children are in terminal state (completed, failed, or skipped)
 * 2. NO children have failed (failed children mean parent should also fail)
 * 3. All children that are "completed" have no pending/in-progress grandchildren
 */
export async function checkParentWorkflowCompletion(
  parentWorkflowId: number
): Promise<boolean> {
  const status = await getQueueStatus(parentWorkflowId);

  // First check: immediate children must all be in terminal state
  if (status.total === 0 || status.pending > 0 || status.inProgress > 0) {
    return false;
  }

  // Second check: if any children failed, parent is NOT successfully complete
  // This is critical - a parent with failed children should be marked as failed, not completed
  if (status.failed > 0) {
    logger.debug(`Parent ${parentWorkflowId} not complete: has ${status.failed} failed children`);
    return false;
  }

  // Third check: verify that "completed" children don't have incomplete grandchildren
  // Get all completed child workflow IDs
  const completedChildren = await query<any[]>(
    `SELECT child_workflow_id FROM sub_workflow_queue
     WHERE parent_workflow_id = ? AND status = 'completed'`,
    [parentWorkflowId]
  );

  // For each completed child, check if it has any incomplete sub-workflows
  for (const child of completedChildren) {
    const childStatus = await getQueueStatus(child.child_workflow_id);

    // If child has sub-workflows and they're not all complete, parent isn't complete
    if (childStatus.total > 0 && (childStatus.pending > 0 || childStatus.inProgress > 0)) {
      logger.debug(`Parent ${parentWorkflowId} not complete: child ${child.child_workflow_id} has incomplete sub-workflows`, {
        childPending: childStatus.pending,
        childInProgress: childStatus.inProgress,
      });
      return false;
    }

    // Recursively check deeper levels
    if (childStatus.total > 0) {
      const childComplete = await checkParentWorkflowCompletion(child.child_workflow_id);
      if (!childComplete) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Check if any sub-workflows have failed (including checking the workflow status itself)
 * This is used to determine if a parent workflow should be marked as failed
 * Returns details about the failure if one exists
 */
export async function checkForFailedChildren(
  parentWorkflowId: number
): Promise<{ hasFailed: boolean; failedWorkflowId?: number; failedQueueEntry?: any }> {
  // Check if any immediate queue entries are failed
  const failedEntry = await queryOne<any>(
    `SELECT * FROM sub_workflow_queue
     WHERE parent_workflow_id = ? AND status = 'failed'
     ORDER BY execution_order ASC
     LIMIT 1`,
    [parentWorkflowId]
  );

  if (failedEntry) {
    return {
      hasFailed: true,
      failedWorkflowId: failedEntry.child_workflow_id,
      failedQueueEntry: failedEntry,
    };
  }

  // Also check if any children have 'failed' workflow status even if queue entry isn't marked failed yet
  const failedWorkflow = await queryOne<any>(
    `SELECT w.id, swq.* FROM workflows w
     INNER JOIN sub_workflow_queue swq ON w.id = swq.child_workflow_id
     WHERE swq.parent_workflow_id = ? AND w.status = 'failed'
     ORDER BY swq.execution_order ASC
     LIMIT 1`,
    [parentWorkflowId]
  );

  if (failedWorkflow) {
    return {
      hasFailed: true,
      failedWorkflowId: failedWorkflow.id,
      failedQueueEntry: failedWorkflow,
    };
  }

  // Recursively check children with sub-workflows
  const childrenWithSubWorkflows = await query<any[]>(
    `SELECT DISTINCT swq.child_workflow_id
     FROM sub_workflow_queue swq
     WHERE swq.parent_workflow_id = ?
     AND EXISTS (
       SELECT 1 FROM sub_workflow_queue child_swq
       WHERE child_swq.parent_workflow_id = swq.child_workflow_id
     )`,
    [parentWorkflowId]
  );

  for (const child of childrenWithSubWorkflows) {
    const childFailure = await checkForFailedChildren(child.child_workflow_id);
    if (childFailure.hasFailed) {
      return childFailure;
    }
  }

  return { hasFailed: false };
}

/**
 * Reset all failed/in_progress sub-workflows back to pending state
 * This allows the workflow to be resumed from the earliest failure point
 * Also resets any failed agents for those workflows
 */
export async function resetFailedSubWorkflows(
  parentWorkflowId: number
): Promise<{ resetCount: number; earliestResetOrder: number | null }> {
  try {
    // Get all failed or in_progress queue entries for this parent
    const failedEntries = await query<any[]>(
      `SELECT swq.*, w.id as workflow_id
       FROM sub_workflow_queue swq
       JOIN workflows w ON w.id = swq.child_workflow_id
       WHERE swq.parent_workflow_id = ?
       AND (swq.status IN ('failed', 'in_progress') OR w.status IN ('failed', 'planning', 'coding', 'testing', 'reviewing', 'documenting'))
       ORDER BY swq.execution_order ASC`,
      [parentWorkflowId]
    );

    if (failedEntries.length === 0) {
      logger.info('No failed sub-workflows to reset', { parentWorkflowId });
      return { resetCount: 0, earliestResetOrder: null };
    }

    let earliestResetOrder: number | null = null;

    for (const entry of failedEntries) {
      const childWorkflowId = entry.child_workflow_id;

      // Track earliest reset order
      if (earliestResetOrder === null || entry.execution_order < earliestResetOrder) {
        earliestResetOrder = entry.execution_order;
      }

      // Reset queue entry to pending
      await update(
        'sub_workflow_queue',
        {
          status: 'pending',
          started_at: null,
          completed_at: null,
          error_message: null,
        },
        'child_workflow_id = ?',
        [childWorkflowId]
      );

      // Reset workflow status to pending
      await updateWorkflowStatus(childWorkflowId, WorkflowStatus.PENDING);

      // Reset any failed agents for this workflow
      await query(
        `UPDATE agent_executions
         SET status = 'pending', error = NULL, completed_at = NULL
         WHERE workflow_id = ? AND status = 'failed'`,
        [childWorkflowId]
      );

      // Also recursively reset any failed grandchildren
      const grandchildStatus = await getQueueStatus(childWorkflowId);
      if (grandchildStatus.total > 0 && (grandchildStatus.failed > 0 || grandchildStatus.inProgress > 0)) {
        await resetFailedSubWorkflows(childWorkflowId);
      }

      logger.info('Reset failed sub-workflow', {
        childWorkflowId,
        executionOrder: entry.execution_order,
        parentWorkflowId,
      });
    }

    logger.info('Reset all failed sub-workflows', {
      parentWorkflowId,
      resetCount: failedEntries.length,
      earliestResetOrder,
    });

    return { resetCount: failedEntries.length, earliestResetOrder };
  } catch (error) {
    logger.error('Failed to reset failed sub-workflows', error as Error);
    throw error;
  }
}

/**
 * Auto-advance sub-workflow queue
 * Gets next executable workflow and marks it as ready to execute
 * Uses Redis locking to prevent race conditions in hierarchical workflows
 */
export async function advanceSubWorkflowQueue(
  parentWorkflowId: number
): Promise<number | null> {
  // Get the root master workflow for locking
  const masterWorkflowId = await getRootMasterWorkflowId(parentWorkflowId);

  // Try to acquire lock - if we can't, another process is advancing the queue
  const lockAcquired = await acquireTreeLock(masterWorkflowId);
  if (!lockAcquired) {
    logger.debug('Could not acquire tree lock, another process is advancing the queue', {
      parentWorkflowId,
      masterWorkflowId,
    });
    return null;
  }

  try {
    const nextWorkflow = await getNextExecutableSubWorkflow(parentWorkflowId);

    if (!nextWorkflow) {
      // CRITICAL: Check for failed children BEFORE marking parent as completed
      // This handles the case where a bugfix sub-workflow failed
      const failureCheck = await checkForFailedChildren(parentWorkflowId);

      if (failureCheck.hasFailed) {
        // A child workflow failed - we need to propagate the failure
        // Check the parent's status to see if it was waiting for a fix
        const parentWorkflow = await getWorkflow(parentWorkflowId);

        logger.warn('Child workflow failed - propagating failure to parent', {
          parentWorkflowId,
          parentStatus: parentWorkflow?.status,
          failedWorkflowId: failureCheck.failedWorkflowId,
        });

        // If parent was in pending_fix status (waiting for bugfix), mark it as failed
        // This prevents subsequent siblings from running
        if (parentWorkflow?.status === WorkflowStatus.PENDING_FIX ||
            parentWorkflow?.status === WorkflowStatus.RUNNING) {
          logger.info('Parent was waiting for fix/children - marking as FAILED due to child failure', {
            parentWorkflowId,
            previousStatus: parentWorkflow.status,
            failedChildId: failureCheck.failedWorkflowId,
          });

          await updateWorkflowStatus(parentWorkflowId, WorkflowStatus.FAILED);
          await updateSubWorkflowStatus(parentWorkflowId, 'failed',
            `Child workflow ${failureCheck.failedWorkflowId} failed`);

          // Check if this workflow has a grandparent that needs to be notified of the failure
          const grandparentEntry = await queryOne<any>(
            `SELECT parent_workflow_id FROM sub_workflow_queue WHERE child_workflow_id = ?`,
            [parentWorkflowId]
          );

          if (grandparentEntry?.parent_workflow_id) {
            logger.info('Propagating failure to grandparent queue', {
              grandparentWorkflowId: grandparentEntry.parent_workflow_id,
              failedWorkflowId: parentWorkflowId,
            });

            // Release lock before recursive call
            await releaseTreeLock(masterWorkflowId);

            // Trigger grandparent to check for failures and potentially fail as well
            await advanceSubWorkflowQueue(grandparentEntry.parent_workflow_id);
            return null;
          }
        }

        await releaseTreeLock(masterWorkflowId);
        return null;
      }

      // Check if queue is complete (no failures, all children done)
      const isComplete = await checkParentWorkflowCompletion(parentWorkflowId);
      if (isComplete) {
        logger.info(`All sub-workflows completed successfully for parent ${parentWorkflowId}`);
        // Update parent workflow status
        await updateWorkflowStatus(parentWorkflowId, WorkflowStatus.COMPLETED);

        // CRITICAL: Update this workflow's entry in the grandparent's queue
        // This ensures the grandparent can advance to the next workflow
        await updateSubWorkflowStatus(parentWorkflowId, 'completed');
        logger.info(`Updated parent workflow ${parentWorkflowId} queue entry to completed`);

        // Check if this workflow has a grandparent that needs advancing
        const grandparentEntry = await queryOne<any>(
          `SELECT parent_workflow_id FROM sub_workflow_queue WHERE child_workflow_id = ?`,
          [parentWorkflowId]
        );

        if (grandparentEntry?.parent_workflow_id) {
          logger.info(`Triggering grandparent queue advancement`, {
            grandparentWorkflowId: grandparentEntry.parent_workflow_id,
            completedWorkflowId: parentWorkflowId,
          });

          // Release lock before recursive call to avoid deadlock
          await releaseTreeLock(masterWorkflowId);

          // Recursively advance the grandparent's queue
          // This will cascade up the tree as needed
          const nextGrandparentWorkflow = await advanceSubWorkflowQueue(grandparentEntry.parent_workflow_id);
          if (nextGrandparentWorkflow) {
            logger.info(`Advanced grandparent queue to workflow ${nextGrandparentWorkflow}`);
            // Return the grandparent's next workflow so the caller can execute it
            return nextGrandparentWorkflow;
          }
          return null;
        }
      }
      await releaseTreeLock(masterWorkflowId);
      return null;
    }

    // Mark as in progress
    await updateSubWorkflowStatus(nextWorkflow.childWorkflowId, 'in_progress');

    logger.info(`Advanced queue: sub-workflow ${nextWorkflow.childWorkflowId} ready for execution`);

    // Don't release lock here - it will be released when the workflow completes
    // This prevents other workflows from starting while this one is running
    return nextWorkflow.childWorkflowId;
  } catch (error) {
    await releaseTreeLock(masterWorkflowId);
    logger.error('Failed to advance sub-workflow queue', error as Error);
    throw error;
  }
}

/**
 * Release the tree lock when a workflow completes
 * Should be called after workflow execution finishes
 */
export async function releaseWorkflowTreeLock(workflowId: number): Promise<void> {
  const masterWorkflowId = await getRootMasterWorkflowId(workflowId);
  await releaseTreeLock(masterWorkflowId);
  logger.debug('Released tree lock after workflow completion', { workflowId, masterWorkflowId });
}

