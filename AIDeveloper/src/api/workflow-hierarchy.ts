/**
 * Workflow Hierarchy API Routes
 * Handles parent/child workflow relationships and sub-workflow queue management
 */

import { Router, Request, Response } from 'express';
import * as logger from '../utils/logger.js';
import {
  createSubWorkflows,
  getSubWorkflows,
  getNextExecutableSubWorkflow,
  getQueueStatus,
  advanceSubWorkflowQueue,
} from '../sub-workflow-queue.js';
import { saveWorkflowPlan, updateWorkflowStatus } from '../workflow-state.js';
import { WorkflowStatus } from '../types.js';
import { query } from '../database.js';

const router = Router();

/**
 * POST /api/workflows/:id/sub-workflows
 * Create sub-workflows from a parent workflow's plan
 */
router.post('/:id/sub-workflows', async (req: Request, res: Response): Promise<void> => {
  try {
    const parentWorkflowId = parseInt(req.params.id, 10);
    const { subTasks } = req.body;

    if (!Array.isArray(subTasks) || subTasks.length === 0) {
      res.status(400).json({
        success: false,
        error: 'subTasks array is required and must not be empty',
      });
      return;
    }

    // Create the sub-workflows
    const childWorkflowIds = await createSubWorkflows(parentWorkflowId, subTasks);

    // Auto-advance queue to start first workflow
    const nextWorkflowId = await advanceSubWorkflowQueue(parentWorkflowId);

    // Send response immediately
    res.json({
      success: true,
      data: {
        parentWorkflowId,
        childWorkflowIds,
        nextWorkflowId,
        totalCreated: childWorkflowIds.length,
      },
      message: `Created ${childWorkflowIds.length} sub-workflows${nextWorkflowId ? `, started workflow ${nextWorkflowId}` : ''}`,
    });

    // Auto-execute the sub-workflow asynchronously (fire-and-forget)
    if (nextWorkflowId) {
      (async () => {
        try {
          const { getWorkflow } = await import('../workflow-state.js');
          const workflow = await getWorkflow(nextWorkflowId);

          if (workflow && ['feature', 'bugfix', 'refactor', 'documentation', 'review'].includes(workflow.type)) {
            logger.info('Auto-executing sub-workflow after creation', { workflowId: nextWorkflowId, type: workflow.type });

            // Import WorkflowOrchestrator dynamically
            // @ts-ignore - Dynamic import path resolved at runtime
            const { WorkflowOrchestrator } = await import('file:///home/kevin/Home/ex_nihilo/modules/WorkflowOrchestrator/index.js');
            const { getWorkflowDirectory } = await import('../utils/workflow-directory-manager.js');
            const { updateSubWorkflowStatus } = await import('../sub-workflow-queue.js');

            // Get or create workflow directory - use the target module directory for feature workflows
            const targetModule = workflow.target_module;
            const workflowDir = targetModule
              ? `/home/kevin/Home/ex_nihilo/modules/${targetModule}`
              : getWorkflowDirectory(nextWorkflowId, workflow.branchName || 'master');

            // Update workflow status to planning (workflow is starting)
            await updateWorkflowStatus(nextWorkflowId, WorkflowStatus.PLANNING);

            // Execute WorkflowOrchestrator
            const orchestrator = new WorkflowOrchestrator();
            const payload = typeof workflow.payload === 'string' ? JSON.parse(workflow.payload) : workflow.payload;

            const result = await orchestrator.execute({
              workflowId: nextWorkflowId,
              workflowType: workflow.type,
              targetModule: workflow.target_module,
              taskDescription: payload.taskDescription || payload.title || '',
              workingDir: workflowDir,
              metadata: payload.metadata || {},
            });

            // Update workflow status based on result
            const finalStatus = result.success ? WorkflowStatus.COMPLETED : WorkflowStatus.FAILED;
            await updateWorkflowStatus(nextWorkflowId, finalStatus);

            // Update sub-workflow queue status
            await updateSubWorkflowStatus(nextWorkflowId, result.success ? 'completed' : 'failed', result.success ? undefined : result.summary);

            logger.info('Sub-workflow execution completed', { workflowId: nextWorkflowId, status: finalStatus });

            // After completion, continue executing remaining sub-workflows in a loop
            let currentNext = await advanceSubWorkflowQueue(parentWorkflowId);
            while (currentNext) {
              logger.info('Auto-advancing to next sub-workflow', { nextWorkflowId: currentNext });

              const nextWorkflow = await getWorkflow(currentNext);
              if (!nextWorkflow || !['feature', 'bugfix', 'refactor', 'documentation', 'review'].includes(nextWorkflow.type)) {
                break;
              }

              logger.info('Executing next sub-workflow in queue', { workflowId: currentNext, type: nextWorkflow.type });

              const nextTargetModule = nextWorkflow.target_module;
              const nextWorkflowDir = nextTargetModule
                ? `/home/kevin/Home/ex_nihilo/modules/${nextTargetModule}`
                : getWorkflowDirectory(currentNext, nextWorkflow.branchName || 'master');

              await updateWorkflowStatus(currentNext, WorkflowStatus.PLANNING);

              const nextOrchestrator = new WorkflowOrchestrator();
              const nextPayload = typeof nextWorkflow.payload === 'string' ? JSON.parse(nextWorkflow.payload) : nextWorkflow.payload;

              try {
                const nextResult = await nextOrchestrator.execute({
                  workflowId: currentNext,
                  workflowType: nextWorkflow.type,
                  targetModule: nextWorkflow.target_module,
                  taskDescription: nextPayload.taskDescription || nextPayload.title || '',
                  workingDir: nextWorkflowDir,
                  metadata: nextPayload.metadata || {},
                });

                const nextFinalStatus = nextResult.success ? WorkflowStatus.COMPLETED : WorkflowStatus.FAILED;
                await updateWorkflowStatus(currentNext, nextFinalStatus);
                await updateSubWorkflowStatus(currentNext, nextResult.success ? 'completed' : 'failed', nextResult.success ? undefined : nextResult.summary);

                logger.info('Sub-workflow in queue completed', { workflowId: currentNext, status: nextFinalStatus });

                // Advance to next workflow in queue
                currentNext = await advanceSubWorkflowQueue(parentWorkflowId);
              } catch (loopError) {
                logger.error('Failed to execute sub-workflow in queue', loopError as Error, { workflowId: currentNext });
                if (currentNext !== null) {
                  await updateSubWorkflowStatus(currentNext, 'failed', (loopError as Error).message);
                }
                break;
              }
            }

            logger.info('All sub-workflows completed for parent', { parentWorkflowId });
          }
        } catch (error) {
          logger.error('Failed to auto-execute sub-workflow', error as Error, { workflowId: nextWorkflowId });
          const { updateSubWorkflowStatus } = await import('../sub-workflow-queue.js');
          await updateSubWorkflowStatus(nextWorkflowId, 'failed', (error as Error).message);
        }
      })().catch((error) => {
        logger.error('Unhandled error in sub-workflow auto-execution', error as Error);
      });
    }
  } catch (error) {
    logger.error('Failed to create sub-workflows', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to create sub-workflows',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/workflows/:id/sub-workflows
 * Get all sub-workflows for a parent workflow
 */
router.get('/:id/sub-workflows', async (req: Request, res: Response): Promise<void> => {
  try {
    const parentWorkflowId = parseInt(req.params.id, 10);
    const subWorkflows = await getSubWorkflows(parentWorkflowId);

    res.json({
      success: true,
      data: subWorkflows,
    });
  } catch (error) {
    logger.error('Failed to get sub-workflows', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sub-workflows',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/workflows/:id/queue-status
 * Get queue status for a parent workflow
 */
router.get('/:id/queue-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const parentWorkflowId = parseInt(req.params.id, 10);
    const status = await getQueueStatus(parentWorkflowId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Failed to get queue status', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to get queue status',
      message: (error as Error).message,
    });
  }
});

/**
 * POST /api/workflows/:id/advance-queue
 * Manually advance the sub-workflow queue and execute the next workflow
 */
router.post('/:id/advance-queue', async (req: Request, res: Response): Promise<void> => {
  try {
    const parentWorkflowId = parseInt(req.params.id, 10);
    const nextWorkflowId = await advanceSubWorkflowQueue(parentWorkflowId);

    if (nextWorkflowId) {
      // Automatically execute the workflow if it's a feature workflow
      (async () => {
        try {
          const { getWorkflow } = await import('../workflow-state.js');
          const workflow = await getWorkflow(nextWorkflowId);
          
          if (workflow && workflow.type === 'feature') {
            logger.info('Auto-executing feature workflow', { workflowId: nextWorkflowId });
            
            // Import WorkflowOrchestrator dynamically
            // @ts-ignore - Dynamic import path resolved at runtime
            const { WorkflowOrchestrator } = await import('file:///home/kevin/Home/ex_nihilo/modules/WorkflowOrchestrator/index.js');
            const { getWorkflowDirectory } = await import('../utils/workflow-directory-manager.js');
            
            // Get workflow directory (should already exist from parent workflow)
            const workflowDir = getWorkflowDirectory(nextWorkflowId, workflow.branchName || 'master');
            
            // Update workflow status to planning (workflow is starting)
            await updateWorkflowStatus(nextWorkflowId, WorkflowStatus.PLANNING);
            
            // Execute WorkflowOrchestrator
            const orchestrator = new WorkflowOrchestrator();
            const payload = typeof workflow.payload === 'string' ? JSON.parse(workflow.payload) : workflow.payload;
            
            const result = await orchestrator.execute({
              workflowId: nextWorkflowId,
              workflowType: 'feature',
              targetModule: workflow.target_module,
              taskDescription: payload.taskDescription || payload.title || '',
              workingDir: workflowDir,
              metadata: payload.metadata || {},
            });
            
            // Update workflow status based on result
            const finalStatus = result.success ? WorkflowStatus.COMPLETED : WorkflowStatus.FAILED;
            await updateWorkflowStatus(nextWorkflowId, finalStatus);
            
            // Update sub-workflow queue status
            const { updateSubWorkflowStatus } = await import('../sub-workflow-queue.js');
            await updateSubWorkflowStatus(nextWorkflowId, finalStatus, result.success ? undefined : result.summary);
            
            logger.info('Feature workflow execution completed', { workflowId: nextWorkflowId, status: finalStatus });
          }
        } catch (error) {
          logger.error('Failed to auto-execute feature workflow', error as Error, { workflowId: nextWorkflowId });
          const { updateSubWorkflowStatus } = await import('../sub-workflow-queue.js');
          await updateSubWorkflowStatus(nextWorkflowId, 'failed', (error as Error).message);
        }
      })().catch((error) => {
        logger.error('Unhandled error in workflow auto-execution', error as Error);
      });
      
      res.json({
        success: true,
        data: {
          nextWorkflowId,
        },
        message: `Advanced queue: workflow ${nextWorkflowId} is now ready to execute`,
      });
    } else {
      res.json({
        success: true,
        data: {
          nextWorkflowId: null,
        },
        message: 'No more workflows to execute in queue',
      });
    }
  } catch (error) {
    logger.error('Failed to advance queue', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to advance queue',
      message: (error as Error).message,
    });
  }
});

/**
 * PUT /api/workflows/:id/plan
 * Save a structured plan to a workflow
 */
router.put('/:id/plan', async (req: Request, res: Response): Promise<void> => {
  try {
    const workflowId = parseInt(req.params.id, 10);
    const { plan } = req.body;

    if (!plan) {
      res.status(400).json({
        success: false,
        error: 'plan object is required',
      });
      return;
    }

    await saveWorkflowPlan(workflowId, plan);

    res.json({
      success: true,
      message: `Plan saved for workflow ${workflowId}`,
    });
  } catch (error) {
    logger.error('Failed to save workflow plan', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to save workflow plan',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/workflows/:id/next-executable
 * Get the next executable sub-workflow
 */
router.get('/:id/next-executable', async (req: Request, res: Response): Promise<void> => {
  try {
    const parentWorkflowId = parseInt(req.params.id, 10);
    const nextWorkflow = await getNextExecutableSubWorkflow(parentWorkflowId);

    res.json({
      success: true,
      data: nextWorkflow,
    });
  } catch (error) {
    logger.error('Failed to get next executable workflow', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to get next executable workflow',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/workflows/:id/tree-stats
 * Get aggregate statistics for the entire workflow tree without loading all data
 * Supports deep hierarchies (21+ levels) efficiently
 */
router.get('/:id/tree-stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const workflowId = parseInt(req.params.id, 10);

    // Get total descendants using recursive CTE
    const descendantsResult = await query<any>(`
      WITH RECURSIVE workflow_tree AS (
        SELECT id, parent_workflow_id, status, workflow_type, 0 as depth
        FROM workflows
        WHERE id = ?

        UNION ALL

        SELECT w.id, w.parent_workflow_id, w.status, w.workflow_type, wt.depth + 1
        FROM workflows w
        INNER JOIN workflow_tree wt ON w.parent_workflow_id = wt.id
      )
      SELECT
        COUNT(*) as total_workflows,
        MAX(depth) as max_depth,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status IN ('planning', 'coding', 'testing', 'reviewing', 'documenting', 'running') THEN 1 ELSE 0 END) as in_progress_count
      FROM workflow_tree
      WHERE id != ?
    `, [workflowId, workflowId]);

    // Get level-by-level breakdown
    const levelBreakdownResult = await query<any>(`
      WITH RECURSIVE workflow_tree AS (
        SELECT id, parent_workflow_id, status, workflow_type, 0 as depth
        FROM workflows
        WHERE id = ?

        UNION ALL

        SELECT w.id, w.parent_workflow_id, w.status, w.workflow_type, wt.depth + 1
        FROM workflows w
        INNER JOIN workflow_tree wt ON w.parent_workflow_id = wt.id
      )
      SELECT
        depth as level,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM workflow_tree
      WHERE depth > 0
      GROUP BY depth
      ORDER BY depth
    `, [workflowId]);

    // Get workflow type distribution
    const typeDistributionResult = await query<any>(`
      WITH RECURSIVE workflow_tree AS (
        SELECT id, parent_workflow_id, status, workflow_type, 0 as depth
        FROM workflows
        WHERE id = ?

        UNION ALL

        SELECT w.id, w.parent_workflow_id, w.status, w.workflow_type, wt.depth + 1
        FROM workflows w
        INNER JOIN workflow_tree wt ON w.parent_workflow_id = wt.id
      )
      SELECT
        workflow_type as type,
        COUNT(*) as count
      FROM workflow_tree
      WHERE id != ?
      GROUP BY workflow_type
      ORDER BY count DESC
    `, [workflowId, workflowId]);

    const stats = descendantsResult[0] || {
      total_workflows: 0,
      max_depth: 0,
      completed_count: 0,
      failed_count: 0,
      pending_count: 0,
      in_progress_count: 0,
    };

    const completionPercentage = stats.total_workflows > 0
      ? Math.round((stats.completed_count / stats.total_workflows) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        workflowId,
        totalDescendants: stats.total_workflows,
        maxDepth: stats.max_depth,
        statusCounts: {
          completed: stats.completed_count,
          failed: stats.failed_count,
          pending: stats.pending_count,
          inProgress: stats.in_progress_count,
        },
        completionPercentage,
        levelBreakdown: levelBreakdownResult,
        typeDistribution: typeDistributionResult,
      },
    });
  } catch (error) {
    logger.error('Failed to get tree stats', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tree stats',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/workflows/:id/children
 * Get paginated direct children of a workflow with hasChildren flag
 * For lazy loading in tree view
 */
router.get('/:id/children', async (req: Request, res: Response): Promise<void> => {
  try {
    const parentWorkflowId = parseInt(req.params.id, 10);
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string | undefined;

    let sql = `
      SELECT
        w.id,
        w.workflow_type,
        w.status,
        w.task_description,
        w.target_module,
        w.execution_order,
        w.created_at,
        w.started_at,
        w.completed_at,
        (SELECT COUNT(*) FROM workflows c WHERE c.parent_workflow_id = w.id) as child_count
      FROM workflows w
      WHERE w.parent_workflow_id = ?
    `;
    const params: any[] = [parentWorkflowId];

    if (status) {
      sql += ' AND w.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY w.execution_order ASC, w.created_at ASC';
    sql += ` LIMIT ${limit} OFFSET ${offset}`;

    const children = await query<any>(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM workflows WHERE parent_workflow_id = ?';
    const countParams: any[] = [parentWorkflowId];
    if (status) {
      countSql += ' AND status = ?';
      countParams.push(status);
    }
    const [countResult] = await query<any>(countSql, countParams);

    // Map results to include hasChildren flag
    const childrenWithFlags = children.map((child: any) => ({
      ...child,
      hasChildren: child.child_count > 0,
      childCount: child.child_count,
    }));

    res.json({
      success: true,
      data: {
        children: childrenWithFlags,
        total: countResult.total,
        limit,
        offset,
        hasMore: offset + limit < countResult.total,
      },
    });
  } catch (error) {
    logger.error('Failed to get workflow children', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to get workflow children',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/workflows/:id/ancestors
 * Get the ancestor chain (breadcrumb path) from root to this workflow
 */
router.get('/:id/ancestors', async (req: Request, res: Response): Promise<void> => {
  try {
    const workflowId = parseInt(req.params.id, 10);

    // Use recursive CTE to get all ancestors
    const ancestorsResult = await query<any>(`
      WITH RECURSIVE ancestor_tree AS (
        SELECT id, parent_workflow_id, workflow_type, status, task_description, target_module, 0 as depth
        FROM workflows
        WHERE id = ?

        UNION ALL

        SELECT w.id, w.parent_workflow_id, w.workflow_type, w.status, w.task_description, w.target_module, at.depth + 1
        FROM workflows w
        INNER JOIN ancestor_tree at ON w.id = at.parent_workflow_id
      )
      SELECT id, parent_workflow_id, workflow_type, status, task_description, target_module, depth
      FROM ancestor_tree
      ORDER BY depth DESC
    `, [workflowId]);

    res.json({
      success: true,
      data: {
        ancestors: ancestorsResult,
        depth: ancestorsResult.length > 0 ? ancestorsResult.length - 1 : 0,
      },
    });
  } catch (error) {
    logger.error('Failed to get workflow ancestors', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to get workflow ancestors',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/workflows/:id/search
 * Search within a workflow tree by workflow ID, status, or module name
 */
router.get('/:id/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const rootWorkflowId = parseInt(req.params.id, 10);
    const searchQuery = req.query.q as string;
    const statusFilter = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!searchQuery && !statusFilter) {
      res.status(400).json({
        success: false,
        error: 'Either q (search query) or status filter is required',
      });
      return;
    }

    // Search within the tree using recursive CTE
    let sql = `
      WITH RECURSIVE workflow_tree AS (
        SELECT id, parent_workflow_id, workflow_type, status, task_description, target_module, 0 as depth
        FROM workflows
        WHERE id = ?

        UNION ALL

        SELECT w.id, w.parent_workflow_id, w.workflow_type, w.status, w.task_description, w.target_module, wt.depth + 1
        FROM workflows w
        INNER JOIN workflow_tree wt ON w.parent_workflow_id = wt.id
      )
      SELECT id, parent_workflow_id, workflow_type, status, task_description, target_module, depth
      FROM workflow_tree
      WHERE id != ?
    `;
    const params: any[] = [rootWorkflowId, rootWorkflowId];

    const conditions: string[] = [];

    if (searchQuery) {
      // Check if it's a numeric ID search
      const numericQuery = parseInt(searchQuery, 10);
      if (!isNaN(numericQuery)) {
        conditions.push('id = ?');
        params.push(numericQuery);
      } else {
        // Search by module name or task description
        conditions.push('(target_module LIKE ? OR task_description LIKE ?)');
        params.push(`%${searchQuery}%`, `%${searchQuery}%`);
      }
    }

    if (statusFilter) {
      conditions.push('status = ?');
      params.push(statusFilter);
    }

    if (conditions.length > 0) {
      sql += ' AND (' + conditions.join(' OR ') + ')';
    }

    sql += ' ORDER BY depth ASC, id ASC';
    sql += ` LIMIT ${limit}`;

    const results = await query<any>(sql, params);

    res.json({
      success: true,
      data: {
        results,
        count: results.length,
        query: searchQuery,
        statusFilter,
      },
    });
  } catch (error) {
    logger.error('Failed to search workflow tree', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to search workflow tree',
      message: (error as Error).message,
    });
  }
});

export default router;

