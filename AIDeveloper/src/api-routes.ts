/**
 * API Routes for Frontend Dashboard
 * REST API endpoints for the web dashboard
 */

import { Router, Request, Response } from 'express';
import { query } from './database.js';
import { WorkflowStatus, AgentStatus, WorkflowOutputMode, WorkflowType } from './types.js';
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
  getModulesPath,
  readModuleManifest,
} from './utils/module-manager.js';
import { deploymentManager } from './utils/deployment-manager.js';
import modulePluginsRouter from './api/module-plugins.js';
import {
  createWorkflowDirectory,
  getWorkflowRepoPath,
  saveWorkflowArtifact,
  updateWorkflowStatus,
  getWorkflowDirectory
} from './utils/workflow-directory-manager.js';
import { getGit } from './utils/git-helper.js';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Intelligently determine workflow output mode based on task description and type
 * @param taskDescription - The workflow task description
 * @param workflowType - The workflow type
 * @returns The appropriate output mode
 */
function determineOutputMode(taskDescription: string, workflowType: string): WorkflowOutputMode {
  const lowerTask = taskDescription.toLowerCase();

  // Keywords that suggest standalone documentation (download only)
  const standaloneDocKeywords = [
    'explain what',
    'explain how',
    'document what',
    'document how',
    'describe what',
    'describe how',
    'what does',
    'how does',
    'generate documentation for',
    'create documentation for',
    'write documentation about',
  ];

  // Keywords that suggest project integration (PR)
  const integrationKeywords = [
    'add documentation to',
    'update documentation in',
    'add readme',
    'update readme',
    'add docs to',
    'missing documentation',
    'needs documentation',
    'should be documented',
    'document the code',
    'add comments',
  ];

  // Check for integration keywords first (higher priority)
  const hasIntegrationKeywords = integrationKeywords.some(keyword => lowerTask.includes(keyword));
  if (hasIntegrationKeywords) {
    return WorkflowOutputMode.PR;
  }

  // Check for standalone documentation keywords
  const hasStandaloneKeywords = standaloneDocKeywords.some(keyword => lowerTask.includes(keyword));
  if (hasStandaloneKeywords && workflowType === WorkflowType.DOCUMENTATION) {
    return WorkflowOutputMode.DOWNLOAD;
  }

  // Check if it's a documentation workflow without clear integration intent
  if (workflowType === WorkflowType.DOCUMENTATION) {
    // If no clear integration keywords, provide both options
    return WorkflowOutputMode.BOTH;
  }

  // Default to PR for code changes (feature, bugfix, refactor)
  return WorkflowOutputMode.PR;
}

// ============================================================================
// Module Plugin Routes (MUST BE BEFORE PROXY ROUTES)
// ============================================================================

router.use('/modules', modulePluginsRouter);

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
      'SELECT * FROM workflow_artifacts WHERE workflow_id = ? ORDER BY created_at ASC',
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
 * GET /api/workflows/:id/artifacts/:artifactId/download
 * Download a specific artifact as a file
 */
router.get('/workflows/:id/artifacts/:artifactId/download', async (req: Request, res: Response) => {
  try {
    const workflowId = parseInt(req.params.id);
    const artifactId = parseInt(req.params.artifactId);

    // Get artifact from database
    const [artifact] = await query<any>(
      'SELECT * FROM workflow_artifacts WHERE id = ? AND workflow_id = ?',
      [artifactId, workflowId]
    );

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    // Determine filename
    const filename = artifact.file_path || `${artifact.artifact_type}-${artifactId}.txt`;
    const extension = path.extname(filename) || '.txt';
    const basename = path.basename(filename, extension);

    // Set headers for file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${basename}${extension}"`);

    // Send content
    return res.send(artifact.content);
  } catch (error) {
    logger.error('Failed to download artifact', error as Error);
    return res.status(500).json({ error: 'Failed to download artifact' });
  }
});

/**
 * GET /api/workflows/:id/artifacts/download-all
 * Download all artifacts as a zip file
 */
