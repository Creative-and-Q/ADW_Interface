/**
 * API Routes for Frontend Dashboard
 * REST API endpoints for the web dashboard
 */

import { Router, Request, Response } from 'express';
import { query } from './database.js';
import { WorkflowStatus, AgentStatus } from './types.js';
import * as logger from './utils/logger.js';
import { getExecutionLogs } from './utils/execution-logger.js';
import {
  discoverModules,
  getModuleInfo,
  getModuleCommitHistory,
  getModulePrompts,
  getModulePromptContent,
  updateModulePrompt,
  getModuleStats,
  importModule,
} from './utils/module-manager.js';
import { deploymentManager } from './utils/deployment-manager.js';
import modulePluginsRouter from './api/module-plugins.js';
import workflowHierarchyRouter from './api/workflow-hierarchy.js';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

// ============================================================================
// Module Plugin Routes (MUST BE BEFORE PROXY ROUTES)
// ============================================================================

router.use('/modules', modulePluginsRouter);

// ============================================================================
// Workflow Hierarchy Routes
// ============================================================================

router.use('/workflows', workflowHierarchyRouter);

// ============================================================================
// AIController Proxy Routes (MUST BE FIRST)
// ============================================================================

/**
 * Proxy all AIController requests through AIDeveloper server
 * This avoids CORS issues and allows remote access
 * IMPORTANT: This route must be registered before other routes to avoid conflicts
 */
router.all('/aicontroller/*', async (req: Request, res: Response): Promise<void> => {
  try {
    const axios = (await import('axios')).default;
    // The route is /aicontroller/*, so req.path will be /aicontroller/something
    // We want to forward to http://localhost:3035/something
    const aiControllerPath = req.path.replace('/aicontroller', '');
    const aiControllerURL = `http://localhost:3035${aiControllerPath}`;

    logger.info(`Proxying ${req.method} request to AIController: ${aiControllerURL}`);

    const response = await axios({
      method: req.method as any,
      url: aiControllerURL,
      data: req.body,
      params: req.query,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
      validateStatus: () => true, // Don't throw on any status
    });

    // Forward the response
    res.status(response.status).json(response.data);
    return;
  } catch (error: any) {
    logger.error('AIController proxy error', error);

    // Check if it's a connection error (AIController not running)
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      res.status(503).json({
        success: false,
        error: 'AIController is not running',
        message: 'The AIController service is not available. Please start it from the Modules page.',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Proxy error',
      message: error.message,
    });
    return;
  }
});

// ============================================================================
// Workflow Routes
// ============================================================================

/**
 * GET /api/workflows
 * List all workflows with pagination and filtering
 * By default excludes sub-workflows (those with parent_workflow_id)
 * Use ?include_children=true to include sub-workflows
 */
router.get('/workflows', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as WorkflowStatus | undefined;
    const includeChildren = req.query.include_children === 'true';

    // Build query - by default exclude sub-workflows (parent_workflow_id IS NULL)
    let sql = `SELECT w.*,
               (SELECT COUNT(*) FROM workflows sub WHERE sub.parent_workflow_id = w.id) as sub_workflow_count
               FROM workflows w`;
    const params: any[] = [];
    const conditions: string[] = [];

    // Exclude sub-workflows by default
    if (!includeChildren) {
      conditions.push('w.parent_workflow_id IS NULL');
    }

    if (status) {
      conditions.push('w.status = ?');
      params.push(status);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ` ORDER BY w.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const workflowsRaw = await query<any>(sql, params);

    // Helper to extract description from payload or task_description
    const extractDescription = (wf: any): string | null => {
      if (wf.task_description) return wf.task_description;
      if (wf.payload) {
        try {
          const payload = typeof wf.payload === 'string' ? JSON.parse(wf.payload) : wf.payload;
          return payload.taskDescription || payload.title || payload.description || null;
        } catch { return null; }
      }
      return null;
    };

    // Map workflows to include extracted description
    const workflows = workflowsRaw.map((wf: any) => ({
      ...wf,
      task_description: extractDescription(wf),
    }));

    // Get count (only root workflows unless include_children is true)
    let countSql = 'SELECT COUNT(*) as total FROM workflows';
    const countConditions: string[] = [];
    const countParams: any[] = [];

    if (!includeChildren) {
      countConditions.push('parent_workflow_id IS NULL');
    }
    if (status) {
      countConditions.push('status = ?');
      countParams.push(status);
    }

    if (countConditions.length > 0) {
      countSql += ' WHERE ' + countConditions.join(' AND ');
    }

    const [countResult] = await query<any>(countSql, countParams);

    return res.json({
      workflows,
      total: countResult.total,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('Failed to fetch workflows', error as Error);
    return res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

/**
 * GET /api/workflows/:id
 * Get workflow details with all related data including sub-workflows
 */
router.get('/workflows/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    // Get workflow
    const [workflow] = await query<any>(
      'SELECT * FROM workflows WHERE id = ?',
      [id]
    );

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Compute effective status by checking all descendants
    const [descendantStats] = await query<any>(`
      WITH RECURSIVE descendants AS (
        SELECT id, status FROM workflows WHERE id = ?
        UNION ALL
        SELECT w.id, w.status FROM workflows w
        JOIN descendants d ON w.parent_workflow_id = d.id
      )
      SELECT
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN status IN ('pending', 'running', 'in_progress', 'planning') THEN 1 ELSE 0 END) as incomplete_count
      FROM descendants WHERE id != ?
    `, [id, id]);

    const failedDescendants = parseInt(descendantStats?.failed_count || '0');
    const incompleteDescendants = parseInt(descendantStats?.incomplete_count || '0');

    // Determine effective status
    let effectiveStatus = workflow.status;
    if (workflow.status === 'completed') {
      if (failedDescendants > 0) {
        effectiveStatus = 'failed';
      } else if (incompleteDescendants > 0) {
        effectiveStatus = 'in_progress';
      }
    }

    // Add effective status info to workflow
    workflow.effective_status = effectiveStatus;
    workflow.failedDescendants = failedDescendants;
    workflow.incompleteDescendants = incompleteDescendants;

    // Get agent executions
    const agents = await query<any>(
      'SELECT * FROM agent_executions WHERE workflow_id = ? ORDER BY started_at ASC',
      [id]
    );

    // Get artifacts from artifacts table - include artifacts from all descendant workflows
    const artifacts = await query<any>(
      `WITH RECURSIVE workflow_tree AS (
        SELECT id FROM workflows WHERE id = ?
        UNION ALL
        SELECT w.id FROM workflows w
        JOIN workflow_tree wt ON w.parent_workflow_id = wt.id
      )
      SELECT a.id, a.workflow_id, a.agent_execution_id, a.artifact_type, a.content, a.file_path, a.metadata, a.created_at
      FROM artifacts a
      WHERE a.workflow_id IN (SELECT id FROM workflow_tree)
      ORDER BY a.created_at ASC`,
      [id]
    );

    // Get sub-workflows (children of this workflow) ordered by execution_order and created_at
    const subWorkflowsRaw = await query<any>(
      `SELECT id, workflow_type, status, task_description, target_module,
              execution_order, created_at, started_at, completed_at, payload,
              (SELECT COUNT(*) FROM workflows grandchild WHERE grandchild.parent_workflow_id = w.id) as sub_workflow_count
       FROM workflows w
       WHERE parent_workflow_id = ?
       ORDER BY execution_order ASC, created_at ASC`,
      [id]
    );

    // Helper to extract description from payload or task_description
    const extractDescription = (wf: any): string | null => {
      if (wf.task_description) return wf.task_description;
      if (wf.payload) {
        try {
          const payload = typeof wf.payload === 'string' ? JSON.parse(wf.payload) : wf.payload;
          return payload.taskDescription || payload.title || payload.description || null;
        } catch { return null; }
      }
      return null;
    };

    // Map sub-workflows to include extracted description
    const subWorkflows = subWorkflowsRaw.map((sw: any) => ({
      ...sw,
      task_description: extractDescription(sw),
    }));

    return res.json({
      workflow,
      agents,
      artifacts,
      subWorkflows,
    });
  } catch (error) {
    logger.error('Failed to fetch workflow details', error as Error);
    return res.status(500).json({ error: 'Failed to fetch workflow details' });
  }
});

/**
 * GET /api/workflows/:id/logs
 * Get execution logs for a workflow
 */
router.get('/workflows/:id/logs', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const agentExecutionId = req.query.agentExecutionId
      ? parseInt(req.query.agentExecutionId as string)
      : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    const logs = await getExecutionLogs(id, agentExecutionId, limit);

    return res.json({ logs });
  } catch (error) {
    logger.error('Failed to fetch execution logs', error as Error);
    return res.status(500).json({ error: 'Failed to fetch execution logs' });
  }
});

/**
 * GET /api/agents/:id/logs
 * Get execution logs for a specific agent execution
 */
router.get('/agents/:id/logs', async (req: Request, res: Response) => {
  try {
    const agentExecutionId = parseInt(req.params.id);

    // Get the agent execution to find the workflow ID
    const [agentExecution] = await query<any>(
      'SELECT workflow_id FROM agent_executions WHERE id = ?',
      [agentExecutionId]
    );

    if (!agentExecution) {
      return res.status(404).json({ error: 'Agent execution not found' });
    }

    const logs = await getExecutionLogs(
      agentExecution.workflow_id,
      agentExecutionId
    );

    return res.json({ logs });
  } catch (error) {
    logger.error('Failed to fetch agent execution logs', error as Error);
    return res.status(500).json({ error: 'Failed to fetch agent execution logs' });
  }
});

/**
 * GET /api/agents
 * List all agent executions
 */
router.get('/agents', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as AgentStatus | undefined;

    let sql = 'SELECT * FROM agent_executions';
    const params: any[] = [];

    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const agents = await query(sql, params);

    return res.json({ agents });
  } catch (error) {
    logger.error('Failed to fetch agents', error as Error);
    return res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// ============================================================================
// Checkpoint Routes
// ============================================================================

/**
 * GET /api/workflows/:id/checkpoints
 * Get all checkpoints in a workflow tree
 */
router.get('/workflows/:id/checkpoints', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { getWorkflowCheckpoints } = await import('./workflow-state.js');
    const checkpoints = await getWorkflowCheckpoints(id);

    return res.json({
      success: true,
      data: {
        checkpoints,
        count: checkpoints.length,
      },
    });
  } catch (error) {
    logger.error('Failed to get workflow checkpoints', error as Error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get workflow checkpoints',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/workflows/:id/last-checkpoint
 * Get the most recent checkpoint in a workflow tree
 */
router.get('/workflows/:id/last-checkpoint', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { getLastCheckpoint } = await import('./workflow-state.js');
    const checkpoint = await getLastCheckpoint(id);

    return res.json({
      success: true,
      data: checkpoint,
    });
  } catch (error) {
    logger.error('Failed to get last checkpoint', error as Error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get last checkpoint',
      message: (error as Error).message,
    });
  }
});

/**
 * POST /api/workflows/:id/resume-from-checkpoint
 * Resume a workflow tree from a checkpoint
 */
router.post('/workflows/:id/resume-from-checkpoint', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { checkpointWorkflowId } = req.body;

    const { resumeFromCheckpoint } = await import('./workflow-state.js');
    const { advanceSubWorkflowQueue } = await import('./sub-workflow-queue.js');

    // Resume from checkpoint
    const result = await resumeFromCheckpoint(id, checkpointWorkflowId);

    // Git reset to checkpoint commit if needed
    if (result.checkpointCommit && result.targetModule) {
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        const moduleDir = `/home/kevin/Home/ex_nihilo/modules/${result.targetModule}`;
        await execAsync(`cd "${moduleDir}" && git checkout ${result.checkpointCommit}`, { timeout: 30000 });
        logger.info(`Git reset to checkpoint commit ${result.checkpointCommit} in ${result.targetModule}`);
      } catch (gitError) {
        logger.warn('Failed to reset git to checkpoint (may not be a git repo)', { error: (gitError as Error).message });
      }
    }

    // Advance the queue to start execution
    const nextWorkflowId = await advanceSubWorkflowQueue(id);

    return res.json({
      success: true,
      data: {
        checkpointCommit: result.checkpointCommit,
        resetWorkflowIds: result.resetWorkflowIds,
        removedWorkflowIds: result.removedWorkflowIds,
        nextWorkflowId,
        targetModule: result.targetModule,
      },
      message: `Resumed from checkpoint. Reset ${result.resetWorkflowIds.length} workflow(s), removed ${result.removedWorkflowIds.length} sub-workflow(s).`,
    });
  } catch (error) {
    logger.error('Failed to resume from checkpoint', error as Error);
    return res.status(500).json({
      success: false,
      error: 'Failed to resume from checkpoint',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/stats
 * Dashboard statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    // Workflow stats
    const [workflowStats] = await query<any>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status IN ('planning', 'coding', 'testing', 'reviewing', 'documenting') THEN 1 ELSE 0 END) as in_progress
      FROM workflows
    `);

    // Agent stats
    const [agentStats] = await query<any>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running
      FROM agent_executions
    `);

    // Recent activity (last 24 hours)
    const recentWorkflows = await query<any>(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') as hour,
        COUNT(*) as count
      FROM workflows
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY hour
      ORDER BY hour ASC
    `);

    // Artifact counts by type
    const artifactStats = await query<any>(`
      SELECT
        artifact_type as type,
        COUNT(*) as count
      FROM artifacts
      GROUP BY artifact_type
    `);

    return res.json({
      workflows: workflowStats,
      agents: agentStats,
      recentActivity: recentWorkflows,
      artifacts: artifactStats,
    });
  } catch (error) {
    logger.error('Failed to fetch stats', error as Error);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/prompts
 * List all available AI prompts
 */
router.get('/prompts', async (_req: Request, res: Response) => {
  try {
    const promptsDir = path.join(process.cwd(), 'config', 'agent-prompts');
    const files = await fs.readdir(promptsDir);

    const prompts = await Promise.all(
      files
        .filter((f) => f.endsWith('.md'))
        .map(async (file) => {
          const content = await fs.readFile(
            path.join(promptsDir, file),
            'utf-8'
          );
          const stats = await fs.stat(path.join(promptsDir, file));

          return {
            name: file,
            path: file,
            size: content.length,
            lines: content.split('\n').length,
            modified: stats.mtime,
          };
        })
    );

    return res.json({ prompts });
  } catch (error) {
    logger.error('Failed to fetch prompts', error as Error);
    return res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});

/**
 * GET /api/prompts/:name
 * Get prompt content
 */
router.get('/prompts/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const promptPath = path.join(
      process.cwd(),
      'config',
      'agent-prompts',
      name
    );

    const content = await fs.readFile(promptPath, 'utf-8');

    return res.json({ name, content });
  } catch (error) {
    logger.error('Failed to fetch prompt', error as Error);
    return res.status(404).json({ error: 'Prompt not found' });
  }
});

