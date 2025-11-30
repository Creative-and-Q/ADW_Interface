/**
 * WorkflowOrchestrator
 * Orchestrates workflow execution and manages agent sequence
 */

import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

dotenv.config();

const execAsync = promisify(exec);

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection
let dbPool: mysql.Pool | null = null;

function getDbPool(): mysql.Pool {
  if (!dbPool) {
    dbPool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'rootpass',
      database: process.env.DB_NAME || 'aideveloper',
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return dbPool;
}

/**
 * Agent Input Interface
 */
export interface AgentInput {
  workflowId: number;
  workflowType?: string;
  targetModule?: string;
  taskDescription?: string;
  branchName?: string;
  workingDir: string; // Required
  metadata?: Record<string, any>;
  context?: Record<string, any>;
  env?: Record<string, string>; // Environment variables
}

/**
 * Agent Output Interface
 */
export interface AgentOutput {
  success: boolean;
  artifacts: Array<{
    type: string;
    content: string;
    filePath?: string;
    metadata?: Record<string, any>;
  }>;
  summary: string;
  suggestions?: string[];
  requiresRetry?: boolean;
  retryReason?: string;
  metadata?: Record<string, any>;
}

/**
 * Interrupt Signal Interface
 */
interface InterruptSignal {
  type: 'pause' | 'cancel' | 'redirect' | 'instruction';
  messageId: number;
  content: string;
  metadata?: any;
}

/**
 * WorkflowOrchestrator Agent
 */
export class WorkflowOrchestrator {
  private pauseCheckInterval = 5000; // 5 seconds
  private maxPauseTime = 30 * 60 * 1000; // 30 minutes

  constructor() {
    // Orchestrator doesn't need API key for now
  }

  /**
   * Get a human-readable description of what each agent does
   */
  private getAgentDescription(agentType: string): string {
    const descriptions: Record<string, string> = {
      plan: 'Analyzing the codebase and creating an implementation plan',
      code: 'Writing and modifying code based on the plan',
      test: 'Writing and running tests to verify the implementation',
      review: 'Reviewing code quality and suggesting improvements',
      document: 'Generating documentation for the code changes',
      scaffold: 'Creating the initial module structure and files',
    };
    return descriptions[agentType] || `Executing ${agentType} operations`;
  }

  /**
   * Post a comment to the workflow conversation thread
   */
  private async postAgentComment(
    workflowId: number,
    agentType: string,
    content: string,
    agentExecutionId?: number,
    metadata?: any
  ): Promise<void> {
    try {
      const db = getDbPool();
      await db.execute(
        `INSERT INTO workflow_messages
         (workflow_id, agent_execution_id, message_type, agent_type, content, metadata, action_type, action_status)
         VALUES (?, ?, 'agent', ?, ?, ?, 'comment', 'processed')`,
        [
          workflowId,
          agentExecutionId || null,
          agentType,
          content,
          metadata ? JSON.stringify(metadata) : null,
        ]
      );
      console.log(`[${agentType}] ${content}`);
    } catch (error) {
      console.error('Failed to post agent comment:', error);
      // Don't throw - comments are non-critical
    }
  }

  /**
   * Post a system message to the workflow conversation thread
   */
  private async postSystemMessage(
    workflowId: number,
    content: string,
    actionType: string = 'comment',
    metadata?: any
  ): Promise<void> {
    try {
      const db = getDbPool();
      await db.execute(
        `INSERT INTO workflow_messages
         (workflow_id, message_type, content, metadata, action_type, action_status)
         VALUES (?, 'system', ?, ?, ?, 'processed')`,
        [
          workflowId,
          content,
          metadata ? JSON.stringify(metadata) : null,
          actionType,
        ]
      );
      console.log(`[System] ${content}`);
    } catch (error) {
      console.error('Failed to post system message:', error);
    }
  }

  /**
   * Check for interrupt signals from user messages
   */
  private async checkForInterrupt(workflowId: number): Promise<InterruptSignal | null> {
    try {
      const db = getDbPool();

      // Check for pending user messages with action types
      const [messages] = await db.execute(
        `SELECT id, content, action_type, metadata
         FROM workflow_messages
         WHERE workflow_id = ?
           AND message_type = 'user'
           AND action_status = 'pending'
           AND action_type IN ('pause', 'cancel', 'redirect', 'instruction')
         ORDER BY created_at ASC
         LIMIT 1`,
        [workflowId]
      );

      const pendingMessages = messages as any[];
      if (pendingMessages.length > 0) {
        const msg = pendingMessages[0];
        return {
          type: msg.action_type,
          messageId: msg.id,
          content: msg.content,
          metadata: msg.metadata ? (typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata) : null,
        };
      }

      // Also check if workflow is paused
      const [workflows] = await db.execute(
        `SELECT is_paused FROM workflows WHERE id = ?`,
        [workflowId]
      );

      if ((workflows as any[])[0]?.is_paused) {
        return {
          type: 'pause',
          messageId: 0,
          content: 'Workflow is paused',
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to check for interrupt:', error);
      return null; // Don't throw - let workflow continue
    }
  }

  /**
   * Mark a message as acknowledged
   */
  private async markMessageAcknowledged(messageId: number): Promise<void> {
    if (messageId === 0) return; // Skip for pause flag checks
    try {
      const db = getDbPool();
      await db.execute(
        `UPDATE workflow_messages SET action_status = 'acknowledged' WHERE id = ?`,
        [messageId]
      );
    } catch (error) {
      console.error('Failed to mark message as acknowledged:', error);
    }
  }

  /**
   * Mark a message as processed
   */
  private async markMessageProcessed(messageId: number): Promise<void> {
    if (messageId === 0) return;
    try {
      const db = getDbPool();
      await db.execute(
        `UPDATE workflow_messages SET action_status = 'processed' WHERE id = ?`,
        [messageId]
      );
    } catch (error) {
      console.error('Failed to mark message as processed:', error);
    }
  }

  /**
   * Handle pause request - wait for unpause signal
   */
  private async handlePause(workflowId: number, interrupt: InterruptSignal): Promise<void> {
    await this.markMessageAcknowledged(interrupt.messageId);
    await this.postSystemMessage(workflowId, `Workflow paused: ${interrupt.content}`, 'pause');

    // Set paused flag if not already set
    const db = getDbPool();
    await db.execute(
      `UPDATE workflows SET is_paused = TRUE, pause_requested_at = NOW(), pause_reason = ? WHERE id = ?`,
      [interrupt.content, workflowId]
    );

    await this.logWorkflow(workflowId, 'info', 'workflow_paused', `Workflow paused: ${interrupt.content}`);
  }

  /**
   * Wait for workflow to be unpaused
   */
  private async waitForUnpause(workflowId: number): Promise<void> {
    const startTime = Date.now();
    let checkCount = 0;

    while (Date.now() - startTime < this.maxPauseTime) {
      await new Promise(resolve => setTimeout(resolve, this.pauseCheckInterval));
      checkCount++;

      // Check if still paused
      const db = getDbPool();
      const [workflows] = await db.execute(
        `SELECT is_paused FROM workflows WHERE id = ?`,
        [workflowId]
      );

      if (!(workflows as any[])[0]?.is_paused) {
        await this.postSystemMessage(workflowId, 'Workflow resumed', 'resume');
        await this.logWorkflow(workflowId, 'info', 'workflow_resumed', 'Workflow resumed after pause');
        return;
      }

      // Log periodic status
      if (checkCount % 12 === 0) { // Every minute
        await this.logWorkflow(workflowId, 'debug', 'workflow_paused_waiting',
          `Workflow still paused, waiting for resume... (${Math.round((Date.now() - startTime) / 1000)}s)`);
      }
    }

    // Timeout - auto-resume with warning
    await this.postSystemMessage(workflowId, 'Workflow auto-resumed after 30 minute timeout', 'resume');
    await this.logWorkflow(workflowId, 'warn', 'workflow_pause_timeout', 'Workflow auto-resumed after 30 minute timeout');

    const db = getDbPool();
    await db.execute(
      `UPDATE workflows SET is_paused = FALSE, pause_requested_at = NULL, pause_reason = NULL WHERE id = ?`,
      [workflowId]
    );
  }

  /**
   * Handle cancel request
   */
  private async handleCancel(workflowId: number, interrupt: InterruptSignal): Promise<void> {
    await this.markMessageAcknowledged(interrupt.messageId);
    await this.postSystemMessage(workflowId, `Workflow cancelled by user: ${interrupt.content}`, 'cancel');
    await this.logWorkflow(workflowId, 'info', 'workflow_cancelled', `Workflow cancelled by user: ${interrupt.content}`);
    await this.markMessageProcessed(interrupt.messageId);
  }

  /**
   * Handle instruction from user - acknowledge and continue
   */
  private async handleInstruction(workflowId: number, interrupt: InterruptSignal, agentType: string): Promise<void> {
    await this.markMessageAcknowledged(interrupt.messageId);
    await this.postAgentComment(
      workflowId,
      agentType,
      `Acknowledged user instruction: "${interrupt.content.substring(0, 100)}${interrupt.content.length > 100 ? '...' : ''}"`,
    );
    await this.markMessageProcessed(interrupt.messageId);
  }

  /**
   * Load environment variables from workspace root .env file
   */
  private async loadEnvironmentVariables(): Promise<void> {
    try {
      // Workspace root is 3 levels up from WorkflowOrchestrator module
      const workspaceRoot = path.join(__dirname, '..', '..', '..');
      const envPath = path.join(workspaceRoot, '.env');
      
      try {
        const envContent = await fs.readFile(envPath, 'utf-8');
        const parsedEnv = dotenv.parse(envContent);
        
        // Merge into process.env (don't overwrite existing values)
        for (const [key, value] of Object.entries(parsedEnv)) {
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
        
        console.log('WorkflowOrchestrator: Loaded environment variables from .env file', {
          loadedCount: Object.keys(parsedEnv).length,
          hasOpenRouterKey: !!process.env.OPENROUTER_API_KEY,
        });
      } catch (error) {
        // .env file doesn't exist or can't be read - that's okay, use process.env defaults
        console.warn('WorkflowOrchestrator: Could not load .env file, using process.env defaults', {
          error: (error as Error).message,
        });
      }
    } catch (error) {
      console.error('WorkflowOrchestrator: Failed to load environment variables', error);
      // Don't throw - continue with existing process.env
    }
  }

  /**
   * Execute the orchestrator agent
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    // Load environment variables from workspace root .env file
    await this.loadEnvironmentVariables();

    // Validate workingDir is provided
    if (!input.workingDir) {
      throw new Error('workingDir is required for WorkflowOrchestrator');
    }

    // Verify workingDir exists
    try {
      await fs.access(input.workingDir);
    } catch (error) {
      throw new Error(`Working directory does not exist: ${input.workingDir}`);
    }

    // Determine the actual code directory
    // Workflow directories have structure: workflowDir/repo/ for the cloned repository
    // Agents should work in the repo directory, not the workflow root
    const repoDir = path.join(input.workingDir, 'repo');
    let codeWorkingDir = input.workingDir;

    try {
      await fs.access(repoDir);
      codeWorkingDir = repoDir;
      console.log(`WorkflowOrchestrator: Using repo directory for agents: ${codeWorkingDir}`);
    } catch (error) {
      // No repo directory, use workingDir as-is
      console.log(`WorkflowOrchestrator: No repo subdirectory found, using workingDir: ${codeWorkingDir}`);
    }

    const allArtifacts: any[] = [];
    const allSummaries: string[] = [];
    let hasFailedAgent = false;

    try {
      // Determine agent sequence based on workflow type
      const agentSequence = this.getAgentSequence(input.workflowType || 'feature');

      await this.logWorkflow(input.workflowId, 'info', 'workflow_started', `Starting workflow with ${agentSequence.length} agents`, {
        agentSequence,
        workflowType: input.workflowType,
        codeWorkingDir,
      });

      // Post initial workflow message
      await this.postSystemMessage(
        input.workflowId,
        `Starting workflow with ${agentSequence.length} agent(s): ${agentSequence.join(' → ')}`,
        'comment',
        { agentSequence, workflowType: input.workflowType }
      );

      // Execute agents in sequence
      for (let i = 0; i < agentSequence.length; i++) {
        const agentType = agentSequence[i];

        // ===== CHECK FOR USER INTERRUPTS =====
        const interrupt = await this.checkForInterrupt(input.workflowId);
        if (interrupt) {
          if (interrupt.type === 'pause') {
            await this.handlePause(input.workflowId, interrupt);
            await this.waitForUnpause(input.workflowId);
          } else if (interrupt.type === 'cancel') {
            await this.handleCancel(input.workflowId, interrupt);
            return {
              success: false,
              artifacts: allArtifacts,
              summary: `Workflow cancelled by user: ${interrupt.content}`,
            };
          } else if (interrupt.type === 'instruction') {
            await this.handleInstruction(input.workflowId, interrupt, agentType);
            // Continue with execution after acknowledging
          }
        }

        // ===== POST AGENT STARTING COMMENT =====
        await this.postAgentComment(
          input.workflowId,
          agentType,
          `Starting ${agentType} agent (${i + 1}/${agentSequence.length}) - ${this.getAgentDescription(agentType)}`
        );

        await this.logWorkflow(input.workflowId, 'info', `agent_${agentType}_starting`, `Starting ${agentType} agent (${i + 1}/${agentSequence.length})`);

        // Create agent_execution record
        const agentExecutionId = await this.createAgentExecution(input.workflowId, agentType, input);

        try {
          // Ensure environment variables are available in process.env before importing agent
          // This ensures agents can access them via process.env even if their .env files don't have them
          const openRouterKey = process.env.OPENROUTER_API_KEY;
          if (!openRouterKey) {
            console.error(`WorkflowOrchestrator: OPENROUTER_API_KEY not found in process.env for ${agentType} agent`);
            throw new Error('OPENROUTER_API_KEY environment variable is required');
          }

          // Prepare input with environment variables
          // Use codeWorkingDir (repo/) for agents to work in the actual code directory
          const agentInput = {
            ...input,
            workingDir: codeWorkingDir,
            env: {
              OPENROUTER_API_KEY: openRouterKey,
              OPENROUTER_MODEL_PLANNING: process.env.OPENROUTER_MODEL_PLANNING || process.env.WORKFLOW_OPENROUTER_MODEL_PLANNING || 'x-ai/grok-code-fast-1',
              OPENROUTER_MODEL_CODING: process.env.OPENROUTER_MODEL_CODING || process.env.WORKFLOW_OPENROUTER_MODEL_CODING || 'x-ai/grok-code-fast-1',
              OPENROUTER_MODEL_TESTING: process.env.OPENROUTER_MODEL_TESTING || process.env.WORKFLOW_OPENROUTER_MODEL_TESTING || 'x-ai/grok-code-fast-1',
              OPENROUTER_MODEL_REVIEW: process.env.OPENROUTER_MODEL_REVIEW || process.env.WORKFLOW_OPENROUTER_MODEL_REVIEW || 'x-ai/grok-code-fast-1',
              OPENROUTER_MODEL_DOCS: process.env.OPENROUTER_MODEL_DOCS || process.env.WORKFLOW_OPENROUTER_MODEL_DOCS || 'x-ai/grok-code-fast-1',
            }
          };

          console.log(`WorkflowOrchestrator: Executing ${agentType} agent with API key available:`, !!agentInput.env.OPENROUTER_API_KEY);

          // Execute the agent
          const agentOutput = await this.executeAgent(agentType, agentInput, agentExecutionId);

          // Check if agent returned success: false (e.g., 402 API errors)
          if (!agentOutput.success) {
            hasFailedAgent = true;
            await this.updateAgentExecution(agentExecutionId, 'failed', agentOutput, agentOutput.summary);
            await this.logWorkflow(input.workflowId, 'warn', `agent_${agentType}_returned_failure`, `${agentType} agent returned success=false: ${agentOutput.summary}`);

            // ===== POST AGENT FAILURE COMMENT =====
            await this.postAgentComment(
              input.workflowId,
              agentType,
              `❌ ${agentType} agent failed: ${agentOutput.summary}`,
              agentExecutionId
            );

            allSummaries.push(`${agentType}: FAILED - ${agentOutput.summary}`);
            // Continue with next agent
            continue;
          }

          // Update agent execution as completed
          await this.updateAgentExecution(agentExecutionId, 'completed', agentOutput);

          // Collect artifacts and summaries
          allArtifacts.push(...agentOutput.artifacts);
          allSummaries.push(`${agentType}: ${agentOutput.summary}`);

          // ===== POST AGENT COMPLETION COMMENT =====
          await this.postAgentComment(
            input.workflowId,
            agentType,
            `✅ ${agentType} agent completed: ${agentOutput.summary.substring(0, 200)}${agentOutput.summary.length > 200 ? '...' : ''}`,
            agentExecutionId,
            { artifactsCount: agentOutput.artifacts.length }
          );

          await this.logWorkflow(input.workflowId, 'info', `agent_${agentType}_completed`, `${agentType} agent completed successfully`, {
            artifactsCount: agentOutput.artifacts.length,
          });

          // After code agent completes, verify build succeeds and auto-commit
          if (agentType === 'code') {
            const buildResult = await this.verifyBuild(codeWorkingDir, input.workflowId);

            // Auto-commit changes if build succeeds
            if (buildResult.success) {
              const commitResult = await this.autoCommitChanges(
                codeWorkingDir,
                input.workflowId,
                input.taskDescription || `Workflow #${input.workflowId} changes`
              );
              if (commitResult.committed && commitResult.hash) {
                allSummaries.push(`auto_commit: Committed changes (${commitResult.hash})`);
                await this.logWorkflow(input.workflowId, 'info', 'auto_commit_success',
                  `Auto-committed changes: ${commitResult.hash}`, { commitHash: commitResult.hash });

                // Save checkpoint commit for this workflow
                await this.saveCheckpoint(input.workflowId, commitResult.hash);
              }
            }
            if (!buildResult.success) {
              // Track retry attempts
              const retryCount = (input.metadata?.buildRetryCount || 0);
              const maxRetries = 3;

              if (retryCount < maxRetries) {
                // Create a bugfix sub-workflow to fix the build error
                await this.logWorkflow(input.workflowId, 'warn', 'build_verification_failed_retry',
                  `Build failed (attempt ${retryCount + 1}/${maxRetries}), creating fix sub-workflow: ${buildResult.error}`);

                const fixWorkflowId = await this.createBuildFixSubWorkflow(
                  input.workflowId,
                  codeWorkingDir,
                  buildResult.error!,
                  retryCount + 1,
                  input
                );

                if (fixWorkflowId) {
                  allSummaries.push(`build_verification: FAILED - Created fix sub-workflow #${fixWorkflowId}`);
                  // Mark as needing retry but not complete failure
                  // The parent workflow will be marked as "pending_fix"
                  await this.logWorkflow(input.workflowId, 'info', 'build_fix_workflow_created',
                    `Created build fix sub-workflow #${fixWorkflowId}`, { fixWorkflowId, retryCount: retryCount + 1 });
                } else {
                  hasFailedAgent = true;
                  allSummaries.push(`build_verification: FAILED - Could not create fix workflow: ${buildResult.error}`);
                }
              } else {
                // Max retries reached
                hasFailedAgent = true;
                allSummaries.push(`build_verification: FAILED after ${maxRetries} attempts - ${buildResult.error}`);
                await this.logWorkflow(input.workflowId, 'error', 'build_verification_failed',
                  `Build verification failed after ${maxRetries} attempts: ${buildResult.error}`);
              }
              // Don't continue with review/test agents if build fails
              break;
            } else {
              allSummaries.push(`build_verification: Build succeeded`);
              await this.logWorkflow(input.workflowId, 'info', 'build_verification_passed', 'Build verification passed');
            }
          }

        } catch (agentError) {
          // Update agent execution as failed
          await this.updateAgentExecution(agentExecutionId, 'failed', null, (agentError as Error).message);

          await this.logWorkflow(input.workflowId, 'error', `agent_${agentType}_failed`, `${agentType} agent failed: ${(agentError as Error).message}`);

          // Mark that we have a failed agent
          hasFailedAgent = true;

          // Continue with next agent even if one fails (for now)
          allSummaries.push(`${agentType}: FAILED - ${(agentError as Error).message}`);
        }
      }

      await this.logWorkflow(input.workflowId, 'info', 'workflow_completed', 'Workflow completed successfully', {
        totalArtifacts: allArtifacts.length,
      });

      // Check for structured plan and create sub-workflows if present
      await this.handleSubWorkflowCreation(input.workflowId, allArtifacts);

      // Auto-push if this is a root workflow (no parent) and workflow succeeded
      if (!hasFailedAgent && !input.metadata?.parentWorkflowId) {
        const pushResult = await this.autoPushChanges(codeWorkingDir, input.workflowId, input.branchName);
        if (pushResult.pushed) {
          allSummaries.push('auto_push: Pushed changes to remote');
        }
      }

      return {
        success: !hasFailedAgent,
        artifacts: allArtifacts,
        summary: allSummaries.join('\n\n'),
      };
    } catch (error) {
      await this.logWorkflow(input.workflowId, 'error', 'workflow_failed', `Workflow failed: ${(error as Error).message}`);

      return {
        success: false,
        artifacts: allArtifacts,
        summary: `WorkflowOrchestrator failed: ${(error as Error).message}\n\n${allSummaries.join('\n\n')}`,
      };
    }
  }

  /**
   * Execute a shell script tool
   */
  async executeTool(toolName: string, args: string[], workingDir: string): Promise<string> {
    const toolPath = path.join(__dirname, 'tools', `${toolName}.sh`);

    try {
      // Check if tool exists
      await fs.access(toolPath);

      // Execute tool
      const { stdout, stderr } = await execAsync(
        `bash "${toolPath}" ${args.map(arg => `"${arg}"`).join(' ')}`,
        { cwd: workingDir }
      );

      if (stderr) {
        console.warn(`Tool ${toolName} stderr:`, stderr);
      }

      return stdout;
    } catch (error) {
      throw new Error(`Failed to execute tool ${toolName}: ${(error as Error).message}`);
    }
  }

  /**
   * Verify that the project builds successfully
   * Runs npm install first (to install any new dependencies), then npm run build if available,
   * otherwise runs TypeScript check (npx tsc --noEmit)
   */
  private async verifyBuild(workingDir: string, _workflowId: number): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if package.json exists
      const packageJsonPath = path.join(workingDir, 'package.json');
      let hasBuildScript = false;
      let hasTypeScript = false;
      let hasPackageJson = false;

      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        hasPackageJson = true;
        hasBuildScript = !!packageJson.scripts?.build;
        hasTypeScript = !!(packageJson.devDependencies?.typescript || packageJson.dependencies?.typescript);
      } catch (error) {
        // No package.json, check for tsconfig.json directly
        console.log('WorkflowOrchestrator: No package.json found');
      }

      // Check for tsconfig.json to determine if this is a TypeScript project
      const tsconfigPath = path.join(workingDir, 'tsconfig.json');
      let hasTsconfig = false;
      try {
        await fs.access(tsconfigPath);
        hasTsconfig = true;
      } catch {
        // No tsconfig.json
      }

      // Run npm install first if package.json exists
      // This ensures any new dependencies added by the CodingAgent are installed
      if (hasPackageJson) {
        console.log('WorkflowOrchestrator: Running npm install to install dependencies...');
        try {
          await execAsync('npm install', {
            cwd: workingDir,
            timeout: 180000, // 3 minute timeout for npm install
          });
          console.log('WorkflowOrchestrator: npm install completed');
        } catch (error: any) {
          const errorOutput = error.stdout || error.stderr || error.message;
          console.error('WorkflowOrchestrator: npm install failed:', errorOutput);
          return {
            success: false,
            error: `npm install failed: ${errorOutput.slice(0, 500)}`
          };
        }
      }

      // If there's a build script, use it
      if (hasBuildScript) {
        console.log('WorkflowOrchestrator: Running npm run build...');
        try {
          await execAsync('npm run build', {
            cwd: workingDir,
            timeout: 120000, // 2 minute timeout
          });
          console.log('WorkflowOrchestrator: Build succeeded');
          return { success: true };
        } catch (error: any) {
          const errorOutput = error.stdout || error.stderr || error.message;
          const errorLines = errorOutput.split('\n').filter((line: string) =>
            line.includes('error') || line.includes('Error') || line.includes('TS')
          ).slice(0, 10).join('\n');
          console.error('WorkflowOrchestrator: Build failed:', errorLines);
          return { success: false, error: errorLines || 'Build failed with unknown error' };
        }
      }

      // If it's a TypeScript project, run tsc --noEmit
      if (hasTypeScript || hasTsconfig) {
        console.log('WorkflowOrchestrator: No build script, running TypeScript check (npx tsc --noEmit)...');
        try {
          await execAsync('npx tsc --noEmit', {
            cwd: workingDir,
            timeout: 120000, // 2 minute timeout
          });
          console.log('WorkflowOrchestrator: TypeScript check passed');
          return { success: true };
        } catch (error: any) {
          const errorOutput = error.stdout || error.stderr || error.message;
          const errorLines = errorOutput.split('\n').filter((line: string) =>
            line.includes('error') || line.includes('Error') || line.includes('TS')
          ).slice(0, 10).join('\n');
          console.error('WorkflowOrchestrator: TypeScript check failed:', errorLines);
          return { success: false, error: errorLines || 'TypeScript check failed with unknown error' };
        }
      }

      // No build script and not a TypeScript project - skip verification
      console.log('WorkflowOrchestrator: No build script or TypeScript found, skipping verification');
      return { success: true };
    } catch (error: any) {
      console.error('WorkflowOrchestrator: Build verification failed:', error.message);
      return {
        success: false,
        error: error.message || 'Build verification failed with unknown error'
      };
    }
  }

  /**
   * Get agent sequence based on workflow type
   */
  private getAgentSequence(workflowType: string): string[] {
    const sequences: Record<string, string[]> = {
      feature: ['plan', 'code', 'test', 'review', 'document'],
      bugfix: ['plan', 'code', 'test', 'review'],
      refactor: ['plan', 'code', 'test', 'review', 'document'],
      documentation: ['document'],
      review: ['review'],
      new_module: ['scaffold'], // Scaffold module and create sub-workflows for implementation
    };

    return sequences[workflowType] || sequences.feature;
  }

  /**
   * Create agent_execution record
   */
  private async createAgentExecution(workflowId: number, agentType: string, input: AgentInput): Promise<number> {
    const db = getDbPool();
    const [result] = await db.execute(
      `INSERT INTO agent_executions (workflow_id, agent_type, status, input, started_at)
       VALUES (?, ?, 'running', ?, NOW())`,
      [workflowId, agentType, JSON.stringify(input)]
    );
    return (result as any).insertId;
  }

  /**
   * Update agent_execution record
   */
  private async updateAgentExecution(
    agentExecutionId: number,
    status: string,
    output: AgentOutput | null,
    errorMessage?: string
  ): Promise<void> {
    const db = getDbPool();
    // Truncate error message to 60000 chars (TEXT column limit is ~65KB)
    const truncatedError = errorMessage
      ? (errorMessage.length > 60000
          ? errorMessage.substring(0, 60000) + '\n\n[TRUNCATED - full error in output JSON]'
          : errorMessage)
      : null;
    await db.execute(
      `UPDATE agent_executions
       SET status = ?, output = ?, error_message = ?, completed_at = NOW()
       WHERE id = ?`,
      [status, output ? JSON.stringify(output) : null, truncatedError, agentExecutionId]
    );
  }

  /**
   * Execute an agent
   */
  private async executeAgent(agentType: string, input: AgentInput, _agentExecutionId: number): Promise<AgentOutput> {
    // Map agent type to module
    const agentModules: Record<string, string> = {
      plan: 'CodePlannerAgent',
      code: 'CodingAgent',
      test: 'CodeTestingAgent',
      review: 'CodeReviewAgent',
      document: 'CodeDocumentationAgent',
      scaffold: 'ModuleScaffoldAgent',
    };

    const moduleName = agentModules[agentType];
    if (!moduleName) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }

    // Environment variables will be passed to agents via input.env

    await this.logWorkflow(input.workflowId, 'info', `agent_${agentType}_executing`, `Executing ${moduleName}`);

    try {
      // Ensure environment variables are set in process.env before importing agent
      // This ensures agents can access them even if their .env files don't have them
      if (input.env) {
        for (const [key, value] of Object.entries(input.env)) {
          if (value) {
            process.env[key] = value;
          }
        }
      }

      // Dynamically import the agent module
      // Modules are in /home/kevin/Home/ex_nihilo/modules/, not in AIDeveloper/dist
      const modulePath = `file:///home/kevin/Home/ex_nihilo/modules/${moduleName}/index.js`;
      const agentModule = await import(modulePath);

      // Get the agent class (handle both default and named exports)
      const AgentClass = agentModule.default || agentModule[moduleName];

      if (!AgentClass) {
        throw new Error(`Could not find agent class in ${moduleName}`);
      }

      // Create instance and execute
      const agent = new AgentClass();
      const output = await agent.execute(input);

      return output;
    } catch (error) {
      throw new Error(`Failed to execute ${moduleName}: ${(error as Error).message}`);
    }
  }

  /**
   * Log workflow event
   */
  private async logWorkflow(
    workflowId: number,
    level: string,
    eventType: string,
    message: string,
    data?: any
  ): Promise<void> {
    try {
      const db = getDbPool();
      await db.execute(
        `INSERT INTO execution_logs (workflow_id, log_level, event_type, message, data, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [workflowId, level, eventType, message, data ? JSON.stringify(data) : null]
      );
    } catch (error) {
      console.error('Failed to log workflow event:', error);
    }
  }

  /**
   * Handle sub-workflow creation from structured plan
   * If the planning agent generated a structured plan, automatically create sub-workflows
   */
  private async handleSubWorkflowCreation(
    workflowId: number,
    artifacts: AgentOutput['artifacts']
  ): Promise<void> {
    try {
      // Look for structured_plan artifact
      const planArtifact = artifacts.find(a => a.type === 'structured_plan');
      if (!planArtifact) {
        return; // No structured plan, nothing to do
      }

      const structuredPlan = JSON.parse(planArtifact.content);
      
      // Check if workflow should auto-create sub-workflows
      const db = getDbPool();
      const [rows] = await db.execute(
        'SELECT auto_execute_children, branch_name, target_module FROM workflows WHERE id = ?',
        [workflowId]
      );
      const workflow = (rows as any[])[0];
      
      if (!workflow || workflow.auto_execute_children === false) {
        await this.logWorkflow(workflowId, 'info', 'sub_workflow_skipped', 'Auto-execution disabled, skipping sub-workflow creation');
        return;
      }

      // Save plan to workflow
      await db.execute(
        'UPDATE workflows SET plan_json = ?, updated_at = NOW() WHERE id = ?',
        [JSON.stringify(structuredPlan), workflowId]
      );

      await this.logWorkflow(workflowId, 'info', 'sub_workflow_plan_saved', `Saved structured plan with ${structuredPlan.subTasks?.length || 0} sub-tasks`);

      // Create sub-workflows if there are subtasks
      if (structuredPlan.subTasks && Array.isArray(structuredPlan.subTasks) && structuredPlan.subTasks.length > 0) {
        // Call the API to create sub-workflows
        const axios = (await import('axios')).default;
        const apiUrl = process.env.AIDEVELOPER_API_URL || 'http://localhost:3000';
        
        const response = await axios.post(`${apiUrl}/api/workflows/${workflowId}/sub-workflows`, {
          subTasks: structuredPlan.subTasks,
        });

        await this.logWorkflow(workflowId, 'info', 'sub_workflows_created', `Created ${structuredPlan.subTasks.length} sub-workflows from plan`, {
          childWorkflowIds: response.data?.data?.childWorkflowIds,
        });
      }
    } catch (error) {
      console.error('Failed to handle sub-workflow creation:', error);
      await this.logWorkflow(workflowId, 'error', 'sub_workflow_creation_failed', `Failed to create sub-workflows: ${(error as Error).message}`);
      // Don't throw - this is a non-critical enhancement
    }
  }

  /**
   * Create a sub-workflow to fix build errors
   * This runs Plan -> Code -> (verify build) to fix the issue
   */
  private async createBuildFixSubWorkflow(
    parentWorkflowId: number,
    workingDir: string,
    buildError: string,
    retryAttempt: number,
    parentInput: AgentInput
  ): Promise<number | null> {
    try {
      const db = getDbPool();

      // Get parent workflow info
      const [parentRows] = await db.execute(
        'SELECT branch_name, target_module, workflow_type FROM workflows WHERE id = ?',
        [parentWorkflowId]
      );
      const parentWorkflow = (parentRows as any[])[0];

      if (!parentWorkflow) {
        console.error('Parent workflow not found for build fix sub-workflow');
        return null;
      }

      // Create the fix sub-workflow
      const taskDescription = `Fix build error (attempt ${retryAttempt}/3): ${buildError}`;

      const [result] = await db.execute(
        `INSERT INTO workflows (
          workflow_type, status, branch_name, target_module,
          parent_workflow_id, execution_order, task_description,
          payload, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          'bugfix',
          'pending',
          parentWorkflow.branch_name,
          parentWorkflow.target_module,
          parentWorkflowId,
          retryAttempt, // Use retry attempt as execution order
          taskDescription,
          JSON.stringify({
            type: 'build_fix',
            buildError,
            retryAttempt,
            parentWorkflowId,
            workingDir,
          }),
        ]
      );

      const fixWorkflowId = (result as any).insertId;

      // Update parent workflow to indicate it's waiting for fix
      await db.execute(
        `UPDATE workflows SET status = 'pending_fix', updated_at = NOW() WHERE id = ?`,
        [parentWorkflowId]
      );

      // Execute the fix workflow asynchronously
      // This will trigger Plan -> Code -> Build verification
      setTimeout(async () => {
        try {
          await this.executeBuildFixWorkflow(
            fixWorkflowId,
            workingDir,
            taskDescription,
            buildError,
            retryAttempt,
            parentInput
          );
        } catch (error) {
          console.error('Failed to execute build fix workflow:', error);
          await this.logWorkflow(parentWorkflowId, 'error', 'build_fix_execution_failed',
            `Failed to execute build fix workflow #${fixWorkflowId}: ${(error as Error).message}`);
        }
      }, 100);

      return fixWorkflowId;
    } catch (error) {
      console.error('Failed to create build fix sub-workflow:', error);
      return null;
    }
  }

  /**
   * Execute a build fix sub-workflow
   * Runs: Plan (analyze error) -> Code (fix it) -> Verify build
   */
  private async executeBuildFixWorkflow(
    workflowId: number,
    workingDir: string,
    _taskDescription: string,
    buildError: string,
    retryAttempt: number,
    parentInput: AgentInput
  ): Promise<void> {
    const db = getDbPool();

    try {
      // Mark as running
      await db.execute(
        `UPDATE workflows SET status = 'running', started_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [workflowId]
      );

      await this.logWorkflow(workflowId, 'info', 'build_fix_started',
        `Starting build fix workflow (attempt ${retryAttempt})`, { buildError });

      // Get the repo directory
      const repoDir = workingDir.endsWith('/repo') ? workingDir : path.join(workingDir, 'repo');
      let codeWorkingDir = workingDir;
      try {
        await fs.access(repoDir);
        codeWorkingDir = repoDir;
      } catch {
        // Use workingDir as-is
      }

      // Create input for fix workflow
      const fixInput: AgentInput = {
        workflowId,
        workflowType: 'bugfix',
        targetModule: parentInput.targetModule,
        taskDescription: `Fix the following build error:\n\n${buildError}\n\nAnalyze the error and make the necessary code changes to fix it.`,
        workingDir: codeWorkingDir,
        metadata: {
          ...parentInput.metadata,
          buildRetryCount: retryAttempt,
          parentWorkflowId: parentInput.workflowId,
          buildError,
        },
        env: parentInput.env,
      };

      // Execute Plan agent
      await this.logWorkflow(workflowId, 'info', 'agent_plan_starting', 'Starting plan agent for build fix');
      const planExecutionId = await this.createAgentExecution(workflowId, 'plan', fixInput);

      try {
        const planOutput = await this.executeAgent('plan', fixInput, planExecutionId);
        await this.updateAgentExecution(planExecutionId, planOutput.success ? 'completed' : 'failed', planOutput);

        if (!planOutput.success) {
          throw new Error(`Plan agent failed: ${planOutput.summary}`);
        }

        await this.logWorkflow(workflowId, 'info', 'agent_plan_completed', 'Plan agent completed');
      } catch (error) {
        await this.updateAgentExecution(planExecutionId, 'failed', null, (error as Error).message);
        throw error;
      }

      // Execute Code agent
      await this.logWorkflow(workflowId, 'info', 'agent_code_starting', 'Starting code agent for build fix');
      const codeExecutionId = await this.createAgentExecution(workflowId, 'code', fixInput);

      try {
        const codeOutput = await this.executeAgent('code', fixInput, codeExecutionId);
        await this.updateAgentExecution(codeExecutionId, codeOutput.success ? 'completed' : 'failed', codeOutput);

        if (!codeOutput.success) {
          throw new Error(`Code agent failed: ${codeOutput.summary}`);
        }

        await this.logWorkflow(workflowId, 'info', 'agent_code_completed', 'Code agent completed');
      } catch (error) {
        await this.updateAgentExecution(codeExecutionId, 'failed', null, (error as Error).message);
        throw error;
      }

      // Verify build
      await this.logWorkflow(workflowId, 'info', 'build_verification_starting', 'Verifying build after fix');
      const buildResult = await this.verifyBuild(codeWorkingDir, workflowId);

      if (!buildResult.success) {
        // Build still failing
        await this.logWorkflow(workflowId, 'error', 'build_verification_failed',
          `Build still failing after fix attempt: ${buildResult.error}`);

        // Check if we can retry again
        if (retryAttempt < 3) {
          // Create another fix sub-workflow
          await this.logWorkflow(workflowId, 'info', 'creating_another_fix',
            `Creating another fix attempt (${retryAttempt + 1}/3)`);

          const nextFixId = await this.createBuildFixSubWorkflow(
            parentInput.workflowId,
            workingDir,
            buildResult.error!,
            retryAttempt + 1,
            parentInput
          );

          // Mark this fix workflow as completed (it tried)
          await db.execute(
            `UPDATE workflows SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = ?`,
            [workflowId]
          );

          await this.logWorkflow(workflowId, 'info', 'build_fix_completed_with_retry',
            `Build fix attempt completed, created next attempt #${nextFixId}`);
        } else {
          // Max retries reached
          await db.execute(
            `UPDATE workflows SET status = 'failed', completed_at = NOW(), updated_at = NOW() WHERE id = ?`,
            [workflowId]
          );

          // Also fail the parent workflow
          await db.execute(
            `UPDATE workflows SET status = 'failed', completed_at = NOW(), updated_at = NOW() WHERE id = ?`,
            [parentInput.workflowId]
          );

          await this.logWorkflow(workflowId, 'error', 'build_fix_max_retries',
            'Build fix failed after maximum retry attempts');
        }
      } else {
        // Build succeeded!
        await this.logWorkflow(workflowId, 'info', 'build_verification_passed', 'Build succeeded after fix!');

        // Mark fix workflow as completed
        await db.execute(
          `UPDATE workflows SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = ?`,
          [workflowId]
        );

        // Continue the parent workflow from where it left off (review, test, document)
        await this.continueParentWorkflow(parentInput.workflowId, workingDir, parentInput);
      }
    } catch (error) {
      console.error('Build fix workflow failed:', error);

      // Mark as failed
      await db.execute(
        `UPDATE workflows SET status = 'failed', completed_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [workflowId]
      );

      await this.logWorkflow(workflowId, 'error', 'build_fix_failed',
        `Build fix workflow failed: ${(error as Error).message}`);
    }
  }

  /**
   * Continue parent workflow after successful build fix
   * Runs the remaining agents (test, review, document)
   */
  private async continueParentWorkflow(
    parentWorkflowId: number,
    workingDir: string,
    originalInput: AgentInput
  ): Promise<void> {
    const db = getDbPool();

    try {
      await this.logWorkflow(parentWorkflowId, 'info', 'workflow_continuing',
        'Continuing workflow after successful build fix');

      // Update parent status back to running
      await db.execute(
        `UPDATE workflows SET status = 'running', updated_at = NOW() WHERE id = ?`,
        [parentWorkflowId]
      );

      // Get repo directory
      const repoDir = workingDir.endsWith('/repo') ? workingDir : path.join(workingDir, 'repo');
      let codeWorkingDir = workingDir;
      try {
        await fs.access(repoDir);
        codeWorkingDir = repoDir;
      } catch {
        // Use workingDir as-is
      }

      // Continue with remaining agents: test, review, document
      const remainingAgents = ['test', 'review', 'document'];
      let hasFailedAgent = false;

      for (const agentType of remainingAgents) {
        await this.logWorkflow(parentWorkflowId, 'info', `agent_${agentType}_starting`,
          `Starting ${agentType} agent (post-fix)`);

        const agentExecutionId = await this.createAgentExecution(parentWorkflowId, agentType, originalInput);

        try {
          const agentInput = {
            ...originalInput,
            workflowId: parentWorkflowId,
            workingDir: codeWorkingDir,
          };

          const agentOutput = await this.executeAgent(agentType, agentInput, agentExecutionId);

          if (!agentOutput.success) {
            hasFailedAgent = true;
            await this.updateAgentExecution(agentExecutionId, 'failed', agentOutput, agentOutput.summary);
            await this.logWorkflow(parentWorkflowId, 'warn', `agent_${agentType}_failed`,
              `${agentType} agent returned failure: ${agentOutput.summary}`);
            continue;
          }

          await this.updateAgentExecution(agentExecutionId, 'completed', agentOutput);
          await this.logWorkflow(parentWorkflowId, 'info', `agent_${agentType}_completed`,
            `${agentType} agent completed successfully`);
        } catch (error) {
          hasFailedAgent = true;
          await this.updateAgentExecution(agentExecutionId, 'failed', null, (error as Error).message);
          await this.logWorkflow(parentWorkflowId, 'error', `agent_${agentType}_error`,
            `${agentType} agent error: ${(error as Error).message}`);
        }
      }

      // Update parent workflow status
      const finalStatus = hasFailedAgent ? 'completed_with_warnings' : 'completed';
      await db.execute(
        `UPDATE workflows SET status = ?, completed_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [finalStatus, parentWorkflowId]
      );

      await this.logWorkflow(parentWorkflowId, 'info', 'workflow_completed',
        `Workflow completed (status: ${finalStatus})`);
    } catch (error) {
      console.error('Failed to continue parent workflow:', error);

      await db.execute(
        `UPDATE workflows SET status = 'failed', completed_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [parentWorkflowId]
      );

      await this.logWorkflow(parentWorkflowId, 'error', 'workflow_continuation_failed',
        `Failed to continue workflow: ${(error as Error).message}`);
    }
  }

  /**
   * Auto-commit changes after CodingAgent completes
   */
  private async autoCommitChanges(
    workingDir: string,
    workflowId: number,
    taskDescription: string
  ): Promise<{ committed: boolean; hash?: string; error?: string }> {
    try {
      // Check if there are changes to commit
      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: workingDir });

      if (!statusOutput.trim()) {
        console.log('WorkflowOrchestrator: No changes to commit');
        return { committed: false };
      }

      // Stage all changes
      await execAsync('git add -A', { cwd: workingDir });

      // Create commit message
      const shortDesc = taskDescription.length > 50
        ? taskDescription.substring(0, 47) + '...'
        : taskDescription;
      const commitMessage = `Workflow #${workflowId}: ${shortDesc}\n\nAuto-committed by WorkflowOrchestrator`;

      // Commit changes
      await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { cwd: workingDir });

      // Get commit hash
      const { stdout: hashOutput } = await execAsync('git rev-parse --short HEAD', { cwd: workingDir });
      const hash = hashOutput.trim();

      console.log(`WorkflowOrchestrator: Auto-committed changes: ${hash}`);
      return { committed: true, hash };
    } catch (error: any) {
      console.error('WorkflowOrchestrator: Auto-commit failed:', error.message);
      return { committed: false, error: error.message };
    }
  }

  /**
   * Auto-push changes to remote (called when root workflow completes)
   */
  private async autoPushChanges(
    workingDir: string,
    workflowId: number,
    branchName?: string
  ): Promise<{ pushed: boolean; error?: string }> {
    try {
      // Get current branch if not specified
      const branch = branchName || (await execAsync('git branch --show-current', { cwd: workingDir })).stdout.trim();

      if (!branch) {
        return { pushed: false, error: 'Could not determine current branch' };
      }

      // Check if there are commits to push
      try {
        const { stdout: localRef } = await execAsync('git rev-parse HEAD', { cwd: workingDir });
        const { stdout: remoteRef } = await execAsync(`git rev-parse origin/${branch}`, { cwd: workingDir });

        if (localRef.trim() === remoteRef.trim()) {
          console.log('WorkflowOrchestrator: Already up to date with remote');
          return { pushed: false };
        }
      } catch {
        // Remote branch may not exist yet, which is fine
      }

      // Push to remote
      await execAsync(`git push origin ${branch}`, { cwd: workingDir, timeout: 60000 });

      console.log(`WorkflowOrchestrator: Pushed to origin/${branch}`);
      await this.logWorkflow(workflowId, 'info', 'auto_push_success', `Pushed to origin/${branch}`);

      return { pushed: true };
    } catch (error: any) {
      console.error('WorkflowOrchestrator: Auto-push failed:', error.message);
      await this.logWorkflow(workflowId, 'warn', 'auto_push_failed', `Push failed: ${error.message}`);
      return { pushed: false, error: error.message };
    }
  }

  /**
   * Save checkpoint commit for a workflow
   * This allows resuming from the last successful point if later steps fail
   */
  private async saveCheckpoint(workflowId: number, commitHash: string): Promise<void> {
    try {
      const db = getDbPool();

      // Get the full commit hash (40 chars)
      let fullHash = commitHash;
      if (commitHash.length < 40) {
        try {
          const { stdout } = await execAsync(`git rev-parse ${commitHash}`, { timeout: 5000 });
          fullHash = stdout.trim();
        } catch {
          // Keep using short hash if we can't get full one
        }
      }

      await db.execute(
        `UPDATE workflows
         SET checkpoint_commit = ?, checkpoint_created_at = NOW()
         WHERE id = ?`,
        [fullHash, workflowId]
      );

      console.log(`WorkflowOrchestrator: Saved checkpoint ${fullHash.substring(0, 7)} for workflow #${workflowId}`);
      await this.logWorkflow(workflowId, 'info', 'checkpoint_saved',
        `Saved checkpoint: ${fullHash.substring(0, 7)}`, { commitHash: fullHash });
    } catch (error) {
      console.error('WorkflowOrchestrator: Failed to save checkpoint:', error);
      // Don't throw - checkpoint save is not critical for workflow success
    }
  }

}

export default WorkflowOrchestrator;


