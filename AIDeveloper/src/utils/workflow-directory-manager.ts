/**
 * Workflow Directory Manager
 * Manages workflow-specific directories for logs, artifacts, and documentation
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { config } from '../config.js';
import * as logger from './logger.js';
import { WorkflowType, AgentType } from '../types.js';
import { getGit } from './git-helper.js';

/**
 * Load SSH environment for git operations
 */
function getSSHEnvironment(): NodeJS.ProcessEnv {
  const sshEnvFile = path.join(process.env.HOME || '/root', '.ssh', 'agent-environment');

  try {
    const envContent = require('fs').readFileSync(sshEnvFile, 'utf-8');
    const env: NodeJS.ProcessEnv = { ...process.env };

    // Parse the environment file
    const matches = envContent.matchAll(/([A-Z_]+)=([^;]+);/g);
    for (const match of matches) {
      const [, key, value] = match;
      // Remove quotes if present
      env[key] = value.replace(/^['"]|['"]$/g, '');
    }

    logger.debug('SSH environment loaded', {
      hasAuthSock: !!env.SSH_AUTH_SOCK,
      hasAgentPid: !!env.SSH_AGENT_PID
    });

    return env;
  } catch (error) {
    logger.warn('Could not load SSH environment, using default', error as Error);
    return {
      ...process.env,
      GIT_SSH_COMMAND: 'ssh -i /root/.ssh/id_rsa -F /root/.ssh/config',
    };
  }
}

/**
 * Get workflow directory path
 */
export function getWorkflowDirectory(workflowId: number, branchName: string): string {
  const workflowsRoot = path.join(config.workspace.root, 'workflows');
  const sanitizedBranch = branchName.replace(/[^a-zA-Z0-9-_]/g, '-');
  return path.join(workflowsRoot, `workflow-${workflowId}-${sanitizedBranch}`);
}

/**
 * Get workflow repository path (the cloned repo within the workflow directory)
 */
export function getWorkflowRepoPath(workflowId: number, branchName: string): string {
  const workflowDir = getWorkflowDirectory(workflowId, branchName);
  return path.join(workflowDir, 'repo');
}

/**
 * Clone repository into workflow directory
 * @param workflowDir - The workflow directory path
 * @param targetModule - The module to clone (e.g., 'AIDeveloper', 'WorkflowOrchestrator')
 * @param baseBranch - The base branch to checkout (default: 'master')
 */
async function cloneRepository(
  workflowDir: string,
  targetModule: string,
  baseBranch: string = 'master'
): Promise<void> {
  try {
    logger.info('Cloning module repository into workflow directory', { workflowDir, targetModule });

    // Get the repository URL from the target module
    const modulePath = targetModule === 'AIDeveloper'
      ? config.workspace.root
      : path.join(config.workspace.root, '..', 'modules', targetModule);

    const git = getGit(modulePath);

    // Get remote URL
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');

    if (!origin || !origin.refs.fetch) {
      throw new Error(`No origin remote found for ${targetModule}`);
    }

    const repoUrl = origin.refs.fetch;
    const repoDir = path.join(workflowDir, 'repo');

    // Clone the repository
    logger.info('Cloning repository', { module: targetModule, url: repoUrl, target: repoDir });
    execSync(`git clone ${repoUrl} ${repoDir}`, {
      stdio: 'inherit',
      cwd: workflowDir,
      env: getSSHEnvironment(),
    });

    // Checkout base branch (master for modules, develop for AIDeveloper)
    logger.info('Checking out base branch', { branch: baseBranch });
    const workflowGit = getGit(repoDir);
    await workflowGit.checkout(baseBranch);

    // Install dependencies if package.json exists
    const packageJsonPath = path.join(repoDir, 'package.json');
    try {
      await fs.access(packageJsonPath);
      logger.info('Installing dependencies');

      const installOutput = execSync('npm install --include=dev', {
        cwd: repoDir,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        env: { ...process.env, NODE_ENV: 'development' },
      });
      logger.info('Dependencies installed successfully', { output: installOutput.slice(-500) });

      // Build the project if build script exists
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        if (packageJson.scripts && packageJson.scripts.build) {
          logger.info('Building project');
          const buildOutput = execSync('npm run build', {
            cwd: repoDir,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
          });
          logger.info('Build completed successfully', { output: buildOutput.slice(-500) });
        }
      } catch (buildError: any) {
        logger.warn('Build step skipped or failed', {
          error: buildError.message,
          stdout: buildError.stdout?.toString().slice(-500),
          stderr: buildError.stderr?.toString().slice(-500),
        });
      }
    } catch (error) {
      logger.info('No package.json found, skipping npm install');
    }

    logger.info('Repository cloned successfully', { module: targetModule });
  } catch (error) {
    logger.error('Failed to clone repository', error as Error);
    throw error;
  }
}

/**
 * Create workflow directory structure
 */
export async function createWorkflowDirectory(
  workflowId: number,
  branchName: string,
  workflowType: WorkflowType,
  targetModule: string
): Promise<string> {
  try {
    const workflowDir = getWorkflowDirectory(workflowId, branchName);

    // Create main workflow directory
    await fs.mkdir(workflowDir, { recursive: true });

    // Create subdirectories
    await fs.mkdir(path.join(workflowDir, 'logs'), { recursive: true });
    await fs.mkdir(path.join(workflowDir, 'artifacts'), { recursive: true });
    await fs.mkdir(path.join(workflowDir, 'stages'), { recursive: true });

    // Determine base branch: 'develop' for AIDeveloper, 'master' for modules
    const baseBranch = targetModule === 'AIDeveloper' ? 'develop' : 'master';

    // Clone the target module's repository into workflow directory
    await cloneRepository(workflowDir, targetModule, baseBranch);

    // Create README
    const readme = `# Workflow ${workflowId}: ${workflowType}

**Branch:** \`${branchName}\`
**Created:** ${new Date().toISOString()}
**Status:** In Progress

## Directory Structure

- \`repo/\` - Cloned repository (isolated workspace)
- \`logs/\` - Agent execution logs and output
- \`artifacts/\` - Generated code, tests, and documentation
- \`stages/\` - Stage-by-stage documentation

## Workflow Timeline

This directory tracks the complete history of this workflow execution.
Future agents can traverse this history to understand decisions and outcomes.
`;

    await fs.writeFile(path.join(workflowDir, 'README.md'), readme);

    logger.info(`Workflow directory created: ${workflowDir}`);

    return workflowDir;
  } catch (error) {
    logger.error('Failed to create workflow directory', error as Error);
    throw error;
  }
}

/**
 * Log agent stage execution
 */
export async function logAgentStage(
  workflowId: number,
  branchName: string,
  agentType: AgentType,
  stage: 'start' | 'complete' | 'failed',
  details: {
    input?: any;
    output?: any;
    error?: string;
    duration?: number;
  }
): Promise<void> {
  try {
    const workflowDir = getWorkflowDirectory(workflowId, branchName);
    const timestamp = new Date().toISOString();
    const logFile = path.join(
      workflowDir,
      'logs',
      `${agentType}-${stage}-${timestamp.replace(/:/g, '-')}.json`
    );

    const logEntry = {
      workflowId,
      branchName,
      agentType,
      stage,
      timestamp,
      ...details,
    };

    await fs.writeFile(logFile, JSON.stringify(logEntry, null, 2));

    logger.debug(`Agent stage logged: ${agentType} ${stage}`);
  } catch (error) {
    logger.error('Failed to log agent stage', error as Error);
    // Don't throw - logging failure shouldn't stop workflow
  }
}

/**
 * Create stage documentation
 */
export async function createStageDoc(
  workflowId: number,
  branchName: string,
  agentType: AgentType,
  stageNumber: number,
  content: {
    title: string;
    summary: string;
    input: string;
    output: string;
    artifacts?: string[];
    notes?: string[];
    duration?: number;
  }
): Promise<void> {
  try {
    const workflowDir = getWorkflowDirectory(workflowId, branchName);
    const stageFile = path.join(
      workflowDir,
      'stages',
      `${String(stageNumber).padStart(2, '0')}-${agentType}.md`
    );

    const doc = `# Stage ${stageNumber}: ${content.title}

**Agent:** ${agentType}
**Timestamp:** ${new Date().toISOString()}
${content.duration ? `**Duration:** ${content.duration}ms\n` : ''}

## Summary

${content.summary}

## Input

\`\`\`
${content.input}
\`\`\`

## Output

\`\`\`
${content.output}
\`\`\`

${
  content.artifacts && content.artifacts.length > 0
    ? `## Artifacts Generated

${content.artifacts.map((a) => `- ${a}`).join('\n')}
`
    : ''
}
${
  content.notes && content.notes.length > 0
    ? `## Notes

${content.notes.map((n) => `- ${n}`).join('\n')}
`
    : ''
}

---

*This documentation is automatically generated to help future agents understand the workflow history.*
`;

    await fs.writeFile(stageFile, doc);

    logger.debug(`Stage documentation created: ${agentType}`);
  } catch (error) {
    logger.error('Failed to create stage documentation', error as Error);
    // Don't throw - documentation failure shouldn't stop workflow
  }
}

/**
 * Save artifact to workflow directory
 */
export async function saveWorkflowArtifact(
  workflowId: number,
  branchName: string,
  artifactName: string,
  content: string
): Promise<void> {
  try {
    const workflowDir = getWorkflowDirectory(workflowId, branchName);
    const artifactPath = path.join(workflowDir, 'artifacts', artifactName);

    // Create subdirectories if artifact has path
    const artifactDir = path.dirname(artifactPath);
    await fs.mkdir(artifactDir, { recursive: true });

    await fs.writeFile(artifactPath, content);

    logger.debug(`Artifact saved: ${artifactName}`);
  } catch (error) {
    logger.error('Failed to save workflow artifact', error as Error);
    throw error;
  }
}

/**
 * Update workflow README with completion status
 */
export async function updateWorkflowStatus(
  workflowId: number,
  branchName: string,
  status: 'completed' | 'failed',
  summary: string
): Promise<void> {
  try {
    const workflowDir = getWorkflowDirectory(workflowId, branchName);
    const readmePath = path.join(workflowDir, 'README.md');

    // Read existing README
    let readme = await fs.readFile(readmePath, 'utf-8');

    // Update status line (handle both initial "In Progress" and subsequent updates)
    readme = readme.replace(
      /\*\*Status:\*\* (?:In Progress|✅ Completed|❌ Failed)/,
      `**Status:** ${status === 'completed' ? '✅ Completed' : '❌ Failed'}`
    );

    // Update or add completed timestamp
    if (readme.includes('**Completed:**')) {
      // Replace existing timestamp
      readme = readme.replace(
        /\*\*Completed:\*\* .+/,
        `**Completed:** ${new Date().toISOString()}`
      );
    } else {
      // Add timestamp after status line
      readme = readme.replace(
        /(\*\*Status:\*\* [^\n]+)/,
        `$1\n**Completed:** ${new Date().toISOString()}`
      );
    }

    // Remove any existing Final Summary sections to avoid duplicates
    readme = readme.replace(/\n+## Final Summary\n+[\s\S]*/g, '');

    // Append new summary
    const finalReadme = `${readme}

## Final Summary

${summary}
`;

    await fs.writeFile(readmePath, finalReadme);

    logger.debug(`Workflow status updated: ${status}`);
  } catch (error) {
    logger.error('Failed to update workflow status', error as Error);
    // Don't throw
  }
}

/**
 * Get workflow history (list of all logs and stages)
 */
export async function getWorkflowHistory(
  workflowId: number,
  branchName: string
): Promise<{
  logs: string[];
  stages: string[];
  artifacts: string[];
}> {
  try {
    const workflowDir = getWorkflowDirectory(workflowId, branchName);

    const [logs, stages, artifacts] = await Promise.all([
      fs.readdir(path.join(workflowDir, 'logs')).catch(() => []),
      fs.readdir(path.join(workflowDir, 'stages')).catch(() => []),
      fs.readdir(path.join(workflowDir, 'artifacts')).catch(() => []),
    ]);

    return {
      logs: logs.sort(),
      stages: stages.sort(),
      artifacts: artifacts.sort(),
    };
  } catch (error) {
    logger.error('Failed to get workflow history', error as Error);
    return { logs: [], stages: [], artifacts: [] };
  }
}