/**
 * PUT /api/prompts/:name
 * Update prompt content
 */
router.put('/prompts/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const promptPath = path.join(
      process.cwd(),
      'config',
      'agent-prompts',
      name
    );

    await fs.writeFile(promptPath, content, 'utf-8');

    logger.info('Prompt updated', { name });

    return res.json({ success: true, name });
  } catch (error) {
    logger.error('Failed to update prompt', error as Error);
    return res.status(500).json({ error: 'Failed to update prompt' });
  }
});

/**
 * GET /api/errors
 * Get error logs
 */
router.get('/errors', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;

    // Get failed workflows
    const failedWorkflows = await query<any>(
      `SELECT * FROM workflows WHERE status = 'failed' ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );

    // Get failed agents
    const failedAgents = await query<any>(
      `SELECT * FROM agent_executions WHERE status = 'failed' ORDER BY started_at DESC LIMIT ${limit}`
    );

    return res.json({
      workflows: failedWorkflows,
      agents: failedAgents,
    });
  } catch (error) {
    logger.error('Failed to fetch errors', error as Error);
    return res.status(500).json({ error: 'Failed to fetch errors' });
  }
});

/**
 * POST /api/workflows/manual
 * Submit manual workflow (same as webhook but via REST)
 */
router.post('/workflows/manual', async (req: Request, res: Response) => {
  try {
    const { workflowType, targetModule, targetModules, taskDescription } = req.body;

    if (!workflowType || !taskDescription) {
      return res.status(400).json({
        error: 'workflowType and taskDescription are required',
      });
    }

    // Support both targetModule (string) and targetModules (array)
    const resolvedModule = targetModule || (Array.isArray(targetModules) ? targetModules[0] : null);

    if (!resolvedModule) {
      return res.status(400).json({
        error: 'targetModule or targetModules is required',
      });
    }

    // Import dynamically to avoid circular dependencies
    const { createWorkflow } = await import('./workflow-state.js');
    const { WorkflowType } = await import('./types.js');

    // Map workflowType string to enum
    const workflowTypeLower = workflowType.toLowerCase();
    let mappedType: typeof WorkflowType[keyof typeof WorkflowType];

    switch (workflowTypeLower) {
      case 'feature':
        mappedType = WorkflowType.FEATURE;
        break;
      case 'bugfix':
        mappedType = WorkflowType.BUGFIX;
        break;
      case 'documentation':
        mappedType = WorkflowType.DOCUMENTATION;
        break;
      case 'refactor':
        mappedType = WorkflowType.REFACTOR;
        break;
      case 'review':
        mappedType = WorkflowType.REVIEW;
        break;
      case 'new_module':
        mappedType = WorkflowType.NEW_MODULE;
        break;
      default:
        return res.status(400).json({
          error: `Invalid workflowType: ${workflowType}. Valid types: feature, bugfix, documentation, refactor, review, new_module`,
        });
    }

    // Create payload
    const payload = {
      source: 'manual' as const,
      workflowType: workflowType.toLowerCase(),
      targetModule: resolvedModule,
      taskDescription,
    };

    // Create workflow record with auto_execute_children enabled
    const workflowId = await createWorkflow(mappedType, payload, resolvedModule, {
      autoExecuteChildren: true,
    });

    logger.info('Manual workflow created', {
      workflowId,
      workflowType: mappedType,
      targetModule: resolvedModule,
      taskDescription,
    });

    // Execute the workflow asynchronously
    (async () => {
      try {
        logger.info('Starting workflow execution', { workflowId, targetModule: resolvedModule });

        const { createWorkflowDirectory } = await import('./utils/workflow-directory-manager.js');
        // @ts-ignore - Dynamic import path resolved at runtime
        const { WorkflowOrchestrator } = await import('file:///home/kevin/Home/ex_nihilo/modules/WorkflowOrchestrator/index.js');

        // Create a branch name for the workflow
        const sanitizedDescription = taskDescription
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .substring(0, 30);
        const branchName = `workflow-${workflowType.toLowerCase()}-${workflowId}-${sanitizedDescription}`;

        // Create workflow directory (clones repo)
        const workflowDir = await createWorkflowDirectory(workflowId, branchName, mappedType, resolvedModule);

        logger.info('Workflow directory created', { workflowId, workflowDir, branchName });

        // Update workflow status to running
        await query('UPDATE workflows SET status = ? WHERE id = ?', ['running', workflowId]);

        logger.info('Executing WorkflowOrchestrator', { workflowId, workflowType });

        // Execute WorkflowOrchestrator
        const orchestrator = new WorkflowOrchestrator();
        const result = await orchestrator.execute({
          workflowId,
          workflowType: workflowType.toLowerCase(),
          targetModule: resolvedModule,
          taskDescription,
          workingDir: workflowDir,
        });

        // Save artifacts from the workflow result
        if (result.artifacts && result.artifacts.length > 0) {
          const { saveArtifact } = await import('./workflow-state.js');
          for (const artifact of result.artifacts) {
            try {
              await saveArtifact(
                workflowId,
                null, // executionId - not available here
                artifact.type as any,
                artifact.content,
                artifact.filePath,
                artifact.metadata
              );
              logger.debug('Saved artifact', { workflowId, type: artifact.type });
            } catch (artifactError) {
              logger.error('Failed to save artifact', artifactError as Error, {
                workflowId,
                type: artifact.type,
              });
            }
          }
        }

        // Update workflow status based on result
        const finalStatus = result.success ? 'completed' : 'failed';
        if (!result.success) {
          const currentPayload = await query('SELECT payload FROM workflows WHERE id = ?', [workflowId]);
          const rawPayload = currentPayload[0]?.payload;
          // Handle both string and object payloads (MySQL JSON columns may already be parsed)
          const payloadData = rawPayload
            ? typeof rawPayload === 'string'
              ? JSON.parse(rawPayload)
              : rawPayload
            : {};
          payloadData.error = result.summary;
          await query('UPDATE workflows SET status = ?, payload = ? WHERE id = ?', [
            finalStatus,
            JSON.stringify(payloadData),
            workflowId,
          ]);
        } else {
          await query('UPDATE workflows SET status = ? WHERE id = ?', [finalStatus, workflowId]);
        }

        logger.info('Workflow execution completed', { workflowId, status: finalStatus });
      } catch (error) {
        logger.error('Failed to execute manual workflow', error as Error, {
          workflowId,
          errorMessage: (error as Error).message,
          errorStack: (error as Error).stack,
        });
        // Update workflow status to failed
        try {
          const currentPayload = await query('SELECT payload FROM workflows WHERE id = ?', [workflowId]);
          const rawPayload = currentPayload[0]?.payload;
          // Handle both string and object payloads (MySQL JSON columns may already be parsed)
          const payloadData = rawPayload
            ? typeof rawPayload === 'string'
              ? JSON.parse(rawPayload)
              : rawPayload
            : {};
          payloadData.error = (error as Error).message;
          await query('UPDATE workflows SET status = ?, payload = ? WHERE id = ?', [
            'failed',
            JSON.stringify(payloadData),
            workflowId,
          ]);
        } catch (updateError) {
          logger.error('Failed to update workflow status', updateError as Error, { workflowId });
        }
      }
    })().catch((error) => {
      logger.error('Unhandled error in workflow execution', error as Error, { workflowId });
    });

    return res.json({
      success: true,
      workflowId,
      message: `Workflow started for ${resolvedModule}: ${taskDescription}`,
    });
  } catch (error) {
    logger.error('Failed to submit workflow', error as Error);
    return res.status(500).json({ error: 'Failed to submit workflow' });
  }
});

/**
 * POST /api/workflows/new-module
 * Create a new module with workflow orchestration
 */
router.post('/workflows/new-module', async (req: Request, res: Response) => {
  try {
    const {
      moduleName,
      description,
      moduleType = 'service',
      port,
      hasFrontend = true,
      frontendPort,
      relatedModules = [],
      taskDescription,
    } = req.body;

    if (!moduleName || !description) {
      return res.status(400).json({
        error: 'moduleName and description are required',
      });
    }

    // Import dynamically to avoid circular dependencies
    const { createWorkflow } = await import('./workflow-state.js');

    // Create payload in WebhookPayload format
    const payload = {
      source: 'manual' as const,
      workflowType: 'new_module',
      targetModule: moduleName,
      taskDescription: taskDescription || description,
      metadata: {
        moduleType,
        port,
        hasFrontend,
        frontendPort,
        relatedModules,
      },
    };

    // Import workflow types
    const { WorkflowType } = await import('./types.js');
    
    // Create workflow record with auto_execute_children enabled for new_module workflows
    const workflowId = await createWorkflow(WorkflowType.NEW_MODULE, payload, moduleName, {
      autoExecuteChildren: true,
    });

    logger.info('New module workflow created', {
      workflowId,
      moduleName,
      moduleType,
      hasFrontend,
      description: taskDescription || description,
    });

    // Execute the workflow asynchronously
    // For new_module workflows, we create a temporary workflow directory
    // The ModuleScaffoldAgent will handle module creation
    (async () => {
      try {
        logger.info('Starting workflow execution', { workflowId, moduleName });
        
        const { getWorkflowDirectory } = await import('./utils/workflow-directory-manager.js');
        // @ts-ignore - Dynamic import path resolved at runtime
        const { WorkflowOrchestrator } = await import('file:///home/kevin/Home/ex_nihilo/modules/WorkflowOrchestrator/index.js');
        
        // Create a temporary workflow directory for the scaffold agent
        // For new_module, we don't need to clone a repo - ModuleScaffoldAgent creates it
        const branchName = `new-module-${moduleName}-${workflowId}`;
        const workflowDir = getWorkflowDirectory(workflowId, branchName);
        
        logger.info('Creating workflow directory', { workflowId, workflowDir });
        await fs.mkdir(workflowDir, { recursive: true });
        
        // Update workflow status to running
        await query('UPDATE workflows SET status = ? WHERE id = ?', ['running', workflowId]);
        
        logger.info('Executing WorkflowOrchestrator', { workflowId, workflowType: 'new_module' });
        
        // Execute WorkflowOrchestrator
        const orchestrator = new WorkflowOrchestrator();
        const result = await orchestrator.execute({
          workflowId,
          workflowType: 'new_module',
          targetModule: moduleName,
          taskDescription: taskDescription || description,
          workingDir: workflowDir,
          metadata: {
            moduleType,
            port,
            hasFrontend,
            frontendPort,
            relatedModules,
          },
        });

        // Save artifacts from the workflow result
        if (result.artifacts && result.artifacts.length > 0) {
          const { saveArtifact } = await import('./workflow-state.js');
          for (const artifact of result.artifacts) {
            try {
              await saveArtifact(
                workflowId,
                null, // executionId - not available here
                artifact.type as any,
                artifact.content,
                artifact.filePath,
                artifact.metadata
              );
              logger.debug('Saved artifact', { workflowId, type: artifact.type });
            } catch (artifactError) {
              logger.error('Failed to save artifact', artifactError as Error, {
                workflowId,
                type: artifact.type,
              });
            }
          }
        }

        // Update workflow status based on result
        const finalStatus = result.success ? 'completed' : 'failed';
        // Store error in payload if failed
        if (!result.success) {
          const currentPayload = await query('SELECT payload FROM workflows WHERE id = ?', [workflowId]);
          const rawPayload = currentPayload[0]?.payload;
          // Handle both string and object payloads (MySQL JSON columns may already be parsed)
          const payload = rawPayload
            ? typeof rawPayload === 'string'
              ? JSON.parse(rawPayload)
              : rawPayload
            : {};
          payload.error = result.summary;
          await query('UPDATE workflows SET status = ?, payload = ? WHERE id = ?', [
            finalStatus,
            JSON.stringify(payload),
            workflowId,
          ]);
        } else {
          await query('UPDATE workflows SET status = ? WHERE id = ?', [finalStatus, workflowId]);
        }
        
        logger.info('Workflow execution completed', { workflowId, status: finalStatus });
      } catch (error) {
        logger.error('Failed to execute new module workflow', error as Error, { 
          workflowId,
          errorMessage: (error as Error).message,
          errorStack: (error as Error).stack,
        });
        // Update workflow status to failed and store error in payload
        try {
          const currentPayload = await query('SELECT payload FROM workflows WHERE id = ?', [workflowId]);
          const rawPayload = currentPayload[0]?.payload;
          // Handle both string and object payloads (MySQL JSON columns may already be parsed)
          const payload = rawPayload
            ? typeof rawPayload === 'string'
              ? JSON.parse(rawPayload)
              : rawPayload
            : {};
          payload.error = (error as Error).message;
          await query('UPDATE workflows SET status = ?, payload = ? WHERE id = ?', [
            'failed',
            JSON.stringify(payload),
            workflowId,
          ]);
        } catch (updateError) {
          logger.error('Failed to update workflow status', updateError as Error, { workflowId });
        }
      }
    })().catch((error) => {
      logger.error('Unhandled error in workflow execution', error as Error, { workflowId });
    });

    return res.json({
      success: true,
      workflowId,
      message: `Module creation workflow started for ${moduleName}`,
    });
  } catch (error) {
    logger.error('Failed to create new module workflow', error as Error);
    return res.status(500).json({
      error: 'Failed to create module workflow',
      message: (error as Error).message,
    });
  }
});

/**
 * POST /api/workflows/dockerize
 * Add Docker configuration to an existing module
 */
router.post('/workflows/dockerize', async (req: Request, res: Response) => {
  try {
    const {
      moduleName,
      databaseType = 'none',
      port,
      frontendPort,
      hasFrontend,
    } = req.body;

    if (!moduleName) {
      return res.status(400).json({
        error: 'moduleName is required',
      });
    }

    // Verify module exists
    const modulePath = path.join('/home/kevin/Home/ex_nihilo/modules', moduleName);
    try {
      await fs.access(modulePath);
    } catch {
      return res.status(404).json({
        error: `Module not found: ${moduleName}`,
      });
    }

    // Import dynamically to avoid circular dependencies
    const { createWorkflow } = await import('./workflow-state.js');

    // Create payload in WebhookPayload format
    const payload = {
      source: 'manual' as const,
      workflowType: 'dockerize',
      targetModule: moduleName,
      taskDescription: `Add Docker configuration to ${moduleName}`,
      metadata: {
        databaseType,
        port,
        frontendPort,
        hasFrontend,
      },
    };

    // Import workflow types
    const { WorkflowType } = await import('./types.js');

    // Create workflow record
    const workflowId = await createWorkflow(WorkflowType.DOCKERIZE, payload, moduleName);

    logger.info('Dockerize workflow created', { workflowId, moduleName, databaseType });

    // Execute the workflow asynchronously
    (async () => {
      try {
        const { getWorkflowDirectory } = await import('./utils/workflow-directory-manager.js');
        // @ts-ignore - Dynamic import path resolved at runtime
        const { WorkflowOrchestrator } = await import('file:///home/kevin/Home/ex_nihilo/modules/WorkflowOrchestrator/index.js');

        // Create workflow directory
        const branchName = `dockerize-${moduleName}-${workflowId}`;
        const workflowDir = getWorkflowDirectory(workflowId, branchName);

        logger.info('Creating workflow directory', { workflowId, workflowDir });
        await fs.mkdir(workflowDir, { recursive: true });

        // Update workflow status to running
        await query('UPDATE workflows SET status = ? WHERE id = ?', ['running', workflowId]);

        logger.info('Executing WorkflowOrchestrator', { workflowId, workflowType: 'dockerize' });

        // Execute WorkflowOrchestrator
        const orchestrator = new WorkflowOrchestrator();
        const result = await orchestrator.execute({
          workflowId,
          workflowType: 'dockerize',
          targetModule: moduleName,
          taskDescription: `Add Docker configuration to ${moduleName}`,
          workingDir: workflowDir,
          metadata: {
            databaseType,
            port,
            frontendPort,
            hasFrontend,
          },
        });

        // Save artifacts from the workflow result
        if (result.artifacts && result.artifacts.length > 0) {
          const { saveArtifact } = await import('./workflow-state.js');
          for (const artifact of result.artifacts) {
            await saveArtifact(workflowId, artifact.filePath || `docker-${artifact.type}`, artifact.content, artifact.type);
          }
        }

        // Update workflow status based on result
        const finalStatus = result.success ? 'completed' : 'failed';
        if (!result.success) {
          const currentPayload = await query('SELECT payload FROM workflows WHERE id = ?', [workflowId]);
          const rawPayload = currentPayload[0]?.payload;
          const payload = rawPayload
            ? typeof rawPayload === 'string'
              ? JSON.parse(rawPayload)
              : rawPayload
            : {};
          payload.error = result.summary;
          await query('UPDATE workflows SET status = ?, payload = ? WHERE id = ?', [
            finalStatus,
            JSON.stringify(payload),
            workflowId,
          ]);
        } else {
          await query('UPDATE workflows SET status = ? WHERE id = ?', [finalStatus, workflowId]);
        }

        logger.info('Dockerize workflow completed', { workflowId, status: finalStatus });
      } catch (error) {
        logger.error('Failed to execute dockerize workflow', error as Error, {
          workflowId,
          errorMessage: (error as Error).message,
        });
        try {
          const currentPayload = await query('SELECT payload FROM workflows WHERE id = ?', [workflowId]);
          const rawPayload = currentPayload[0]?.payload;
          const payload = rawPayload
            ? typeof rawPayload === 'string'
              ? JSON.parse(rawPayload)
              : rawPayload
            : {};
          payload.error = (error as Error).message;
          await query('UPDATE workflows SET status = ?, payload = ? WHERE id = ?', [
            'failed',
            JSON.stringify(payload),
            workflowId,
          ]);
        } catch (updateError) {
          logger.error('Failed to update workflow status', updateError as Error, { workflowId });
        }
      }
    })().catch((error) => {
      logger.error('Unhandled error in dockerize workflow execution', error as Error, { workflowId });
    });

    return res.json({
      success: true,
      workflowId,
      message: `Docker configuration workflow started for ${moduleName}`,
    });
  } catch (error) {
    logger.error('Failed to create dockerize workflow', error as Error);
    return res.status(500).json({
      error: 'Failed to create dockerize workflow',
      message: (error as Error).message,
    });
  }
});

/**
 * DELETE /api/workflows/:id
 * Cancel a workflow
 */
router.delete('/workflows/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    // Update workflow status to failed
    await query('UPDATE workflows SET status = ?, error = ? WHERE id = ?', [
      'failed',
      'Cancelled by user',
      id,
    ]);

    // Update any running agents
    await query(
      `UPDATE agent_executions SET status = ?, error = ? WHERE workflow_id = ? AND status IN ('pending', 'running')`,
      ['failed', 'Workflow cancelled', id]
    );

    logger.info('Workflow cancelled', { workflowId: id });

    return res.json({ success: true });
  } catch (error) {
    logger.error('Failed to cancel workflow', error as Error);
    return res.status(500).json({ error: 'Failed to cancel workflow' });
  }
});

// ============================================================================
// Workflow Conversation Thread Endpoints
// ============================================================================

/**
 * GET /api/workflows/:id/messages
 * Get all messages in the workflow conversation thread (includes sub-workflow messages)
 */
router.get('/workflows/:id/messages', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { getMessages, getRootWorkflowId } = await import('./workflow-messages.js');

    // Get root workflow ID to determine if this is a sub-workflow
    const rootWorkflowId = await getRootWorkflowId(id);
    const isSubWorkflow = rootWorkflowId !== id;

    // Always get messages from the root workflow's tree
    const messages = await getMessages(rootWorkflowId, true);

    return res.json({
      success: true,
      data: {
        messages,
        rootWorkflowId,
        isSubWorkflow,
        requestedWorkflowId: id,
      },
    });
  } catch (error) {
    logger.error('Failed to get workflow messages', error as Error);
    return res.status(500).json({ error: 'Failed to get workflow messages' });
  }
});

/**
 * POST /api/workflows/:id/messages
 * Send a message to the workflow conversation thread
 */
router.post('/workflows/:id/messages', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { content, action_type = 'comment', metadata } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message content is required',
      });
    }

    const { addMessage, pauseWorkflow, unpauseWorkflow } = await import('./workflow-messages.js');

    // Handle special action types
    let actionTaken: string | undefined;

    if (action_type === 'pause') {
      await pauseWorkflow(id, content);
      actionTaken = 'Workflow pause requested';
    } else if (action_type === 'resume') {
      await unpauseWorkflow(id);
      actionTaken = 'Workflow resumed';
    } else if (action_type === 'cancel') {
      // Cancel the workflow
      await query('UPDATE workflows SET status = ? WHERE id = ?', ['failed', id]);
      await query(
        `UPDATE agent_executions SET status = 'failed', error_message = ? WHERE workflow_id = ? AND status IN ('pending', 'running')`,
        ['Cancelled by user', id]
      );
      actionTaken = 'Workflow cancelled';
    }

    // Add the user message
    const messageId = await addMessage(id, 'user', content, {
      actionType: action_type,
      metadata,
    });

    logger.info('User message added to workflow', {
      workflowId: id,
      messageId,
      actionType: action_type,
    });

    return res.json({
      success: true,
      data: {
        messageId,
        actionTaken,
      },
    });
  } catch (error) {
    logger.error('Failed to add workflow message', error as Error);
    return res.status(500).json({ error: 'Failed to add workflow message' });
  }
});

/**
 * POST /api/workflows/:id/pause
 * Pause a running workflow
 */
router.post('/workflows/:id/pause', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body;

    const { pauseWorkflow } = await import('./workflow-messages.js');
    await pauseWorkflow(id, reason || 'User requested pause');

    logger.info('Workflow pause requested', { workflowId: id, reason });

    return res.json({
      success: true,
      message: 'Workflow pause requested',
    });
  } catch (error) {
    logger.error('Failed to pause workflow', error as Error);
    return res.status(500).json({ error: 'Failed to pause workflow' });
  }
});

/**
 * POST /api/workflows/:id/force-fail
 * Force a workflow to fail immediately
 */
router.post('/workflows/:id/force-fail', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body;

    // Get workflow to check current status
    const workflows = await query('SELECT status FROM workflows WHERE id = ?', [id]);
    if (!workflows || workflows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const workflow = workflows[0];
    if (workflow.status === 'failed' || workflow.status === 'completed') {
      return res.status(400).json({
        error: `Cannot force fail workflow in '${workflow.status}' state`,
      });
    }

    const errorMessage = reason || 'Manually forced to fail by user';

    // Get current payload to add error info
    const currentPayloadResult = await query('SELECT payload FROM workflows WHERE id = ?', [id]);
    const currentPayload = currentPayloadResult[0]?.payload || {};
    const updatedPayload = {
      ...currentPayload,
      error: errorMessage,
      forceFailedAt: new Date().toISOString(),
    };

    // Update workflow status to failed (store error in payload JSON since there's no error_message column)
    await query(
      'UPDATE workflows SET status = ?, payload = ?, is_paused = false WHERE id = ?',
      ['failed', JSON.stringify(updatedPayload), id]
    );

    // Fail any running agent executions
    await query(
      `UPDATE agent_executions SET status = 'failed'
       WHERE workflow_id = ? AND status IN ('pending', 'running')`,
      [id]
    );

    // Update sub-workflow queue if this is a queued workflow
    await query(
      `UPDATE sub_workflow_queue SET status = 'failed'
       WHERE child_workflow_id = ? AND status IN ('pending', 'in_progress')`,
      [id]
    );

    logger.info('Workflow force-failed', { workflowId: id, reason: errorMessage });

    // Emit websocket event
    const { emitWorkflowFailed } = await import('./websocket-emitter.js');
    emitWorkflowFailed(id, errorMessage);

    return res.json({
      success: true,
      message: 'Workflow failed',
    });
  } catch (error) {
    logger.error('Failed to force-fail workflow', error as Error);
    return res.status(500).json({ error: 'Failed to force-fail workflow' });
  }
});

/**
 * POST /api/workflows/:id/unpause
 * Resume a paused workflow
 */
router.post('/workflows/:id/unpause', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    const { unpauseWorkflow } = await import('./workflow-messages.js');
    await unpauseWorkflow(id);

    logger.info('Workflow unpaused', { workflowId: id });

    return res.json({
      success: true,
      message: 'Workflow resumed',
    });
  } catch (error) {
    logger.error('Failed to unpause workflow', error as Error);
    return res.status(500).json({ error: 'Failed to unpause workflow' });
  }
});

/**
 * POST /api/workflows/:id/resume
 * Resume a failed/cancelled/completed workflow from where it left off
 * For workflows with sub-workflows: continues executing the sub-workflow queue
 * For single workflows: re-runs the WorkflowOrchestrator (if available)
 */
router.post('/workflows/:id/resume', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    // Get workflow details
    const { getWorkflow, updateWorkflowStatus, saveArtifact } = await import('./workflow-state.js');
    const { getQueueStatus, advanceSubWorkflowQueue, updateSubWorkflowStatus, getNextExecutableSubWorkflow, resetFailedSubWorkflows } = await import('./sub-workflow-queue.js');

    const workflow = await getWorkflow(id);
    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    // Check if workflow can be resumed (must be in failed, completed, or cancelled state)
    if (!['failed', 'completed', 'cancelled'].includes(workflow.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot resume workflow in '${workflow.status}' state`,
        message: 'Only failed, completed, or cancelled workflows can be resumed',
      });
    }

    // Check if this workflow has sub-workflows
    const queueStatus = await getQueueStatus(id);

    if (queueStatus.total > 0) {
      // This workflow has sub-workflows - resume the queue
      logger.info('Resuming workflow with sub-workflow queue', {
        workflowId: id,
        queueStatus,
      });

      // Reset all failed/in_progress sub-workflows back to pending
      // This allows the pipeline to restart from the earliest failure point
      const resetResult = await resetFailedSubWorkflows(id);
      logger.info('Reset failed sub-workflows for resume', {
        workflowId: id,
        resetCount: resetResult.resetCount,
        earliestResetOrder: resetResult.earliestResetOrder,
      });

      // Update workflow status to planning (re-started)
      await updateWorkflowStatus(id, WorkflowStatus.PLANNING);

      // IMPORTANT: If this workflow has a parent, mark this workflow's entry in the parent's queue as in_progress
      // This prevents sibling workflows from running concurrently
      if (workflow.parentWorkflowId) {
        await updateSubWorkflowStatus(id, 'in_progress');
        logger.info('Marked workflow as in_progress in parent queue', {
          workflowId: id,
          parentWorkflowId: workflow.parentWorkflowId,
        });
      }

      // Get next workflow to execute (should now be the first pending one)
      const nextWorkflowEntry = await getNextExecutableSubWorkflow(id);

      // Send response immediately, continue execution asynchronously
      res.json({
        success: true,
        message: `Workflow ${id} resumed`,
        data: {
          workflowId: id,
          queueStatus: await getQueueStatus(id),
          nextWorkflowId: nextWorkflowEntry?.childWorkflowId || null,
        },
      });

      // Continue execution asynchronously (fire-and-forget)
      if (nextWorkflowEntry) {
        (async () => {
          try {
            // Mark next workflow as in_progress
            await updateSubWorkflowStatus(nextWorkflowEntry.childWorkflowId, 'in_progress');

            // Execute the sub-workflow queue
            // @ts-ignore - Dynamic import path resolved at runtime
            const { WorkflowOrchestrator } = await import('file:///home/kevin/Home/ex_nihilo/modules/WorkflowOrchestrator/index.js');
            const { getWorkflowDirectory } = await import('./utils/workflow-directory-manager.js');

            let currentWorkflowId: number | null = nextWorkflowEntry.childWorkflowId;

            while (currentWorkflowId) {
              const currentWorkflow = await getWorkflow(currentWorkflowId);
              if (!currentWorkflow) break;

              logger.info('Executing sub-workflow from resume', {
                workflowId: currentWorkflowId,
                type: currentWorkflow.type,
              });

              const targetModule = currentWorkflow.target_module;
              const workflowDir = targetModule
                ? `/home/kevin/Home/ex_nihilo/modules/${targetModule}`
                : getWorkflowDirectory(currentWorkflowId, currentWorkflow.branchName || 'master');

              await updateWorkflowStatus(currentWorkflowId, WorkflowStatus.PLANNING);

              const orchestrator = new WorkflowOrchestrator();
              const payload = typeof currentWorkflow.payload === 'string'
                ? JSON.parse(currentWorkflow.payload)
                : currentWorkflow.payload;

              try {
                const result = await orchestrator.execute({
                  workflowId: currentWorkflowId,
                  workflowType: currentWorkflow.type,
                  targetModule: currentWorkflow.target_module,
                  taskDescription: payload.taskDescription || payload.title || '',
                  workingDir: workflowDir,
                  metadata: payload.metadata || {},
                });

                // Save artifacts from the workflow result
                if (result.artifacts && result.artifacts.length > 0) {
                  for (const artifact of result.artifacts) {
                    try {
                      await saveArtifact(
                        currentWorkflowId,
                        null,
                        artifact.type as any,
                        artifact.content,
                        artifact.filePath,
                        artifact.metadata
                      );
                      logger.debug('Saved artifact', { workflowId: currentWorkflowId, type: artifact.type });
                    } catch (artifactError) {
                      logger.error('Failed to save artifact', artifactError as Error, {
                        workflowId: currentWorkflowId,
                        type: artifact.type,
                      });
                    }
                  }
                }

                const finalStatus = result.success ? WorkflowStatus.COMPLETED : WorkflowStatus.FAILED;
                await updateWorkflowStatus(currentWorkflowId, finalStatus);
                await updateSubWorkflowStatus(currentWorkflowId, result.success ? 'completed' : 'failed', result.success ? undefined : result.summary);

                logger.info('Sub-workflow completed', {
                  workflowId: currentWorkflowId,
                  status: finalStatus,
                });

                // Advance to next workflow
                currentWorkflowId = await advanceSubWorkflowQueue(id);
              } catch (execError) {
                logger.error('Sub-workflow execution failed', execError as Error, {
                  workflowId: currentWorkflowId,
                });
                if (currentWorkflowId !== null) {
                  await updateWorkflowStatus(currentWorkflowId, WorkflowStatus.FAILED);
                  await updateSubWorkflowStatus(currentWorkflowId, 'failed', (execError as Error).message);
                }
                break;
              }
            }

            logger.info('Resume execution completed for workflow', { workflowId: id });
          } catch (asyncError) {
            logger.error('Resume async execution failed', asyncError as Error, { workflowId: id });
          }
        })().catch((error) => {
          logger.error('Unhandled error in resume execution', error as Error);
        });
      }

      return;
    }

    // No sub-workflows - this is a leaf workflow
    // Re-run the WorkflowOrchestrator for this workflow
    logger.info('Resuming leaf workflow by re-executing', { workflowId: id, type: workflow.type });

    // Reset workflow status to pending
    await updateWorkflowStatus(id, WorkflowStatus.PENDING);

    // Reset any failed agents for this workflow
    await query(
      `UPDATE agent_executions
       SET status = 'pending', error_message = NULL, completed_at = NULL
       WHERE workflow_id = ? AND status = 'failed'`,
      [id]
    );

    // If this is a sub-workflow, update its queue entry status
    if (workflow.parentWorkflowId) {
      const { updateSubWorkflowStatus } = await import('./sub-workflow-queue.js');
      await updateSubWorkflowStatus(id, 'pending');
    }

    // Send response immediately
    res.json({
      success: true,
      message: `Leaf workflow ${id} resumed`,
      data: {
        workflowId: id,
        type: workflow.type,
        targetModule: workflow.target_module,
      },
    });

    // Execute asynchronously
    (async () => {
      try {
        // @ts-ignore - Dynamic import path resolved at runtime
        const { WorkflowOrchestrator } = await import('file:///home/kevin/Home/ex_nihilo/modules/WorkflowOrchestrator/index.js');
        const { getWorkflowDirectory } = await import('./utils/workflow-directory-manager.js');

        const targetModule = workflow.target_module;
        const workflowDir = targetModule
          ? `/home/kevin/Home/ex_nihilo/modules/${targetModule}`
          : getWorkflowDirectory(id, workflow.branchName || 'master');

        await updateWorkflowStatus(id, WorkflowStatus.PLANNING);

        const orchestrator = new WorkflowOrchestrator();
        const payload = typeof workflow.payload === 'string'
          ? JSON.parse(workflow.payload)
          : workflow.payload;

        const result = await orchestrator.execute({
          workflowId: id,
          workflowType: workflow.type,
          targetModule: workflow.target_module,
          taskDescription: payload?.taskDescription || payload?.title || '',
          workingDir: workflowDir,
          metadata: payload?.metadata || {},
        });

        // Save artifacts from the workflow result
        if (result.artifacts && result.artifacts.length > 0) {
          for (const artifact of result.artifacts) {
            try {
              await saveArtifact(
                id,
                null,
                artifact.type as any,
                artifact.content,
                artifact.filePath,
                artifact.metadata
              );
              logger.debug('Saved artifact from leaf workflow resume', { workflowId: id, type: artifact.type });
            } catch (artifactError) {
              logger.error('Failed to save artifact', artifactError as Error, {
                workflowId: id,
                type: artifact.type,
              });
            }
          }
        }

        const finalStatus = result.success ? WorkflowStatus.COMPLETED : WorkflowStatus.FAILED;
        await updateWorkflowStatus(id, finalStatus);

        // If this is a sub-workflow, update its queue entry status and advance the parent queue
        if (workflow.parentWorkflowId) {
          const { updateSubWorkflowStatus, advanceSubWorkflowQueue } = await import('./sub-workflow-queue.js');
          await updateSubWorkflowStatus(id, result.success ? 'completed' : 'failed', result.success ? undefined : result.summary);

          // If successful, try to advance the parent queue to continue execution
          if (result.success) {
            const nextWorkflowId = await advanceSubWorkflowQueue(workflow.parentWorkflowId);
            if (nextWorkflowId) {
              logger.info('Advanced parent queue after leaf workflow resume', {
                parentWorkflowId: workflow.parentWorkflowId,
                nextWorkflowId,
              });
            }
          }
        }

        logger.info('Leaf workflow resume completed', {
          workflowId: id,
          status: finalStatus,
          success: result.success,
        });
      } catch (asyncError) {
        logger.error('Leaf workflow resume execution failed', asyncError as Error, { workflowId: id });
        await updateWorkflowStatus(id, WorkflowStatus.FAILED);

        if (workflow.parentWorkflowId) {
          const { updateSubWorkflowStatus } = await import('./sub-workflow-queue.js');
          await updateSubWorkflowStatus(id, 'failed', (asyncError as Error).message);
        }
      }
    })().catch((error) => {
      logger.error('Unhandled error in leaf workflow resume', error as Error);
    });

    return;
  } catch (error) {
    logger.error('Failed to start workflow resume', error as Error);
    return res.status(500).json({ error: 'Failed to resume workflow' });
  }
});