router.get('/workflows/:id/artifacts/download-all', async (req: Request, res: Response): Promise<void> => {
  try {
    const workflowId = parseInt(req.params.id);

    // Get workflow info
    const [workflow] = await query<any>('SELECT * FROM workflows WHERE id = ?', [workflowId]);
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    // Get all artifacts
    const artifacts = await query<any>(
      'SELECT * FROM workflow_artifacts WHERE workflow_id = ? ORDER BY created_at ASC',
      [workflowId]
    );

    if (artifacts.length === 0) {
      res.status(404).json({ error: 'No artifacts found' });
      return;
    }

    // Create zip archive
    const archiver = (await import('archiver')).default;
    const archive = archiver('zip', { zlib: { level: 9 } });

    // Set headers
    const zipFilename = `workflow-${workflowId}-artifacts.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    // Pipe archive to response
    archive.pipe(res);

    // Add each artifact to archive
    for (const artifact of artifacts) {
      const filename = artifact.file_path || `${artifact.artifact_type}-${artifact.id}.txt`;
      archive.append(artifact.content, { name: filename });
    }

    // Finalize archive
    await archive.finalize();

    logger.info('Downloaded all artifacts', { workflowId, count: artifacts.length });
  } catch (error) {
    logger.error('Failed to download all artifacts', error as Error);
    res.status(500).json({ error: 'Failed to download all artifacts' });
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
 * POST /api/workflows/new-module
 * Create a completely new module with GitHub repo and scaffolding
 */
router.post('/workflows/new-module', async (req: Request, res: Response) => {
  try {
    const {
      moduleName,
      description,
      moduleType,  // 'service' or 'library'
      port,
      hasFrontend,
      frontendPort,
      relatedModules,
      taskDescription,
    } = req.body;

    if (!moduleName || !description) {
      return res.status(400).json({
        error: 'moduleName and description are required',
      });
    }

    // Validate module name (PascalCase, no special chars)
    if (!/^[A-Z][a-zA-Z0-9]*$/.test(moduleName)) {
      return res.status(400).json({
        error: 'Module name must be PascalCase (e.g., DataProcessor, AIHelper)',
      });
    }

    logger.info('Creating new module workflow', {
      moduleName,
      description: description.substring(0, 100),
      moduleType,
    });

    // Import module creator
    const { createNewModule } = await import('./utils/module-creator.js');

    // Create the new module
    const result = await createNewModule({
      name: moduleName,
      description,
      type: moduleType || 'library',
      port: port ? parseInt(port) : undefined,
      hasFrontend: hasFrontend || false,
      frontendPort: frontendPort ? parseInt(frontendPort) : undefined,
      relatedModules: relatedModules || [],
    });

    if (!result.success) {
      return res.status(500).json({
        error: result.error || 'Failed to create module',
      });
    }

    // Create a workflow record for tracking
    const workflowResult = await query<any>(
      `INSERT INTO workflows (workflow_type, output_mode, target_module, status, payload, created_at, updated_at, completed_at)
       VALUES (?, 'pr', ?, 'completed', ?, NOW(), NOW(), NOW())`,
      [
        'new_module',
        moduleName,
        JSON.stringify({
          source: 'custom',
          customData: {
            moduleName,
            description,
            moduleType: moduleType || 'library',
            port,
            hasFrontend,
            frontendPort,
            relatedModules,
            taskDescription: taskDescription || `Create new module: ${moduleName}`,
            repoUrl: result.repoUrl,
            modulePath: result.modulePath,
          },
          targetModule: moduleName,
        }),
      ]
    );

    const workflowId = workflowResult.insertId;

    // Create artifacts for the new module workflow
    try {
      // Create a summary artifact
      const summaryContent = `# New Module Created: ${moduleName}

## Module Details
- **Name**: ${moduleName}
- **Type**: ${moduleType || 'library'}
- **Description**: ${description}
${port ? `- **Port**: ${port}` : ''}
${hasFrontend ? `- **Frontend Port**: ${frontendPort || 5176}` : ''}
${relatedModules?.length ? `- **Related Modules**: ${relatedModules.join(', ')}` : ''}

## Locations
- **Module Path**: ${result.modulePath}
- **Workflow Path**: ${result.workflowPath}
- **GitHub Repository**: ${result.repoUrl || 'N/A'}

## Generated Files
- \`package.json\` - Node.js package configuration
- \`tsconfig.json\` - TypeScript configuration
- \`module.json\` - Module metadata for AIDeveloper
- \`README.md\` - Documentation
- \`src/server.ts\` - Main entry point${moduleType === 'service' ? ' (Express server)' : ''}
${hasFrontend ? `- \`frontend/\` - React frontend scaffold with Vite + Tailwind` : ''}

## Next Steps
1. Navigate to the module: \`cd ${result.modulePath}\`
2. Install dependencies: \`npm install\`${hasFrontend ? `\n3. Install frontend dependencies: \`cd frontend && npm install\`` : ''}
3. Start development: \`npm run dev\`

---
*Generated by AIDeveloper New Module Creator*
`;

      await query(
        `INSERT INTO workflow_artifacts (workflow_id, artifact_type, file_path, content, created_at)
         VALUES (?, 'documentation', 'MODULE_CREATION_SUMMARY.md', ?, NOW())`,
        [workflowId, summaryContent]
      );

      logger.info('Created artifact for new module workflow', { workflowId, moduleName });
    } catch (artifactError) {
      logger.warn('Failed to create artifact for new module', { error: (artifactError as Error).message });
    }

    // If there's additional task description, create a separate follow-up feature workflow
    let followUpWorkflowId: number | undefined;
    if (taskDescription && taskDescription.trim()) {
      try {
        // Create a new workflow record for the follow-up task
        const followUpResult = await query<any>(
          `INSERT INTO workflows (workflow_type, output_mode, target_module, status, payload, created_at, updated_at)
           VALUES ('feature', 'pr', ?, 'pending', ?, NOW(), NOW())`,
          [
            moduleName,
            JSON.stringify({
              source: 'manual',
              customData: {
                taskDescription,
                parentWorkflowId: workflowId,
              },
              targetModule: moduleName,
            }),
          ]
        );
        followUpWorkflowId = followUpResult.insertId;

        // Execute the follow-up workflow asynchronously
        executeWorkflowAsync(
          followUpWorkflowId!,
          'feature',
          moduleName,
          taskDescription
        ).catch((error) => {
          logger.error('Follow-up workflow failed', error as Error);
        });

        logger.info('Follow-up workflow queued', { followUpWorkflowId, moduleName });
      } catch (followUpError) {
        logger.error('Failed to create follow-up workflow', followUpError as Error);
        // Don't fail the whole operation if follow-up fails
      }
    }

    logger.info('New module created successfully', {
      moduleName,
      workflowId,
      repoUrl: result.repoUrl,
      followUpWorkflowId,
    });

    return res.json({
      success: true,
      workflowId,
      followUpWorkflowId,
      moduleName,
      modulePath: result.modulePath,
      workflowPath: result.workflowPath,
      repoUrl: result.repoUrl,
      message: `Module ${moduleName} created successfully${followUpWorkflowId ? `. Follow-up workflow #${followUpWorkflowId} queued.` : ''}`,
    });
  } catch (error) {
    logger.error('Failed to create new module', error as Error);
    return res.status(500).json({
      error: 'Failed to create new module',
      message: (error as Error).message,
    });
  }
});

