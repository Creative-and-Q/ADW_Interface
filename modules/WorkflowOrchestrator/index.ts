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
  targetModule?: string;           // Primary module (backwards compatibility)
  targetModules?: string[];        // All target modules for cross-module workflows
  taskDescription?: string;
  branchName?: string;
  workingDir: string; // Required
  metadata?: Record<string, any>;
  context?: Record<string, any>;
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
   * Execute the orchestrator agent
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
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
          // Execute the agent
          const agentOutput = await this.executeAgent(agentType, input, agentExecutionId);

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
    };

    const moduleName = agentModules[agentType];
    if (!moduleName) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }

    await this.logWorkflow(input.workflowId, 'info', `agent_${agentType}_executing`, `Executing ${moduleName}`);

    try {
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
        `INSERT INTO execution_logs (workflow_id, level, event_type, message, data, timestamp)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [workflowId, level, eventType, message, data ? JSON.stringify(data) : null]
      );
    } catch (error) {
      console.error('Failed to log workflow event:', error);
    }
  }

}

export default WorkflowOrchestrator;