/**
 * POST /api/workflows/:id/retry
 * Retry a failed/stuck sub-workflow
 * Resets the workflow and re-executes it
 */
router.post('/workflows/:id/retry', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    // Get workflow details
    const { getWorkflow, updateWorkflowStatus, saveArtifact } = await import('./workflow-state.js');
    const { updateSubWorkflowStatus, advanceSubWorkflowQueue } = await import('./sub-workflow-queue.js');

    const workflow = await getWorkflow(id);
    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    // Get parent workflow ID to check if this is a sub-workflow
    const parentId = workflow.parentWorkflowId;

    logger.info('Retrying workflow', {
      workflowId: id,
      currentStatus: workflow.status,
      parentWorkflowId: parentId,
    });

    // Reset workflow status to pending
    await updateWorkflowStatus(id, WorkflowStatus.PENDING);

    // If this is a sub-workflow, update queue entry status
    if (parentId) {
      await updateSubWorkflowStatus(id, 'pending');
    }

    // Send response immediately
    res.json({
      success: true,
      message: `Workflow ${id} reset for retry`,
      data: {
        workflowId: id,
        parentWorkflowId: parentId,
      },
    });

    // Execute the workflow asynchronously
    (async () => {
      try {
        // @ts-ignore - Dynamic import path resolved at runtime
        const { WorkflowOrchestrator } = await import('file:///home/kevin/Home/ex_nihilo/modules/WorkflowOrchestrator/index.js');
        const { getWorkflowDirectory } = await import('./utils/workflow-directory-manager.js');

        // Mark as in_progress
        if (parentId) {
          await updateSubWorkflowStatus(id, 'in_progress');
        }

        const targetModule = workflow.target_module;
        const workflowDir = targetModule
          ? `/home/kevin/Home/ex_nihilo/modules/${targetModule}`
          : getWorkflowDirectory(id, workflow.branchName || 'master');

        await updateWorkflowStatus(id, WorkflowStatus.PLANNING);

        const orchestrator = new WorkflowOrchestrator();
        const payload = typeof workflow.payload === 'string'
          ? JSON.parse(workflow.payload)
          : workflow.payload;

        const result = await orchestrator.execute({
          workflowId: id,
          workflowType: workflow.type,
          targetModule: workflow.target_module,
          taskDescription: payload.taskDescription || payload.title || '',
          workingDir: workflowDir,
          metadata: payload.metadata || {},
        });

        // Save artifacts from the workflow result
        if (result.artifacts && result.artifacts.length > 0) {
          for (const artifact of result.artifacts) {
            try {
              await saveArtifact(
                id,
                null,
                artifact.type as any,
                artifact.content,
                artifact.filePath,
                artifact.metadata
              );
              logger.debug('Saved artifact from retry', { workflowId: id, type: artifact.type });
            } catch (artifactError) {
              logger.error('Failed to save artifact', artifactError as Error, {
                workflowId: id,
                type: artifact.type,
              });
            }
          }
        }

        const finalStatus = result.success ? WorkflowStatus.COMPLETED : WorkflowStatus.FAILED;
        await updateWorkflowStatus(id, finalStatus);

        if (parentId) {
          await updateSubWorkflowStatus(id, result.success ? 'completed' : 'failed', result.success ? undefined : result.summary);

          // If successful, advance parent queue to continue with remaining workflows
          if (result.success) {
            let nextWorkflowId = await advanceSubWorkflowQueue(parentId);
            while (nextWorkflowId) {
              const nextWorkflow = await getWorkflow(nextWorkflowId);
              if (!nextWorkflow) break;

              logger.info('Executing next sub-workflow after retry', {
                workflowId: nextWorkflowId,
                type: nextWorkflow.type,
              });

              const nextTargetModule = nextWorkflow.target_module;
              const nextWorkflowDir = nextTargetModule
                ? `/home/kevin/Home/ex_nihilo/modules/${nextTargetModule}`
                : getWorkflowDirectory(nextWorkflowId, nextWorkflow.branchName || 'master');

              await updateWorkflowStatus(nextWorkflowId, WorkflowStatus.PLANNING);

              const nextOrchestrator = new WorkflowOrchestrator();
              const nextPayload = typeof nextWorkflow.payload === 'string'
                ? JSON.parse(nextWorkflow.payload)
                : nextWorkflow.payload;

              try {
                const nextResult = await nextOrchestrator.execute({
                  workflowId: nextWorkflowId,
                  workflowType: nextWorkflow.type,
                  targetModule: nextWorkflow.target_module,
                  taskDescription: nextPayload.taskDescription || nextPayload.title || '',
                  workingDir: nextWorkflowDir,
                  metadata: nextPayload.metadata || {},
                });

                // Save artifacts from the workflow result
                if (nextResult.artifacts && nextResult.artifacts.length > 0) {
                  for (const artifact of nextResult.artifacts) {
                    try {
                      await saveArtifact(
                        nextWorkflowId,
                        null,
                        artifact.type as any,
                        artifact.content,
                        artifact.filePath,
                        artifact.metadata
                      );
                      logger.debug('Saved artifact from retry loop', { workflowId: nextWorkflowId, type: artifact.type });
                    } catch (artifactError) {
                      logger.error('Failed to save artifact', artifactError as Error, {
                        workflowId: nextWorkflowId,
                        type: artifact.type,
                      });
                    }
                  }
                }

                const nextFinalStatus = nextResult.success ? WorkflowStatus.COMPLETED : WorkflowStatus.FAILED;
                await updateWorkflowStatus(nextWorkflowId, nextFinalStatus);
                await updateSubWorkflowStatus(nextWorkflowId, nextResult.success ? 'completed' : 'failed', nextResult.success ? undefined : nextResult.summary);

                if (!nextResult.success) break; // Stop on failure

                nextWorkflowId = await advanceSubWorkflowQueue(parentId);
              } catch (loopError) {
                logger.error('Sub-workflow execution failed after retry', loopError as Error, {
                  workflowId: nextWorkflowId,
                });
                if (nextWorkflowId !== null) {
                  await updateWorkflowStatus(nextWorkflowId, WorkflowStatus.FAILED);
                  await updateSubWorkflowStatus(nextWorkflowId, 'failed', (loopError as Error).message);
                }
                break;
              }
            }
          }
        }

        logger.info('Retry completed', { workflowId: id, status: finalStatus });
      } catch (asyncError) {
        logger.error('Retry execution failed', asyncError as Error, { workflowId: id });
        await updateWorkflowStatus(id, WorkflowStatus.FAILED);
        if (parentId) {
          await updateSubWorkflowStatus(id, 'failed', (asyncError as Error).message);
        }
      }
    })().catch((error) => {
      logger.error('Unhandled error in retry execution', error as Error);
    });

    return;
  } catch (error) {
    logger.error('Failed to retry workflow', error as Error);
    return res.status(500).json({ error: 'Failed to retry workflow' });
  }
});

