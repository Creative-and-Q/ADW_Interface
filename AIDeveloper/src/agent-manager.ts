/**
 * Agent Manager
 * Manages lifecycle of worker agents
 */

import { EventEmitter } from 'events';
import { AgentType, AgentInput, AgentOutput, AgentStatus } from './types.js';
import { config } from './config.js';
import * as logger from './utils/logger.js';
import { communicationBus, MessageType } from './agent-communication.js';
import {
  createAgentExecution,
  updateAgentExecution,
} from './workflow-state.js';
// Import new standalone agent modules
import CodePlannerAgent from '../../modules/CodePlannerAgent/index.js';
import CodingAgent from '../../modules/CodingAgent/index.js';
import CodeReviewAgent from '../../modules/CodeReviewAgent/index.js';
import CodeTestingAgent from '../../modules/CodeTestingAgent/index.js';
import CodeDocumentationAgent from '../../modules/CodeDocumentationAgent/index.js';
// Keep SecurityLintAgent for now (not replaced yet)
import { SecurityLintAgent } from './agents/security-lint-agent.js';

/**
 * Agent handle for tracking running agents
 */
interface AgentHandle {
  id: string;
  type: AgentType;
  workflowId: number;
  executionId: number;
  status: AgentStatus;
  input: AgentInput;
  output?: AgentOutput;
  error?: Error;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Agent Manager
 * For Phase 3, we implement a simplified in-process agent execution
 * Phase 4+ can extend this to use child processes or workers
 */
export class AgentManager extends EventEmitter {
  private agents: Map<string, AgentHandle>;
  private maxConcurrent: number;
  private runningCount: number;
  private agentCounter: number;

  constructor(maxConcurrent: number = config.agents.maxConcurrent) {
    super();
    this.agents = new Map();
    this.maxConcurrent = maxConcurrent;
    this.runningCount = 0;
    this.agentCounter = 0;
  }

  /**
   * Generate unique agent ID
   */
  private generateAgentId(type: AgentType): string {
    this.agentCounter++;
    return `${type}-${Date.now()}-${this.agentCounter}`;
  }

  /**
   * Check if we can spawn new agent
   */
  canSpawnAgent(): boolean {
    return this.runningCount < this.maxConcurrent;
  }

  /**
   * Spawn agent (in-process execution for Phase 3)
   */
  async spawnAgent(
    agentType: AgentType,
    input: AgentInput
  ): Promise<string> {
    if (!this.canSpawnAgent()) {
      throw new Error(
        `Max concurrent agents reached (${this.maxConcurrent})`
      );
    }

    const agentId = this.generateAgentId(agentType);

    // Create execution record
    const executionId = await createAgentExecution(
      input.workflowId,
      agentType,
      input
    );

    const handle: AgentHandle = {
      id: agentId,
      type: agentType,
      workflowId: input.workflowId,
      executionId,
      status: AgentStatus.PENDING,
      input,
      startedAt: new Date(),
    };

    this.agents.set(agentId, handle);
    this.runningCount++;

    logger.info('Agent spawned', {
      agentId,
      type: agentType,
      workflowId: input.workflowId,
      executionId,
    });

    // Execute agent asynchronously
    this.executeAgent(agentId).catch((error) => {
      logger.error('Agent execution error', error);
    });

    return agentId;
  }

  /**
   * Execute agent (in-process for Phase 3)
   */
  private async executeAgent(agentId: string): Promise<void> {
    const handle = this.agents.get(agentId);
    if (!handle) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    try {
      // Update status to running
      handle.status = AgentStatus.RUNNING;
      await updateAgentExecution(handle.executionId, AgentStatus.RUNNING);

      logger.info('Agent started', {
        agentId,
        type: handle.type,
        workflowId: handle.workflowId,
        executionId: handle.executionId,
      });

      // Execute real agent (Phase 4)
      const output = await this.executeRealAgent(handle);

      // Update handle
      handle.output = output;
      handle.status = AgentStatus.COMPLETED;
      handle.completedAt = new Date();

      // Update database
      await updateAgentExecution(
        handle.executionId,
        AgentStatus.COMPLETED,
        output
      );

      logger.info('Agent completed', {
        agentId,
        type: handle.type,
        workflowId: handle.workflowId,
        executionId: handle.executionId,
        duration: handle.completedAt.getTime() - handle.startedAt.getTime(),
      });

      // Emit completion event
      this.emit('agent:completed', agentId, output);
    } catch (error) {
      const err = error as Error;
      handle.error = err;
      handle.status = AgentStatus.FAILED;
      handle.completedAt = new Date();

      await updateAgentExecution(
        handle.executionId,
        AgentStatus.FAILED,
        undefined,
        err.message
      );

      logger.error('Agent failed', err, {
        agentId,
        type: handle.type,
      });

      this.emit('agent:failed', agentId, err);
    } finally {
      this.runningCount--;
    }
  }

