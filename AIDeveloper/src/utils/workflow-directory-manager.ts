/**
 * Workflow Directory Manager
 * Manages workflow-specific directories for logs, artifacts, and documentation
 */

import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import * as logger from './logger.js';
import { WorkflowType, AgentType } from '../types.js';

/**
 * Get workflow directory path
 */
export function getWorkflowDirectory(workflowId: number, branchName: string): string {
  const workflowsRoot = path.join(config.workspace.root, 'workflows');
  const sanitizedBranch = branchName.replace(/[^a-zA-Z0-9-_]/g, '-');
  return path.join(workflowsRoot, `workflow-${workflowId}-${sanitizedBranch}`);
}

/**
 * Create workflow directory structure
 */
export async function createWorkflowDirectory(
  workflowId: number,
  branchName: string,
  workflowType: WorkflowType
): Promise<string> {
  try {
    const workflowDir = getWorkflowDirectory(workflowId, branchName);

    // Create main workflow directory
    await fs.mkdir(workflowDir, { recursive: true });

    // Create subdirectories
    await fs.mkdir(path.join(workflowDir, 'logs'), { recursive: true });
    await fs.mkdir(path.join(workflowDir, 'artifacts'), { recursive: true });
    await fs.mkdir(path.join(workflowDir, 'stages'), { recursive: true });

    // Create README
    const readme = `# Workflow ${workflowId}: ${workflowType}

**Branch:** \`${branchName}\`
**Created:** ${new Date().toISOString()}
**Status:** In Progress

## Directory Structure

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
    const readme = await fs.readFile(readmePath, 'utf-8');

    // Update status line
    const updatedReadme = readme.replace(
      /\*\*Status:\*\* In Progress/,
      `**Status:** ${status === 'completed' ? '✅ Completed' : '❌ Failed'}
**Completed:** ${new Date().toISOString()}`
    );

    // Append summary
    const finalReadme = `${updatedReadme}

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