/**
 * POST /api/workflows/:id/skip
 * Skip a failed sub-workflow and continue with remaining workflows
 */
router.post('/workflows/:id/skip', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    // Get workflow details
    const { getWorkflow, updateWorkflowStatus } = await import('./workflow-state.js');
    const { updateSubWorkflowStatus, advanceSubWorkflowQueue } = await import('./sub-workflow-queue.js');

    const workflow = await getWorkflow(id);
    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    const parentId = workflow.parentWorkflowId;
    if (!parentId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot skip a root workflow',
        message: 'Only sub-workflows can be skipped',
      });
    }

    logger.info('Skipping workflow', {
      workflowId: id,
      parentWorkflowId: parentId,
    });

    // Mark workflow as skipped
    await updateWorkflowStatus(id, WorkflowStatus.COMPLETED); // Use COMPLETED since there's no SKIPPED status
    await updateSubWorkflowStatus(id, 'skipped', 'Manually skipped by user');

    // Send response
    res.json({
      success: true,
      message: `Workflow ${id} skipped`,
      data: {
        workflowId: id,
        parentWorkflowId: parentId,
      },
    });

    // Continue with remaining workflows asynchronously
    (async () => {
      try {
        // @ts-ignore - Dynamic import path resolved at runtime
        const { WorkflowOrchestrator } = await import('file:///home/kevin/Home/ex_nihilo/modules/WorkflowOrchestrator/index.js');
        const { getWorkflowDirectory } = await import('./utils/workflow-directory-manager.js');

        let nextWorkflowId = await advanceSubWorkflowQueue(parentId);
        while (nextWorkflowId) {
          const nextWorkflow = await getWorkflow(nextWorkflowId);
          if (!nextWorkflow) break;

          logger.info('Executing next sub-workflow after skip', {
            workflowId: nextWorkflowId,
            type: nextWorkflow.type,
          });

          const nextTargetModule = nextWorkflow.target_module;
          const nextWorkflowDir = nextTargetModule
            ? `/home/kevin/Home/ex_nihilo/modules/${nextTargetModule}`
            : getWorkflowDirectory(nextWorkflowId, nextWorkflow.branchName || 'master');

          await updateWorkflowStatus(nextWorkflowId, WorkflowStatus.PLANNING);

          const nextOrchestrator = new WorkflowOrchestrator();
          const nextPayload = typeof nextWorkflow.payload === 'string'
            ? JSON.parse(nextWorkflow.payload)
            : nextWorkflow.payload;

          try {
            const nextResult = await nextOrchestrator.execute({
              workflowId: nextWorkflowId,
              workflowType: nextWorkflow.type,
              targetModule: nextWorkflow.target_module,
              taskDescription: nextPayload.taskDescription || nextPayload.title || '',
              workingDir: nextWorkflowDir,
              metadata: nextPayload.metadata || {},
            });

            const nextFinalStatus = nextResult.success ? WorkflowStatus.COMPLETED : WorkflowStatus.FAILED;
            await updateWorkflowStatus(nextWorkflowId, nextFinalStatus);
            await updateSubWorkflowStatus(nextWorkflowId, nextResult.success ? 'completed' : 'failed', nextResult.success ? undefined : nextResult.summary);

            if (!nextResult.success) break; // Stop on failure

            nextWorkflowId = await advanceSubWorkflowQueue(parentId);
          } catch (loopError) {
            logger.error('Sub-workflow execution failed after skip', loopError as Error, {
              workflowId: nextWorkflowId,
            });
            if (nextWorkflowId !== null) {
              await updateWorkflowStatus(nextWorkflowId, WorkflowStatus.FAILED);
              await updateSubWorkflowStatus(nextWorkflowId, 'failed', (loopError as Error).message);
            }
            break;
          }
        }

        logger.info('Continued execution after skip completed', { skippedWorkflowId: id });
      } catch (asyncError) {
        logger.error('Failed to continue after skip', asyncError as Error, { skippedWorkflowId: id });
      }
    })().catch((error) => {
      logger.error('Unhandled error in skip continuation', error as Error);
    });

    return;
  } catch (error) {
    logger.error('Failed to skip workflow', error as Error);
    return res.status(500).json({ error: 'Failed to skip workflow' });
  }
});