  /**
   * Execute real agent implementation
   */
  private async executeRealAgent(
    handle: AgentHandle
  ): Promise<AgentOutput> {
    // Instantiate the appropriate agent based on type
    let agent: { execute: (input: any) => Promise<any> };

    switch (handle.type) {
      case AgentType.PLAN:
        agent = new CodePlannerAgent();
        break;
      case AgentType.CODE:
        agent = new CodingAgent();
        break;
      case AgentType.SECURITY_LINT:
        agent = new SecurityLintAgent();
        break;
      case AgentType.TEST:
        agent = new CodeTestingAgent();
        break;
      case AgentType.REVIEW:
        agent = new CodeReviewAgent();
        break;
      case AgentType.DOCUMENT:
        agent = new CodeDocumentationAgent();
        break;
      default:
        throw new Error(`Unknown agent type: ${handle.type}`);
    }

    // Execute the agent
    logger.debug('Executing agent', {
      type: handle.type,
      workflowId: handle.workflowId,
    });

    // Ensure workingDir is provided (required by new agents)
    if (!handle.input.workingDir) {
      throw new Error(`workingDir is required for agent type ${handle.type}`);
    }

    const output = await agent.execute(handle.input);

    // Adapt the output to include workflowId in artifacts
    const adaptedOutput: AgentOutput = {
      ...output,
      artifacts: output.artifacts.map((artifact: any) => ({
        ...artifact,
        workflowId: handle.workflowId,
      })),
    };

    return adaptedOutput;
  }

  /**
   * Get agent status
   */
  getAgentStatus(agentId: string): AgentStatus | null {
    const handle = this.agents.get(agentId);
    return handle ? handle.status : null;
  }

  /**
   * Get agent handle
   */
  getAgent(agentId: string): AgentHandle | null {
    return this.agents.get(agentId) || null;
  }

  /**
   * Wait for agent completion
   */
  async waitForAgent(agentId: string, timeout?: number): Promise<AgentOutput> {
    const handle = this.agents.get(agentId);
    if (!handle) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // If already completed, return immediately
    if (handle.status === AgentStatus.COMPLETED) {
      return handle.output!;
    }

    if (handle.status === AgentStatus.FAILED) {
      throw handle.error || new Error('Agent failed');
    }

    // Wait for completion
    return new Promise<AgentOutput>((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;

      if (timeout) {
        timer = setTimeout(() => {
          this.removeListener('agent:completed', completedListener);
          this.removeListener('agent:failed', failedListener);
          reject(new Error(`Agent timeout: ${agentId}`));
        }, timeout);
      }

      const completedListener = (id: string, output: AgentOutput) => {
        if (id === agentId) {
          if (timer) clearTimeout(timer);
          this.removeListener('agent:completed', completedListener);
          this.removeListener('agent:failed', failedListener);
          resolve(output);
        }
      };

      const failedListener = (id: string, error: Error) => {
        if (id === agentId) {
          if (timer) clearTimeout(timer);
          this.removeListener('agent:completed', completedListener);
          this.removeListener('agent:failed', failedListener);
          reject(error);
        }
      };

      this.once('agent:completed', completedListener);
      this.once('agent:failed', failedListener);
    });
  }

  /**
   * Kill agent
   */
  async killAgent(agentId: string): Promise<void> {
    const handle = this.agents.get(agentId);
    if (!handle) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // For in-process execution, we can't really kill it
    // But we can mark it as failed
    if (
      handle.status === AgentStatus.PENDING ||
      handle.status === AgentStatus.RUNNING
    ) {
      handle.status = AgentStatus.FAILED;
      handle.error = new Error('Agent killed');
      handle.completedAt = new Date();

      await updateAgentExecution(
        handle.executionId,
        AgentStatus.FAILED,
        undefined,
        'Agent killed'
      );

      this.runningCount--;

      logger.warn('Agent killed', { agentId });
    }
  }

  /**
   * Send message to agent
   */
  async sendMessage(agentId: string, message: any): Promise<void> {
    const handle = this.agents.get(agentId);
    if (!handle) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    await communicationBus.sendToAgent(
      agentId,
      'orchestrator',
      MessageType.REQUEST,
      message
    );
  }

  /**
   * Receive message from agent
   */
  async receiveMessage(agentId: string, timeout?: number): Promise<any> {
    const message = await communicationBus.receiveMessage(
      'orchestrator',
      timeout || 5000
    );

    if (!message || message.from !== agentId) {
      return null;
    }

    return message.payload;
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    running: number;
    completed: number;
    failed: number;
    pending: number;
  } {
    const stats = {
      total: this.agents.size,
      running: 0,
      completed: 0,
      failed: 0,
      pending: 0,
    };

    for (const handle of this.agents.values()) {
      switch (handle.status) {
        case AgentStatus.RUNNING:
          stats.running++;
          break;
        case AgentStatus.COMPLETED:
          stats.completed++;
          break;
        case AgentStatus.FAILED:
          stats.failed++;
          break;
        case AgentStatus.PENDING:
          stats.pending++;
          break;
      }
    }

    return stats;
  }

  /**
   * Cleanup completed agents
   */
  cleanup(): void {
    const toRemove: string[] = [];

    for (const [agentId, handle] of this.agents.entries()) {
      if (
        handle.status === AgentStatus.COMPLETED ||
        handle.status === AgentStatus.FAILED
      ) {
        // Keep agents for at least 1 minute after completion
        const age =
          Date.now() - (handle.completedAt?.getTime() || Date.now());
        if (age > 60000) {
          toRemove.push(agentId);
        }
      }
    }

    for (const agentId of toRemove) {
      this.agents.delete(agentId);
      communicationBus.clearMessages(agentId);
    }

    if (toRemove.length > 0) {
      logger.debug('Cleaned up agents', { count: toRemove.length });
    }
  }

  /**
   * Destroy manager and cleanup
   */
  destroy(): void {
    this.agents.clear();
    this.removeAllListeners();
    logger.info('Agent manager destroyed');
  }
}

/**
 * Global agent manager instance
 */
export const agentManager = new AgentManager();
