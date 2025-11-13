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
} from './utils/module-manager.js';
import { deploymentManager } from './utils/deployment-manager.js';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

/**
 * GET /api/workflows
 * List all workflows with pagination and filtering
 */
router.get('/workflows', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as WorkflowStatus | undefined;

    // Build query without using parameters for LIMIT/OFFSET (MySQL compatibility)
    let sql = 'SELECT * FROM workflows';
    const params: any[] = [];

    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const workflows = await query(sql, params);

    // Get count
    const countSql = status
      ? 'SELECT COUNT(*) as total FROM workflows WHERE status = ?'
      : 'SELECT COUNT(*) as total FROM workflows';
    const countParams = status ? [status] : [];
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
 * Get workflow details with all related data
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

    // Get agent executions
    const agents = await query<any>(
      'SELECT * FROM agent_executions WHERE workflow_id = ? ORDER BY started_at ASC',
      [id]
    );

    // Get artifacts
    const artifacts = await query<any>(
      'SELECT * FROM artifacts WHERE workflow_id = ? ORDER BY created_at ASC',
      [id]
    );

    return res.json({
      workflow,
      agents,
      artifacts,
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
    const { workflowType, taskDescription } = req.body;

    if (!workflowType || !taskDescription) {
      return res.status(400).json({
        error: 'workflowType and taskDescription are required',
      });
    }

    // Forward to webhook handler
    const response = await fetch('http://localhost:3000/webhooks/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowType, taskDescription }),
    });

    const data = await response.json();

    return res.json(data);
  } catch (error) {
    logger.error('Failed to submit workflow', error as Error);
    return res.status(500).json({ error: 'Failed to submit workflow' });
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
 * Get recent console logs for a running module
 */
router.get('/modules/:name/logs', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const lines = parseInt(req.query.lines as string) || 100;
    const logs = deploymentManager.getModuleLogs(name, lines);
    return res.json({ moduleName: name, logs, count: logs.length });
  } catch (error) {
    logger.error('Failed to get module logs', error as Error);
    return res.status(500).json({ error: 'Failed to get logs' });
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

// ============================================================================
// System Control Routes
// ============================================================================

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

        // Create a detached process that will survive this server shutdown
        const restartScript = spawn('bash', ['-c', `
          echo "Starting rebuild and restart process..."

          # Build backend
          echo "Building backend..."
          npm run build

          # Build frontend
          echo "Building frontend..."
          npm run build:frontend

          # Find and kill the current server process
          echo "Stopping server..."
          pkill -f "node.*dist/server.js" || true
          pkill -f "tsx.*src/server.ts" || true

          # Wait a moment for processes to terminate
          sleep 2

          # Start the server again
          echo "Starting server..."
          npm start > /dev/null 2>&1 &

          echo "Rebuild and restart complete!"
        `], {
          detached: true,
          stdio: 'ignore',
          cwd: process.cwd()
        });

        restartScript.unref();

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

export default router;