/**
 * GET /api/workflows/:id/resume-state
 * Get workflow resume state to check if workflow can be resumed
 */
router.get('/workflows/:id/resume-state', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    // Import getWorkflowResumeState dynamically
    const { getWorkflowResumeState } = await import('./workflow-state.js');
    const resumeState = await getWorkflowResumeState(id);

    if (!resumeState) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    return res.json(resumeState);
  } catch (error) {
    logger.error('Failed to get workflow resume state', error as Error);
    return res.status(500).json({ error: 'Failed to get resume state' });
  }
});

/**
 * GET /api/modules
 * List all discovered modules
 */
router.get('/modules', async (_req: Request, res: Response) => {
  try {
    const modules = await discoverModules();
    return res.json({ modules });
  } catch (error) {
    logger.error('Failed to list modules', error as Error);
    return res.status(500).json({ error: 'Failed to list modules' });
  }
});

/**
 * POST /api/modules/import
 * Import a module from a Git repository
 */
router.post('/modules/import', async (req: Request, res: Response) => {
  try {
    const { url, category, project, tags, autoInstall } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Git URL is required' });
    }

    const result = await importModule({
      url,
      category,
      project,
      tags,
      autoInstall: autoInstall === true,
    });

    if (result.success) {
      return res.json({
        success: true,
        moduleName: result.moduleName,
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error: any) {
    logger.error('Failed to import module', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to import module',
    });
  }
});

/**
 * GET /api/modules/:name
 * Get detailed information about a specific module
 */
router.get('/modules/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const module = await getModuleInfo(name);

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    return res.json({ module });
  } catch (error) {
    logger.error('Failed to get module info', error as Error);
    return res.status(500).json({ error: 'Failed to get module info' });
  }
});