/**
 * POST /api/workflows/manual
 * Submit manual workflow and execute it via WorkflowOrchestrator
 */
router.post('/workflows/manual', async (req: Request, res: Response) => {
  try {
    const { workflowType, targetModule, targetModules, taskDescription } = req.body;

    if (!workflowType || !taskDescription) {
      logger.info('Workflow validation failed: missing required fields', {
        workflowType,
        taskDescription: !!taskDescription,
      });
      return res.status(400).json({
        error: 'workflowType and taskDescription are required',
      });
    }

    // Support both single targetModule (backwards compatibility) and targetModules array
    let modules: string[] = [];
    if (targetModules && Array.isArray(targetModules) && targetModules.length > 0) {
      modules = targetModules;
    } else if (targetModule) {
      modules = [targetModule];
    } else {
      logger.info('Workflow validation failed: missing targetModule(s)');
      return res.status(400).json({
        error: 'targetModule or targetModules is required',
      });
    }

    // Primary module is the first one (used for PR base branch decisions)
    const primaryModule = modules[0];

    // Intelligently determine output mode based on task description
    const outputMode = determineOutputMode(taskDescription, workflowType);

    logger.info('Creating manual workflow', {
      workflowType,
      targetModules: modules,
      primaryModule,
      taskDescription: taskDescription.substring(0, 100),
      outputMode,
    });

    // Create workflow in database (target_module stores primary for backwards compatibility)
    const result = await query<any>(
      `INSERT INTO workflows (workflow_type, output_mode, target_module, status, payload, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, NOW(), NOW())`,
      [
        workflowType,
        outputMode,
        primaryModule,
        JSON.stringify({
          source: 'custom',
          customData: {
            targetModule: primaryModule,
            targetModules: modules,
            workflowType,
            taskDescription,
            outputMode,
          },
          targetModule: primaryModule,
          targetModules: modules,
        }),
      ]
    );

    const workflowId = result.insertId;

    // Insert into workflow_modules junction table for multi-module tracking
    for (let i = 0; i < modules.length; i++) {
      await query(
        `INSERT INTO workflow_modules (workflow_id, module_name, is_primary, created_at)
         VALUES (?, ?, ?, NOW())`,
        [workflowId, modules[i], i === 0]
      );
    }

    logger.info('Workflow created in database', { workflowId, workflowType, targetModules: modules });

    // Execute workflow asynchronously (don't wait for completion)
    executeWorkflowAsync(workflowId, workflowType, modules, taskDescription).catch(
      (error) => {
        logger.error('Async workflow execution failed', error as Error);
        logger.info('Async workflow execution details', {
          workflowId,
          errorMessage: error.message,
        });
      }
    );

    return res.json({
      success: true,
      workflowId,
      targetModules: modules,
      message: 'Workflow created and queued for execution',
    });
  } catch (error) {
    logger.error('Failed to submit workflow', error as Error);
    return res.status(500).json({
      error: 'Failed to submit workflow',
      message: (error as Error).message,
    });
  }
});

