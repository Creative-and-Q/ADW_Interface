/**
 * Execution Logger
 * Structured logging system for agent and workflow executions
 * Stores detailed JSON logs in database for frontend display
 */

import { insert } from '../database.js';
import * as logger from './logger.js';

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Event types for structured logging
 */
export enum EventType {
  // Lifecycle events
  AGENT_START = 'agent_start',
  AGENT_COMPLETE = 'agent_complete',
  AGENT_FAILED = 'agent_failed',
  WORKFLOW_START = 'workflow_start',
  WORKFLOW_COMPLETE = 'workflow_complete',
  WORKFLOW_FAILED = 'workflow_failed',

  // Agent actions
  API_CALL = 'api_call',
  API_RESPONSE = 'api_response',
  FILE_READ = 'file_read',
  FILE_WRITE = 'file_write',
  FILE_DELETE = 'file_delete',
  GIT_OPERATION = 'git_operation',
  CODEBASE_ANALYSIS = 'codebase_analysis',
  PLAN_GENERATED = 'plan_generated',
  CODE_GENERATED = 'code_generated',
  TEST_EXECUTED = 'test_executed',
  REVIEW_COMPLETED = 'review_completed',
  DOCS_GENERATED = 'docs_generated',

  // Error events
  EXCEPTION = 'exception',
  VALIDATION_ERROR = 'validation_error',
  TIMEOUT = 'timeout',
  RETRY_ATTEMPT = 'retry_attempt',

  // Generic
  STEP = 'step',
  INFO = 'info',
  WARNING = 'warning',
}

/**
 * Structured log entry
 */
export interface ExecutionLogEntry {
  workflowId: number;
  agentExecutionId?: number;
  level: LogLevel;
  eventType: EventType;
  message: string;
  data?: any;
  stackTrace?: string;
}

/**
 * Execution Logger Class
 * Provides context-aware logging for agents
 */
export class ExecutionLogger {
  private workflowId: number;
  private agentExecutionId?: number;
  private agentType?: string;

  constructor(workflowId: number, agentExecutionId?: number, agentType?: string) {
    this.workflowId = workflowId;
    this.agentExecutionId = agentExecutionId;
    this.agentType = agentType;
  }

  /**
   * Log an entry to the database
   */
  private async logToDatabase(entry: ExecutionLogEntry): Promise<void> {
    try {
      await insert('execution_logs', {
        workflow_id: entry.workflowId,
        agent_execution_id: entry.agentExecutionId || null,
        log_level: entry.level,
        event_type: entry.eventType,
        message: entry.message,
        data: entry.data ? JSON.stringify(entry.data) : null,
        stack_trace: entry.stackTrace || null,
      });
    } catch (error) {
      // Fallback to winston logger if database insert fails
      logger.error('Failed to write execution log to database', error as Error, {
        entry,
      });
    }
  }

  /**
   * Log an entry (both to file and database)
   */
  async log(
    level: LogLevel,
    eventType: EventType,
    message: string,
    data?: any,
    error?: Error
  ): Promise<void> {
    const entry: ExecutionLogEntry = {
      workflowId: this.workflowId,
      agentExecutionId: this.agentExecutionId,
      level,
      eventType,
      message,
      data: data || undefined,
      stackTrace: error?.stack,
    };

    // Log to database for frontend display
    await this.logToDatabase(entry);

    // Also log to winston for file storage
    const logData: any = {
      workflowId: this.workflowId,
      agentExecutionId: this.agentExecutionId,
      agentType: this.agentType,
      eventType,
      ...data,
    };

    switch (level) {
      case LogLevel.DEBUG:
        logger.debug(message, logData);
        break;
      case LogLevel.INFO:
        logger.info(message, logData);
        break;
      case LogLevel.WARN:
        logger.warn(message, logData);
        break;
      case LogLevel.ERROR:
        logger.error(message, error, logData);
        break;
    }
  }

  /**
   * Log debug message
   */
  async debug(eventType: EventType, message: string, data?: any): Promise<void> {
    await this.log(LogLevel.DEBUG, eventType, message, data);
  }

  /**
   * Log info message
   */
  async info(eventType: EventType, message: string, data?: any): Promise<void> {
    await this.log(LogLevel.INFO, eventType, message, data);
  }

  /**
   * Log warning message
   */
  async warn(eventType: EventType, message: string, data?: any): Promise<void> {
    await this.log(LogLevel.WARN, eventType, message, data);
  }

  /**
   * Log error message
   */
  async error(eventType: EventType, message: string, error?: Error, data?: any): Promise<void> {
    await this.log(LogLevel.ERROR, eventType, message, { ...data }, error);
  }

  /**
   * Log agent start
   */
  async logAgentStart(input: any): Promise<void> {
    await this.info(EventType.AGENT_START, `Agent started: ${this.agentType}`, {
      agentType: this.agentType,
      input,
    });
  }

  /**
   * Log agent completion
   */
  async logAgentComplete(output: any, duration: number): Promise<void> {
    await this.info(EventType.AGENT_COMPLETE, `Agent completed: ${this.agentType}`, {
      agentType: this.agentType,
      output,
      duration,
    });
  }

  /**
   * Log agent failure
   */
  async logAgentFailed(error: Error): Promise<void> {
    await this.error(
      EventType.AGENT_FAILED,
      `Agent failed: ${this.agentType}`,
      error,
      {
        agentType: this.agentType,
      }
    );
  }