/**
 * GET /api/modules/:name/stats
 * Get statistics for a module
 */
router.get('/modules/:name/stats', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const stats = await getModuleStats(name);
    return res.json({ stats });
  } catch (error) {
    logger.error('Failed to get module stats', error as Error);
    return res.status(500).json({ error: 'Failed to get module stats' });
  }
});

/**
 * GET /api/modules/:name/commits
 * Get commit history for a module
 */
router.get('/modules/:name/commits', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const commits = await getModuleCommitHistory(name, limit);
    return res.json({ commits });
  } catch (error) {
    logger.error('Failed to get module commits', error as Error);
    return res.status(500).json({ error: 'Failed to get module commits' });
  }
});

/**
 * GET /api/modules/:name/prompts
 * List all prompts for a module
 */
router.get('/modules/:name/prompts', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const prompts = await getModulePrompts(name);
    return res.json({ prompts });
  } catch (error) {
    logger.error('Failed to get module prompts', error as Error);
    return res.status(500).json({ error: 'Failed to get module prompts' });
  }
});

/**
 * GET /api/modules/:name/prompts/:promptName
 * Get content of a specific prompt
 */
router.get('/modules/:name/prompts/:promptName', async (req: Request, res: Response) => {
  try {
    const { name, promptName } = req.params;
    const content = await getModulePromptContent(name, promptName);

    if (!content) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    return res.json({ name: promptName, content });
  } catch (error) {
    logger.error('Failed to get prompt content', error as Error);
    return res.status(500).json({ error: 'Failed to get prompt content' });
  }
});

