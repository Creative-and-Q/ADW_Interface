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
import { saveWorkflowPlan } from '../workflow-state.js';

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
 * Manually advance the sub-workflow queue
 */
router.post('/:id/advance-queue', async (req: Request, res: Response): Promise<void> => {
  try {
    const parentWorkflowId = parseInt(req.params.id, 10);
    const nextWorkflowId = await advanceSubWorkflowQueue(parentWorkflowId);

    if (nextWorkflowId) {
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

export default router;