  /**
   * Log API call
   */
  async logAPICall(provider: string, model: string, request: any): Promise<void> {
    await this.info(EventType.API_CALL, `Calling ${provider} API: ${model}`, {
      provider,
      model,
      request: {
        messages: request.messages?.length || 0,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      },
    });
  }

  /**
   * Log API response
   */
  async logAPIResponse(provider: string, model: string, response: any, duration: number): Promise<void> {
    await this.info(EventType.API_RESPONSE, `Received ${provider} API response: ${model}`, {
      provider,
      model,
      duration,
      response: {
        length: response?.length || 0,
        tokensUsed: response?.tokensUsed,
      },
    });
  }

  /**
   * Log file operation
   */
  async logFileOperation(operation: 'read' | 'write' | 'delete', filePath: string, data?: any): Promise<void> {
    const eventTypeMap = {
      read: EventType.FILE_READ,
      write: EventType.FILE_WRITE,
      delete: EventType.FILE_DELETE,
    };

    await this.info(eventTypeMap[operation], `File ${operation}: ${filePath}`, {
      operation,
      filePath,
      ...data,
    });
  }

  /**
   * Log git operation
   */
  async logGitOperation(operation: string, data?: any): Promise<void> {
    await this.info(EventType.GIT_OPERATION, `Git operation: ${operation}`, {
      operation,
      ...data,
    });
  }

  /**
   * Log plan generation
   */
  async logPlanGenerated(plan: any): Promise<void> {
    await this.info(EventType.PLAN_GENERATED, 'Plan generated successfully', {
      steps: plan.steps?.length || 0,
      files: {
        create: plan.files?.create?.length || 0,
        modify: plan.files?.modify?.length || 0,
        delete: plan.files?.delete?.length || 0,
      },
      complexity: plan.complexity,
    });
  }

  /**
   * Log code generation
   */
  async logCodeGenerated(files: string[]): Promise<void> {
    await this.info(EventType.CODE_GENERATED, `Code generated for ${files.length} file(s)`, {
      filesCount: files.length,
      files,
    });
  }

  /**
   * Log test execution
   */
  async logTestExecuted(results: any): Promise<void> {
    await this.info(EventType.TEST_EXECUTED, 'Tests executed', {
      passed: results.passed,
      failed: results.failed,
      total: results.total,
      coverage: results.coverage,
    });
  }

  /**
   * Log review completion
   */
  async logReviewCompleted(review: any): Promise<void> {
    await this.info(EventType.REVIEW_COMPLETED, 'Code review completed', {
      issuesFound: review.issues?.length || 0,
      severity: review.severity,
      approved: review.approved,
    });
  }

  /**
   * Log documentation generation
   */
  async logDocsGenerated(files: string[]): Promise<void> {
    await this.info(EventType.DOCS_GENERATED, `Documentation generated for ${files.length} file(s)`, {
      filesCount: files.length,
      files,
    });
  }

  /**
   * Log exception with full context
   */
  async logException(error: Error, context?: any): Promise<void> {
    await this.error(EventType.EXCEPTION, `Exception: ${error.message}`, error, {
      name: error.name,
      context,
    });
  }

  /**
   * Log validation error
   */
  async logValidationError(message: string, data?: any): Promise<void> {
    await this.error(EventType.VALIDATION_ERROR, `Validation error: ${message}`, undefined, data);
  }

  /**
   * Log timeout
   */
  async logTimeout(operation: string, timeoutMs: number): Promise<void> {
    await this.error(EventType.TIMEOUT, `Operation timed out: ${operation}`, undefined, {
      operation,
      timeoutMs,
    });
  }

  /**
   * Log retry attempt
   */
  async logRetryAttempt(operation: string, attempt: number, maxAttempts: number, error?: Error): Promise<void> {
    await this.warn(EventType.RETRY_ATTEMPT, `Retry attempt ${attempt}/${maxAttempts}: ${operation}`, {
      operation,
      attempt,
      maxAttempts,
      error: error?.message,
    });
  }

  /**
   * Log workflow step
   */
  async logStep(step: string, data?: any): Promise<void> {
    await this.info(EventType.STEP, `Step: ${step}`, data);
  }

  /**
   * Log codebase analysis
   */
  async logCodebaseAnalysis(stats: any): Promise<void> {
    await this.info(EventType.CODEBASE_ANALYSIS, 'Codebase analyzed', stats);
  }
}

/**
 * Create a new execution logger instance
 */
export function createExecutionLogger(
  workflowId: number,
  agentExecutionId?: number,
  agentType?: string
): ExecutionLogger {
  return new ExecutionLogger(workflowId, agentExecutionId, agentType);
}

/**
 * Get execution logs for a workflow
 */
export async function getExecutionLogs(
  workflowId: number,
  agentExecutionId?: number,
  limit?: number
): Promise<any[]> {
  const { query } = await import('../database.js');

  let sql = 'SELECT * FROM execution_logs WHERE workflow_id = ?';
  const params: any[] = [workflowId];

  if (agentExecutionId) {
    sql += ' AND agent_execution_id = ?';
    params.push(agentExecutionId);
  }

  sql += ' ORDER BY created_at ASC';

  if (limit) {
    sql += ` LIMIT ${limit}`;
  }

  const results = await query<any[]>(sql, params);

  return results.map(row => ({
    id: row.id,
    workflowId: row.workflow_id,
    agentExecutionId: row.agent_execution_id,
    level: row.log_level,
    eventType: row.event_type,
    message: row.message,
    data: row.data ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : undefined,
    stackTrace: row.stack_trace,
    timestamp: row.created_at,
  }));
}
