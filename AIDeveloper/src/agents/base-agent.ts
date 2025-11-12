/**
 * Base agent class
 * Abstract class that all worker agents extend
 */

import axios from 'axios';
import { config } from '../config.js';
import {
  AgentType,
  AgentInput,
  AgentOutput,
  AgentStatus,
  AIMessage,
  OpenRouterRequestOptions,
  Artifact,
} from '../types.js';
import * as logger from '../utils/logger.js';
import { insert, update, query } from '../database.js';
import { ExecutionLogger, createExecutionLogger } from '../utils/execution-logger.js';

export abstract class BaseAgent {
  protected agentType: AgentType;
  protected model: string;
  protected executionId?: number;
  protected workflowId?: number;
  protected startTime?: number;
  protected executionLogger?: ExecutionLogger;

  constructor(agentType: AgentType, model: string) {
    this.agentType = agentType;
    this.model = model;
  }

  /**
   * Abstract method that must be implemented by subclasses
   * This is the main execution logic for each agent
   */
  abstract execute(input: AgentInput): Promise<AgentOutput>;

  /**
   * Initialize agent execution in database
   */
  protected async initializeExecution(input: AgentInput): Promise<number> {
    this.workflowId = input.workflowId;
    this.startTime = Date.now();

    this.executionId = await insert('agent_executions', {
      workflow_id: input.workflowId,
      agent_type: this.agentType,
      status: AgentStatus.RUNNING,
      input: JSON.stringify(input),
      started_at: new Date(),
      retry_count: 0,
    });

    // Create execution logger
    this.executionLogger = createExecutionLogger(
      input.workflowId,
      this.executionId,
      this.agentType
    );

    // Log agent start with structured logging
    await this.executionLogger.logAgentStart(input);

    logger.logAgentStart(this.agentType, input.workflowId, this.executionId);
    return this.executionId;
  }

  /**
   * Update agent execution status
   */
  protected async updateExecutionStatus(
    status: AgentStatus,
    output?: AgentOutput,
    errorMessage?: string
  ): Promise<void> {
    if (!this.executionId) {
      throw new Error('Execution not initialized');
    }

    const duration = this.startTime ? Date.now() - this.startTime : 0;

    await update(
      'agent_executions',
      {
        status,
        output: output ? JSON.stringify(output) : null,
        error_message: errorMessage || null,
        completed_at: new Date(),
      },
      'id = ?',
      [this.executionId]
    );

    // Log completion or failure with structured logging
    if (status === AgentStatus.COMPLETED && this.workflowId && this.executionLogger) {
      await this.executionLogger.logAgentComplete(output, duration);
      logger.logAgentComplete(this.agentType, this.workflowId, this.executionId, duration);
    } else if (status === AgentStatus.FAILED && this.workflowId && this.executionLogger) {
      const error = new Error(errorMessage || 'Agent execution failed');
      await this.executionLogger.logAgentFailed(error);
      logger.logAgentFailure(this.agentType, this.workflowId, this.executionId, error);
    }
  }

  /**
   * Save artifact to database
   */
  protected async saveArtifact(artifact: Artifact): Promise<number> {
    if (!this.executionId || !this.workflowId) {
      throw new Error('Execution not initialized');
    }

    const artifactId = await insert('artifacts', {
      workflow_id: this.workflowId,
      agent_execution_id: this.executionId,
      artifact_type: artifact.type,
      file_path: artifact.filePath || null,
      content: artifact.content,
      metadata: artifact.metadata ? JSON.stringify(artifact.metadata) : null,
    });

    logger.debug(`Saved artifact: ${artifact.type}`, {
      artifactId,
      executionId: this.executionId,
    });

    return artifactId;
  }

  /**
   * Get artifacts from previous agent executions
   */
  protected async getArtifacts(workflowId: number): Promise<Artifact[]> {
    const results = await query<any[]>(
      `SELECT * FROM artifacts WHERE workflow_id = ? ORDER BY created_at ASC`,
      [workflowId]
    );

    return results.map(row => ({
      id: row.id,
      workflowId: row.workflow_id,
      agentExecutionId: row.agent_execution_id,
      type: row.artifact_type,
      filePath: row.file_path,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
    }));
  }

