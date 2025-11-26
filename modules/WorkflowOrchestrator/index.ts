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
 * WorkflowOrchestrator Agent
 */
export class WorkflowOrchestrator {
  constructor() {
    // Orchestrator doesn't need API key for now
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

    const allArtifacts: any[] = [];
    const allSummaries: string[] = [];
    let hasFailedAgent = false;

    try {
      // Determine agent sequence based on workflow type
      const agentSequence = this.getAgentSequence(input.workflowType || 'feature');

      await this.logWorkflow(input.workflowId, 'info', 'workflow_started', `Starting workflow with ${agentSequence.length} agents`, {
        agentSequence,
        workflowType: input.workflowType,
      });

      // Execute agents in sequence
      for (let i = 0; i < agentSequence.length; i++) {
        const agentType = agentSequence[i];

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
          const agentInput = {
            ...input,
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

          // Update agent execution as completed
          await this.updateAgentExecution(agentExecutionId, 'completed', agentOutput);

          // Collect artifacts and summaries
          allArtifacts.push(...agentOutput.artifacts);
          allSummaries.push(`${agentType}: ${agentOutput.summary}`);

          await this.logWorkflow(input.workflowId, 'info', `agent_${agentType}_completed`, `${agentType} agent completed successfully`, {
            artifactsCount: agentOutput.artifacts.length,
          });

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
    await db.execute(
      `UPDATE agent_executions
       SET status = ?, output = ?, error_message = ?, completed_at = NOW()
       WHERE id = ?`,
      [status, output ? JSON.stringify(output) : null, errorMessage || null, agentExecutionId]
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

}

export default WorkflowOrchestrator;