/**
 * Execute workflow asynchronously
 * @param targetModules - Array of modules this workflow targets (first is primary)
 */
async function executeWorkflowAsync(
  workflowId: number,
  workflowType: string,
  targetModules: string[],
  taskDescription: string
): Promise<void> {
  // Declare branchName outside try block so it's accessible in catch
  let branchName = '';
  let outputMode: WorkflowOutputMode = WorkflowOutputMode.PR;

  // Primary module is the first one (used for cloning and PR decisions)
  const primaryModule = targetModules[0];

  try {
    logger.info('Starting async workflow execution', { workflowId, workflowType, targetModules, primaryModule });

    // Get workflow output mode from database
    const [workflow] = await query<any>('SELECT output_mode FROM workflows WHERE id = ?', [workflowId]);
    if (workflow && workflow.output_mode) {
      outputMode = workflow.output_mode as WorkflowOutputMode;
    }

    // Update status to running
    await query('UPDATE workflows SET status = ?, updated_at = NOW() WHERE id = ?', [
      'running',
      workflowId,
    ]);

    // Generate branch name for this workflow
    const sanitizedTask = taskDescription
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .substring(0, 50)
      .replace(/-+$/, '');
    branchName = `workflow-${workflowType}-${workflowId}-${sanitizedTask}`;

    logger.info('Creating workflow directory and branch', {
      workflowId,
      branchName,
      workflowType,
      targetModules,
    });

    // Create workflow directory structure (clones the primary module's repo)
    // For multi-module workflows, additional modules are cloned as siblings
    const workflowDir = await createWorkflowDirectory(workflowId, branchName, workflowType as any, primaryModule, targetModules);
    const repoPath = getWorkflowRepoPath(workflowId, branchName);

    // Create and checkout new branch in the cloned repo
    const git = getGit(repoPath);
    await git.checkoutLocalBranch(branchName);

    logger.info('Workflow directory and branch created', {
      workflowDir,
      repoPath,
      branchName,
      targetModules,
    });

    // Import WorkflowOrchestrator module
    const { WorkflowOrchestrator } = await import(
      '../../modules/WorkflowOrchestrator/index.js'
    );

    const orchestrator = new WorkflowOrchestrator();

    // Working directory is always the cloned repo (which is the primary module)
    const workingDir = repoPath;

    logger.info('Executing WorkflowOrchestrator', {
      workflowId,
      workingDir,
      workflowType,
      targetModules,
    });

    // Execute the workflow with all target modules
    const output = await orchestrator.execute({
      workflowId,
      workflowType,
      targetModule: primaryModule,  // Backwards compatibility
      targetModules,                // New: all target modules
      taskDescription,
      branchName,
      workingDir,
    });

    // Update workflow status based on execution result
    const finalStatus = output.success ? 'completed' : 'failed';
    await query(
      'UPDATE workflows SET status = ?, completed_at = NOW(), updated_at = NOW() WHERE id = ?',
      [finalStatus, workflowId]
    );

    logger.info('Workflow execution completed', {
      workflowId,
      status: finalStatus,
      artifactsCount: output.artifacts.length,
    });

    // Store artifacts in database and save to filesystem
    for (const artifact of output.artifacts) {
      // Save to database
      await query(
        `INSERT INTO workflow_artifacts (workflow_id, artifact_type, content, file_path, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          workflowId,
          artifact.type,
          artifact.content,
          artifact.filePath || null,
          JSON.stringify(artifact.metadata || {}),
        ]
      );

      // Save to workflow artifacts directory
      try {
        const artifactFileName = artifact.filePath || `${artifact.type}-${Date.now()}.md`;
        await saveWorkflowArtifact(workflowId, branchName, artifactFileName, artifact.content);
        logger.info('Saved artifact to filesystem', { workflowId, artifactFileName });
      } catch (error) {
        logger.warn('Failed to save artifact to filesystem', {
          workflowId,
          error: (error as Error).message,
        });
      }
    }

    // Save execution summary to workflow logs
    try {
      const workflowDir = getWorkflowDirectory(workflowId, branchName);
      const executionLog = {
        workflowId,
        workflowType,
        targetModules,
        primaryModule,
        taskDescription,
        branchName,
        status: finalStatus,
        timestamp: new Date().toISOString(),
        artifacts: output.artifacts.map(a => ({
          type: a.type,
          filePath: a.filePath,
          contentLength: a.content.length,
        })),
        summary: output.summary,
      };
      await fs.writeFile(
        path.join(workflowDir, 'logs', `execution-${Date.now()}.json`),
        JSON.stringify(executionLog, null, 2)
      );
      logger.info('Saved execution log to filesystem', { workflowId });
    } catch (error) {
      logger.warn('Failed to save execution log', {
        workflowId,
        error: (error as Error).message,
      });
    }

    // Update workflow README with final status
    try {
      await updateWorkflowStatus(workflowId, branchName, finalStatus as any, output.summary);
      logger.info('Updated workflow README', { workflowId, status: finalStatus });
    } catch (error) {
      logger.warn('Failed to update workflow README', {
        workflowId,
        error: (error as Error).message,
      });
    }

    // If workflow completed successfully, push branch and create PR (based on output mode)
    if (finalStatus === 'completed' && (outputMode === WorkflowOutputMode.PR || outputMode === WorkflowOutputMode.BOTH)) {
      try {
        logger.info('Pushing branch to remote and creating PR', { workflowId, branchName, outputMode });

        // Push branch to remote
        const git = getGit(repoPath);
        await git.push('origin', branchName, ['--set-upstream']);
        logger.info('Branch pushed to remote', { workflowId, branchName });

        // Determine base branch for PR (based on primary module)
        const baseBranch = primaryModule === 'AIDeveloper' ? 'develop' : 'master';

        // Create PR using GitHub CLI
        const prTitle = `[Workflow #${workflowId}] ${workflowType}: ${taskDescription.substring(0, 100)}`;
        const prBodyContent = `## Workflow Summary

**Workflow ID**: #${workflowId}
**Type**: ${workflowType}
**Target Modules**: ${targetModules.join(', ')}
**Branch**: \`${branchName}\`

${output.summary || 'No summary provided'}

## Artifacts Generated

${output.artifacts.map(a => `- **${a.type}**: ${a.filePath || 'N/A'}`).join('\n')}

---
🤖 This PR was automatically generated by workflow execution.`;

        // Write PR body to temp file to handle multi-line content safely
        const prBodyFile = path.join(workflowDir, 'logs', 'pr-body.md');
        await fs.writeFile(prBodyFile, prBodyContent);

        const { execSync } = await import('child_process');
        const prResult = execSync(
          `gh pr create --title "${prTitle}" --body-file "${prBodyFile}" --base "${baseBranch}" --head "${branchName}"`,
          {
            cwd: repoPath,
            encoding: 'utf-8',
            env: process.env,
          }
        );

        const prUrl = prResult.trim();
        logger.info('Pull request created', { workflowId, prUrl });

        // Store PR URL in database
        await query(
          'UPDATE workflows SET pr_url = ?, updated_at = NOW() WHERE id = ?',
          [prUrl, workflowId]
        );

        logger.info('Workflow branch pushed and PR created successfully', { workflowId, prUrl });
      } catch (error) {
        logger.error('Failed to push branch or create PR', error as Error, { workflowId });
        // Don't fail the workflow if PR creation fails
      }
    }
  } catch (error) {
    logger.error('Workflow execution failed', error as Error);
    logger.info('Workflow execution error details', { workflowId });

    // Save error log to workflow logs directory if branchName was defined
    try {
      if (branchName) {
        const workflowDir = getWorkflowDirectory(workflowId, branchName);
        const errorLog = {
          workflowId,
          workflowType,
          targetModules,
          primaryModule,
          taskDescription,
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: {
            message: (error as Error).message,
            stack: (error as Error).stack,
          },
        };
        await fs.writeFile(
          path.join(workflowDir, 'logs', `error-${Date.now()}.json`),
          JSON.stringify(errorLog, null, 2)
        );

        // Update workflow README with failure status
        await updateWorkflowStatus(
          workflowId,
          branchName,
          'failed',
          `Workflow failed: ${(error as Error).message}`
        );
      }
    } catch (logError) {
      logger.warn('Failed to save error log to filesystem', {
        workflowId,
        error: (logError as Error).message,
      });
    }

    // Update workflow status to failed
    await query(
      `UPDATE workflows SET status = 'failed', completed_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [workflowId]
    );

    // Log the error in agent_executions table for visibility
    await query(
      `INSERT INTO agent_executions (workflow_id, agent_type, status, error_message)
       VALUES (?, 'orchestrator', 'failed', ?)`,
      [workflowId, (error as Error).message]
    );
  }
}

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
 * POST /api/workflows/:id/resume
 * DEPRECATED: Workflow functionality moved to WorkflowOrchestrator module
 * Resume a failed/cancelled workflow from its last checkpoint
 * Optional body: { fromAgentIndex?: number } to resume from specific agent
 */
router.post('/workflows/:id/resume', async (_req: Request, res: Response) => {
  return res.status(501).json({
    success: false,
    error: 'Workflow functionality has been moved to the WorkflowOrchestrator module',
    message: 'Please use the WorkflowOrchestrator module for workflow management',
  });
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

    // Check if module has a manifest
    const manifest = await readModuleManifest(name);
    const hasManifest = manifest !== null;

    return res.json({ module, hasManifest });
  } catch (error) {
    logger.error('Failed to get module info', error as Error);
    return res.status(500).json({ error: 'Failed to get module info' });
  }
});

/**
 * POST /api/modules/:name/generate-manifest
 * Trigger the ModuleImportAgent to generate a module.json for a module
 */
router.post('/modules/:name/generate-manifest', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const module = await getModuleInfo(name);

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    // Dynamically import and execute the ModuleImportAgent
    const modulePath = `file://${getModulesPath()}/ModuleImportAgent/index.js`;
    const { default: ModuleImportAgent } = await import(modulePath);

    const agent = new ModuleImportAgent();
    const result = await agent.execute({
      modulePath: module.path,
      moduleName: name,
      workingDir: module.path,
    });

    if (result.success) {
      return res.json({
        success: true,
        message: result.message,
        artifacts: result.artifacts,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error || result.message,
      });
    }
  } catch (error: any) {
    logger.error('Failed to generate module manifest', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate module manifest',
    });
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
 * POST /api/modules/:name/typecheck
 * Run type checking for a module
 */
router.post('/modules/:name/typecheck', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const operationId = await deploymentManager.typecheckModule(name);
    logger.info('Module type check started', { module: name, operationId });
    return res.json({ operationId, message: 'Type check started' });
  } catch (error) {
    logger.error('Failed to start module type check', error as Error);
    return res.status(500).json({ error: 'Failed to start type check' });
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
 * POST /api/modules/:name/run-script
 * Run a generic script command from module.json
 */
router.post('/modules/:name/run-script', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { scriptName } = req.body;

    if (!scriptName) {
      return res.status(400).json({ error: 'scriptName is required in request body' });
    }

    const operationId = await deploymentManager.runScript(name, scriptName);
    logger.info('Module script started', { module: name, scriptName, operationId });
    return res.json({ operationId, message: `Script "${scriptName}" started` });
  } catch (error) {
    logger.error('Failed to run module script', error as Error);
    return res.status(500).json({ error: 'Failed to run script' });
  }
});

/**
 * GET /api/modules/:name/scripts
 * Get the available scripts from a module's module.json
 */
router.get('/modules/:name/scripts', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const modulePath = path.join(process.cwd(), '..', 'modules', name);
    const moduleJsonPath = path.join(modulePath, 'module.json');

    // Read module.json
    const moduleJsonContent = await fs.readFile(moduleJsonPath, 'utf-8');
    const moduleJson = JSON.parse(moduleJsonContent);

    // Return the scripts section
    const scripts = moduleJson.scripts || {};
    return res.json({ scripts });
  } catch (error) {
    logger.error('Failed to get module scripts', error as Error);
    return res.status(500).json({ error: 'Failed to get scripts' });
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
 * GET /api/modules/:name/branches
 * Get list of git branches for a module
 */
router.get('/modules/:name/branches', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const modulePath = path.join(getModulesPath(), name);

    // Check if module exists and has git
    try {
      await fs.access(path.join(modulePath, '.git'));
    } catch {
      return res.status(404).json({ error: 'Module not found or not a git repository' });
    }

    // Fetch latest from remote
    await import('child_process').then(({ exec }) => {
      return new Promise((resolve, reject) => {
        exec('git fetch --all', { cwd: modulePath }, (error) => {
          if (error) reject(error);
          else resolve(null);
        });
      });
    });

    // Get all branches
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const { stdout } = await execAsync('git branch -a', { cwd: modulePath });
    const currentBranch = (await execAsync('git branch --show-current', { cwd: modulePath })).stdout.trim();

    const branchMap = new Map<string, any>();

    // Parse branches
    stdout.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.includes('->')) return;

      const isCurrent = trimmed.startsWith('*');
      const branchLine = trimmed.replace(/^\*\s+/, '');

      if (branchLine.startsWith('remotes/origin/')) {
        const name = branchLine.replace('remotes/origin/', '');
        const existing = branchMap.get(name);
        if (existing) {
          existing.isRemote = true;
        } else {
          branchMap.set(name, {
            name,
            isLocal: false,
            isRemote: true,
            isCurrent: false,
          });
        }
      } else {
        const existing = branchMap.get(branchLine);
        if (existing) {
          existing.isLocal = true;
          if (isCurrent) existing.isCurrent = true;
        } else {
          branchMap.set(branchLine, {
            name: branchLine,
            isLocal: true,
            isRemote: false,
            isCurrent,
          });
        }
      }
    });

    const branches = Array.from(branchMap.values()).sort((a: any, b: any) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      if (a.isLocal && !b.isLocal) return -1;
      if (!a.isLocal && b.isLocal) return 1;
      return a.name.localeCompare(b.name);
    });

    return res.json({
      currentBranch,
      branches
    });
  } catch (error) {
    logger.error('Failed to list branches', error as Error);
    return res.status(500).json({ error: 'Failed to list branches' });
  }
});