/**
 * PUT /api/modules/:name/prompts/:promptName
 * Update a module prompt
 */
router.put('/modules/:name/prompts/:promptName', async (req: Request, res: Response) => {
  try {
    const { name, promptName } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const success = await updateModulePrompt(name, promptName, content);

    if (!success) {
      return res.status(500).json({ error: 'Failed to update prompt' });
    }

    logger.info('Module prompt updated', { module: name, prompt: promptName });

    return res.json({ success: true, name: promptName });
  } catch (error) {
    logger.error('Failed to update module prompt', error as Error);
    return res.status(500).json({ error: 'Failed to update module prompt' });
  }
});

// ============================================================================
// Module Deployment Routes
// ============================================================================

/**
 * POST /api/modules/:name/install
 * Install dependencies for a module
 */
router.post('/modules/:name/install', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const operationId = await deploymentManager.installModule(name);
    logger.info('Module installation started', { module: name, operationId });
    return res.json({ operationId, message: 'Installation started' });
  } catch (error) {
    logger.error('Failed to start module installation', error as Error);
    return res.status(500).json({ error: 'Failed to start installation' });
  }
});

/**
 * POST /api/modules/:name/build
 * Build a module
 */
router.post('/modules/:name/build', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const operationId = await deploymentManager.buildModule(name);
    logger.info('Module build started', { module: name, operationId });
    return res.json({ operationId, message: 'Build started' });
  } catch (error) {
    logger.error('Failed to start module build', error as Error);
    return res.status(500).json({ error: 'Failed to start build' });
  }
});

/**
 * POST /api/modules/:name/test
 * Run tests for a module
 */
router.post('/modules/:name/test', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const operationId = await deploymentManager.testModule(name);
    logger.info('Module tests started', { module: name, operationId });
    return res.json({ operationId, message: 'Tests started' });
  } catch (error) {
    logger.error('Failed to start module tests', error as Error);
    return res.status(500).json({ error: 'Failed to start tests' });
  }
});

/**
 * POST /api/modules/:name/start
 * Start a module server
 */
router.post('/modules/:name/start', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const operationId = await deploymentManager.startModule(name);
    logger.info('Module server started', { module: name, operationId });
    return res.json({ operationId, message: 'Server started' });
  } catch (error) {
    logger.error('Failed to start module server', error as Error);
    return res.status(500).json({ error: 'Failed to start server' });
  }
});

/**
 * POST /api/modules/:name/stop
 * Stop a running module
 */
router.post('/modules/:name/stop', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const operationId = await deploymentManager.stopModule(name);
    logger.info('Module server stopped', { module: name, operationId });
    return res.json({ operationId, message: 'Server stopped' });
  } catch (error) {
    logger.error('Failed to stop module server', error as Error);
    return res.status(500).json({ error: 'Failed to stop server' });
  }
});

/**
 * GET /api/modules/:name/status
 * Check if a module is running
 */
router.get('/modules/:name/status', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const isRunning = deploymentManager.isModuleRunning(name);
    return res.json({ moduleName: name, isRunning });
  } catch (error) {
    logger.error('Failed to check module status', error as Error);
    return res.status(500).json({ error: 'Failed to check status' });
  }
});

/**
 * GET /api/modules/:name/logs
 * Get recent console logs for a module (running or stopped)
 */
router.get('/modules/:name/logs', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const lines = parseInt(req.query.lines as string) || 100;
    const logs = await deploymentManager.getModuleLogs(name, lines);
    return res.json({ moduleName: name, logs, count: logs.length });
  } catch (error) {
    logger.error('Failed to get module logs', error as Error);
    return res.status(500).json({ error: 'Failed to get logs' });
  }
});

/**
 * GET /api/modules/:name/auto-load
 * Get auto-load setting for a module
 */
router.get('/modules/:name/auto-load', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const result = await query(
      'SELECT auto_load FROM module_settings WHERE module_name = ?',
      [name]
    );

    const autoLoad = result.length > 0 ? result[0].auto_load : false;
    return res.json({ moduleName: name, autoLoad: Boolean(autoLoad) });
  } catch (error) {
    logger.error('Failed to get auto-load setting', error as Error);
    return res.status(500).json({ error: 'Failed to get auto-load setting' });
  }
});

/**
 * PUT /api/modules/:name/auto-load
 * Update auto-load setting for a module
 */
router.put('/modules/:name/auto-load', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { autoLoad } = req.body;

    if (typeof autoLoad !== 'boolean') {
      return res.status(400).json({ error: 'autoLoad must be a boolean' });
    }

    // Insert or update the setting
    await query(
      `INSERT INTO module_settings (module_name, auto_load)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE auto_load = ?, updated_at = CURRENT_TIMESTAMP`,
      [name, autoLoad, autoLoad]
    );

    logger.info('Module auto-load setting updated', { module: name, autoLoad });
    return res.json({
      moduleName: name,
      autoLoad,
      message: `Auto-load ${autoLoad ? 'enabled' : 'disabled'}`
    });
  } catch (error) {
    logger.error('Failed to update auto-load setting', error as Error);
    return res.status(500).json({ error: 'Failed to update auto-load setting' });
  }
});

/**
 * GET /api/deployments
 * Get all deployment operations
 */
router.get('/deployments', async (_req: Request, res: Response) => {
  try {
    const operations = deploymentManager.getAllOperations();
    return res.json({ operations });
  } catch (error) {
    logger.error('Failed to fetch deployment operations', error as Error);
    return res.status(500).json({ error: 'Failed to fetch operations' });
  }
});

/**
 * GET /api/deployments/:operationId
 * Get a specific deployment operation
 */
router.get('/deployments/:operationId', async (req: Request, res: Response) => {
  try {
    const { operationId } = req.params;
    const operation = deploymentManager.getOperation(operationId);

    if (!operation) {
      return res.status(404).json({ error: 'Operation not found' });
    }

    return res.json({ operation });
  } catch (error) {
    logger.error('Failed to fetch deployment operation', error as Error);
    return res.status(500).json({ error: 'Failed to fetch operation' });
  }
});

/**
 * GET /api/modules/:name/deployments
 * Get all deployment operations for a specific module
 */
router.get('/modules/:name/deployments', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const operations = deploymentManager.getModuleOperations(name);
    return res.json({ operations });
  } catch (error) {
    logger.error('Failed to fetch module deployments', error as Error);
    return res.status(500).json({ error: 'Failed to fetch deployments' });
  }
});