  /**
   * Call OpenRouter API with messages
   */
  protected async callOpenRouter(
    messages: AIMessage[],
    options?: Partial<OpenRouterRequestOptions>
  ): Promise<string> {
    const startTime = Date.now();

    try {
      const requestOptions: OpenRouterRequestOptions = {
        model: options?.model || this.model,
        maxTokens: options?.maxTokens || 4096,
        temperature: options?.temperature || 0.7,
        systemPrompt: options?.systemPrompt,
        stopSequences: options?.stopSequences,
      };

      logger.debug(`Calling OpenRouter API with model: ${requestOptions.model}`);

      // Log API call with structured logging
      if (this.executionLogger) {
        await this.executionLogger.logAPICall('OpenRouter', requestOptions.model, {
          messages: messages.length,
          maxTokens: requestOptions.maxTokens,
          temperature: requestOptions.temperature,
        });
      }

      // Prepare messages for OpenRouter
      const apiMessages = [...messages];

      // Add system message if provided
      if (requestOptions.systemPrompt) {
        apiMessages.unshift({
          role: 'system',
          content: requestOptions.systemPrompt,
        });
      }

      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: requestOptions.model,
          messages: apiMessages,
          max_tokens: requestOptions.maxTokens,
          temperature: requestOptions.temperature,
          stop: requestOptions.stopSequences,
        },
        {
          headers: {
            'Authorization': `Bearer ${config.openrouter.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'AIDeveloper',
          },
        }
      );

      const textContent = response.data.choices[0]?.message?.content || '';
      const duration = Date.now() - startTime;

      logger.debug(`OpenRouter API response received: ${textContent.length} characters`);

      // Log API response with structured logging
      if (this.executionLogger) {
        await this.executionLogger.logAPIResponse('OpenRouter', requestOptions.model, {
          length: textContent.length,
          tokensUsed: response.data.usage,
        }, duration);
      }

      return textContent;
    } catch (error) {
      logger.error('OpenRouter API call failed', error as Error);

      // Log exception with structured logging
      if (this.executionLogger) {
        await this.executionLogger.logException(error as Error, {
          operation: 'OpenRouter API call',
          model: options?.model || this.model,
        });
      }

      throw error;
    }
  }

  /**
   * Run agent with automatic error handling and status updates
   */
  async run(input: AgentInput): Promise<AgentOutput> {
    try {
      // Initialize execution
      await this.initializeExecution(input);

      // Execute agent logic with timeout
      const output = await this.executeWithTimeout(this.execute(input));

      // Update status to completed
      await this.updateExecutionStatus(AgentStatus.COMPLETED, output);

      return output;
    } catch (error) {
      // Log exception details
      if (this.executionLogger) {
        await this.executionLogger.logException(error as Error, {
          agentType: this.agentType,
          workflowId: this.workflowId,
          executionId: this.executionId,
        });
      }

      // Update status to failed
      await this.updateExecutionStatus(
        AgentStatus.FAILED,
        undefined,
        (error as Error).message
      );

      // Re-throw error
      throw error;
    }
  }

  /**
   * Load system prompt from file or string
   */
  protected async loadSystemPrompt(promptFile?: string): Promise<string> {
    if (promptFile) {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const promptPath = path.join(
          config.workspace.root,
          'AIDeveloper',
          'config',
          'agent-prompts',
          promptFile
        );
        return await fs.readFile(promptPath, 'utf-8');
      } catch (error) {
        logger.warn(`Failed to load prompt file: ${promptFile}`, {
          error: (error as Error).message,
        });
        return this.getDefaultSystemPrompt();
      }
    }
    return this.getDefaultSystemPrompt();
  }

  /**
   * Get default system prompt for agent
   * Override in subclasses to provide agent-specific prompts
   */
  protected getDefaultSystemPrompt(): string {
    return `You are an AI agent of type ${this.agentType} in an automated development workflow system.`;
  }

  /**
   * Validate agent input
   */
  protected validateInput(input: AgentInput): void {
    if (!input.workflowId) {
      throw new Error('Missing required input: workflowId');
    }
    if (!input.workflowType) {
      throw new Error('Missing required input: workflowType');
    }
    if (!input.taskDescription) {
      throw new Error('Missing required input: taskDescription');
    }
  }

  /**
   * Handle timeout
   */
  protected async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = config.agents.timeoutMs
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(async () => {
        // Log timeout with structured logging
        if (this.executionLogger) {
          await this.executionLogger.logTimeout('Agent execution', timeoutMs);
        }
        reject(new Error(`Agent execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      // Clear timeout if promise completes successfully
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      return result;
    } catch (error) {
      // Clear timeout if promise fails
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      throw error;
    }
  }
}