/**
 * POST /api/modules/:name/branches/switch
 * Switch git branch for a module
 */
router.post('/modules/:name/branches/switch', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { branch } = req.body;

    if (!branch) {
      return res.status(400).json({ error: 'branch is required' });
    }

    const modulePath = path.join(getModulesPath(), name);

    // Check if module exists and has git
    try {
      await fs.access(path.join(modulePath, '.git'));
    } catch {
      return res.status(404).json({ error: 'Module not found or not a git repository' });
    }

    logger.info('Switching module branch', { module: name, branch });

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Get current branch
    const previousBranch = (await execAsync('git branch --show-current', { cwd: modulePath })).stdout.trim();

    // Check for uncommitted changes
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: modulePath });
    if (statusOutput.trim().length > 0) {
      return res.status(400).json({
        error: 'Module has uncommitted changes. Please commit or stash them first.',
        hasUncommittedChanges: true
      });
    }

    // Check if branch exists locally
    const { stdout: branchList } = await execAsync('git branch', { cwd: modulePath });
    const branchExists = branchList.split('\n').some(line =>
      line.trim().replace(/^\*\s+/, '') === branch
    );

    try {
      if (!branchExists) {
        // Branch doesn't exist locally, try to check it out from remote
        await execAsync(`git checkout -b ${branch} origin/${branch}`, { cwd: modulePath });
      } else {
        // Branch exists locally, just checkout
        await execAsync(`git checkout ${branch}`, { cwd: modulePath });
      }

      logger.info('Successfully switched module branch', { module: name, from: previousBranch, to: branch });

      return res.json({
        success: true,
        message: `Switched from ${previousBranch} to ${branch}`,
        previousBranch,
        newBranch: branch
      });
    } catch (checkoutError: any) {
      logger.error('Failed to switch branch', checkoutError as Error);
      return res.status(500).json({
        error: `Failed to switch branch: ${checkoutError.message}`,
        previousBranch
      });
    }
  } catch (error) {
    logger.error('Failed to switch branch', error as Error);
    return res.status(500).json({ error: 'Failed to switch branch' });
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

// ============================================================================
// Module Testing Routes
// ============================================================================

/**
 * POST /api/modules/:name/test/:testName
 * Run a specific test for a module
 */
router.post('/modules/:name/test/:testName', async (req: Request, res: Response) => {
  try {
    const { name, testName } = req.params;
    const modulePath = path.join(process.cwd(), '..', 'modules', name);

    // Check if module exists
    try {
      await fs.access(modulePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: `Module ${name} not found`,
      });
    }

    // Check if test file exists
    const testFilePath = path.join(modulePath, 'tests', 'index.test.ts');
    try {
      await fs.access(testFilePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: `No tests found for module ${name}`,
      });
    }

    // Import and run the test
    try {
      // Dynamically import the test module
      const testModule = await import(path.join(modulePath, 'tests', 'index.test.js'));

      if (typeof testModule.runTests !== 'function') {
        return res.status(500).json({
          success: false,
          error: 'Test module does not export runTests function',
        });
      }

      // Run all tests and get results
      const allResults = await testModule.runTests();

      // Get specific test result
      const result = allResults[testName];

      if (!result) {
        return res.status(404).json({
          success: false,
          error: `Test "${testName}" not found in module ${name}`,
        });
      }

      return res.json({
        success: result.success,
        output: result.output,
        duration: result.duration,
      });
    } catch (error: any) {
      logger.error(`Test execution failed for ${name}:${testName}`, error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Test execution failed',
      });
    }
  } catch (error) {
    logger.error('Failed to run test', error as Error);
    return res.status(500).json({ error: 'Failed to run test' });
  }
});

/**
 * GET /api/modules/:name/tests
 * Get list of available tests for a module
 */
router.get('/modules/:name/tests', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const modulePath = path.join(process.cwd(), '..', 'modules', name);

    // Check if test file exists
    const testFilePath = path.join(modulePath, 'tests', 'index.test.ts');
    try {
      await fs.access(testFilePath);

      // Import the test module to get available tests
      const testModule = await import(path.join(modulePath, 'tests', 'index.test.js'));

      if (typeof testModule.runTests === 'function') {
        const allResults = await testModule.runTests();
        const testNames = Object.keys(allResults);

        return res.json({
          moduleName: name,
          tests: testNames,
          count: testNames.length,
        });
      }

      return res.json({
        moduleName: name,
        tests: [],
        count: 0,
      });
    } catch {
      return res.json({
        moduleName: name,
        tests: [],
        count: 0,
      });
    }
  } catch (error) {
    logger.error('Failed to get module tests', error as Error);
    return res.status(500).json({ error: 'Failed to get module tests' });
  }
});

export default router;