/**
 * GET /api/modules/:name/scripts
 * Get available scripts from package.json
 */
router.get('/modules/:name/scripts', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const modulePath = path.join(process.cwd(), '..', 'modules', name);
    const packageJsonPath = path.join(modulePath, 'package.json');

    try {
      const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageContent);

      const scripts = packageJson.scripts || {};

      return res.json({
        success: true,
        moduleName: name,
        scripts,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return res.status(404).json({
          success: false,
          error: 'package.json not found',
          message: `Module ${name} does not have a package.json file`,
        });
      }
      throw error;
    }
  } catch (error) {
    logger.error('Failed to get module scripts', error as Error);
    return res.status(500).json({ error: 'Failed to get module scripts' });
  }
});

/**
 * POST /api/modules/:name/run-script
 * Run a script from package.json or built-in npm commands
 */
router.post('/modules/:name/run-script', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { scriptName } = req.body;

    if (!scriptName || typeof scriptName !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing scriptName',
        message: 'scriptName is required in the request body',
      });
    }

    // Built-in npm commands that don't need to be in package.json
    const builtInCommands = ['install', 'ci', 'update', 'outdated', 'prune'];
    const isBuiltIn = builtInCommands.includes(scriptName);

    // Verify the module has package.json
    const modulePath = path.join(process.cwd(), '..', 'modules', name);
    const packageJsonPath = path.join(modulePath, 'package.json');

    try {
      const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageContent);

      // For non-built-in commands, verify the script exists in package.json
      if (!isBuiltIn && (!packageJson.scripts || !packageJson.scripts[scriptName])) {
        return res.status(404).json({
          success: false,
          error: 'Script not found',
          message: `Script "${scriptName}" not found in package.json`,
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return res.status(404).json({
          success: false,
          error: 'package.json not found',
          message: `Module ${name} does not have a package.json file`,
        });
      }
      throw error;
    }

    // Run the script using deployment manager
    const operationId = await deploymentManager.runPackageScript(name, scriptName);
    logger.info('Module script started', { module: name, script: scriptName, operationId });

    return res.json({
      success: true,
      operationId,
      message: `Script "${scriptName}" started`,
    });
  } catch (error) {
    logger.error('Failed to run module script', error as Error);
    return res.status(500).json({ error: 'Failed to run script' });
  }
});

// ============================================================================
// System Control Routes
// ============================================================================

/**
 * GET /api/system/branches
 * List all available git branches (local and remote)
 */
router.get('/system/branches', async (_req: Request, res: Response) => {
  try {
    const { listBranches, getCurrentBranch } = await import('./utils/branch-switcher.js');
    const branches = await listBranches();
    const currentBranch = await getCurrentBranch();

    return res.json({
      success: true,
      branches, // Now returns BranchInfo[] with isLocal, isRemote, isCurrent flags
      currentBranch,
    });
  } catch (error) {
    logger.error('Failed to list branches', error as Error);
    return res.status(500).json({ error: 'Failed to list branches' });
  }
});

/**
 * POST /api/system/switch-branch
 * Switch git branch with automatic rebuild and failsafe rollback
 */
router.post('/system/switch-branch', async (req: Request, res: Response): Promise<void> => {
  try {
    const { branch } = req.body;

    if (!branch || typeof branch !== 'string') {
      res.status(400).json({ error: 'Branch name is required' });
      return;
    }

    logger.info('Branch switch requested', { branch });

    const { switchBranchWithRebuild } = await import('./utils/branch-switcher.js');
    const result = await switchBranchWithRebuild(branch);

    if (result.success) {
      res.json(result);
      return;
    } else {
      res.status(400).json(result);
      return;
    }
  } catch (error) {
    logger.error('Failed to switch branch', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to switch branch',
      message: (error as Error).message,
    });
    return;
  }
});

/**
 * POST /api/system/rebuild-restart
 * Rebuild and restart the entire AIDeveloper application
 */
router.post('/system/rebuild-restart', async (_req: Request, res: Response): Promise<void> => {
  try {
    logger.info('Rebuild and restart triggered via API');

    // Return success immediately - the restart will happen asynchronously
    res.json({
      success: true,
      message: 'Rebuild and restart initiated. The server will restart in a few seconds.'
    });

    // Execute rebuild and restart asynchronously
    setTimeout(async (): Promise<void> => {
      try {
        const { spawn } = await import('child_process');
        const path = await import('path');

        // Get the script path
        const scriptPath = path.join(process.cwd(), 'scripts', 'rebuild-restart.sh');

        // Create a detached process that will survive this server shutdown
        const restartProcess = spawn('bash', [scriptPath], {
          detached: true,
          stdio: 'ignore',
          cwd: process.cwd()
        });

        restartProcess.unref();

        logger.info('Restart script launched, shutting down current server');

        // Exit this process to allow restart
        setTimeout(() => {
          process.exit(0);
        }, 1000);

      } catch (error) {
        logger.error('Failed to execute rebuild and restart', error as Error);
      }
    }, 500);

  } catch (error) {
    logger.error('Failed to initiate rebuild and restart', error as Error);
    res.status(500).json({ error: 'Failed to initiate rebuild and restart' });
    return;
  }
});

// ============================================================================
// Auto-Fix Routes
// ============================================================================

/**
 * GET /api/auto-fix/config
 * Get current auto-fix configuration
 */
router.get('/auto-fix/config', async (_req: Request, res: Response) => {
  try {
    const { autoFixManager } = await import('./utils/auto-fix-manager.js');
    const config = autoFixManager.getConfig();
    return res.json({ config });
  } catch (error) {
    logger.error('Failed to get auto-fix config', error as Error);
    return res.status(500).json({ error: 'Failed to get auto-fix config' });
  }
});

/**
 * PUT /api/auto-fix/config
 * Update auto-fix configuration
 */
router.put('/auto-fix/config', async (req: Request, res: Response) => {
  try {
    const { autoFixManager } = await import('./utils/auto-fix-manager.js');
    await autoFixManager.updateConfig(req.body);
    const config = autoFixManager.getConfig();
    logger.info('Auto-fix config updated', config);
    return res.json({ config, success: true });
  } catch (error) {
    logger.error('Failed to update auto-fix config', error as Error);
    return res.status(500).json({ error: 'Failed to update auto-fix config' });
  }
});

/**
 * POST /api/workflows/:id/auto-fix
 * Manually trigger auto-fix for a specific workflow
 */
router.post('/workflows/:id/auto-fix', async (req: Request, res: Response) => {
  try {
    const workflowId = parseInt(req.params.id);

    const { autoFixManager } = await import('./utils/auto-fix-manager.js');

    logger.info('Manual auto-fix triggered', { workflowId });

    // Trigger auto-fix asynchronously
    autoFixManager.triggerAutoFix(workflowId).catch((error) => {
      logger.error('Auto-fix failed', error as Error, { workflowId });
    });

    return res.json({
      success: true,
      message: 'Auto-fix triggered',
      workflowId,
    });
  } catch (error) {
    logger.error('Failed to trigger auto-fix', error as Error);
    return res.status(500).json({ error: 'Failed to trigger auto-fix' });
  }
});

/**
 * GET /api/workflows/:id/auto-fix/status
 * Get auto-fix status for a workflow
 */
router.get('/workflows/:id/auto-fix/status', async (req: Request, res: Response) => {
  try {
    const workflowId = parseInt(req.params.id);

    const { autoFixManager } = await import('./utils/auto-fix-manager.js');
    const attempts = autoFixManager.getAutoFixStatus(workflowId);

    return res.json({
      workflowId,
      attempts,
      totalAttempts: attempts.length,
    });
  } catch (error) {
    logger.error('Failed to get auto-fix status', error as Error);
    return res.status(500).json({ error: 'Failed to get auto-fix status' });
  }
});

/**
 * GET /api/auto-fix/active
 * Get all active auto-fix attempts
 */
router.get('/auto-fix/active', async (_req: Request, res: Response) => {
  try {
    const { autoFixManager } = await import('./utils/auto-fix-manager.js');
    const activeAttempts = autoFixManager.getActiveAttempts();

    return res.json({
      count: activeAttempts.length,
      attempts: activeAttempts
    });
  } catch (error) {
    logger.error('Failed to get active auto-fixes', error as Error);
    return res.status(500).json({ error: 'Failed to get active auto-fixes' });
  }
});

/**
 * GET /api/auto-fix/history
 * Get auto-fix history with optional limit
 */
router.get('/auto-fix/history', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const { autoFixManager } = await import('./utils/auto-fix-manager.js');
    const attempts = autoFixManager.getAllAttempts(limit);

    return res.json({
      count: attempts.length,
      attempts
    });
  } catch (error) {
    logger.error('Failed to get auto-fix history', error as Error);
    return res.status(500).json({ error: 'Failed to get auto-fix history' });
  }
});

/**
 * GET /api/auto-fix/summary
 * Get auto-fix summary statistics
 */
router.get('/auto-fix/summary', async (_req: Request, res: Response) => {
  try {
    const { autoFixManager } = await import('./utils/auto-fix-manager.js');
    const summary = autoFixManager.getSummary();

    return res.json(summary);
  } catch (error) {
    logger.error('Failed to get auto-fix summary', error as Error);
    return res.status(500).json({ error: 'Failed to get auto-fix summary' });
  }
});

/**
 * GET /api/auto-fix/:attemptId
 * Get specific auto-fix attempt details
 */
router.get('/auto-fix/:attemptId', async (req: Request, res: Response) => {
  try {
    const attemptId = req.params.attemptId;

    const { autoFixManager } = await import('./utils/auto-fix-manager.js');
    const attempt = autoFixManager.getAttempt(attemptId);

    if (!attempt) {
      return res.status(404).json({ error: 'Auto-fix attempt not found' });
    }

    return res.json({
      attempt
    });
  } catch (error) {
    logger.error('Failed to get auto-fix attempt', error as Error);
    return res.status(500).json({ error: 'Failed to get auto-fix attempt' });
  }
});

export default router;
