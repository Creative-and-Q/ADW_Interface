/**
 * Logging utility using Winston
 * Provides structured logging with file rotation
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import chalk from 'chalk';
import path from 'path';
import { config } from '../config.js';

// Custom format for console output with colors
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const coloredLevel = {
      error: chalk.red(level.toUpperCase()),
      warn: chalk.yellow(level.toUpperCase()),
      info: chalk.blue(level.toUpperCase()),
      debug: chalk.gray(level.toUpperCase()),
    }[level] || level.toUpperCase();

    let output = `${chalk.gray(timestamp)} ${coloredLevel} ${message}`;

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      output += `\n${chalk.gray(JSON.stringify(meta, null, 2))}`;
    }

    return output;
  })
);

// Format for file output (JSON)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
    }),

    // File transport for errors
    new DailyRotateFile({
      filename: path.join(config.logging.dir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat,
    }),

    // File transport for all logs
    new DailyRotateFile({
      filename: path.join(config.logging.dir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat,
    }),
  ],
});

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: Record<string, any>): winston.Logger {
  return logger.child(context);
}

/**
 * Log debug message
 */
export function debug(message: string, meta?: Record<string, any>): void {
  logger.debug(message, meta);
}

/**
 * Log info message
 */
export function info(message: string, meta?: Record<string, any>): void {
  logger.info(message, meta);
}

/**
 * Log warning message
 */
export function warn(message: string, meta?: Record<string, any>): void {
  logger.warn(message, meta);
}

/**
 * Log error message
 */
export function error(message: string, error?: Error, meta?: Record<string, any>): void {
  logger.error(message, {
    ...meta,
    error: error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
    } : undefined,
  });
}

/**
 * Log agent execution start
 */
export function logAgentStart(
  agentType: string,
  workflowId: number,
  executionId: number
): void {
  info(`Agent started: ${agentType}`, {
    agentType,
    workflowId,
    executionId,
    event: 'agent_start',
  });
}

/**
 * Log agent execution completion
 */
export function logAgentComplete(
  agentType: string,
  workflowId: number,
  executionId: number,
  duration: number
): void {
  info(`Agent completed: ${agentType}`, {
    agentType,
    workflowId,
    executionId,
    duration,
    event: 'agent_complete',
  });
}

/**
 * Log agent execution failure
 */
export function logAgentFailure(
  agentType: string,
  workflowId: number,
  executionId: number,
  errorObj: Error
): void {
  error(`Agent failed: ${agentType}`, errorObj, {
    agentType,
    workflowId,
    executionId,
    event: 'agent_failure',
  });
}

/**
 * Log workflow start
 */
export function logWorkflowStart(
  workflowId: number,
  workflowType: string
): void {
  info(`Workflow started: ${workflowType}`, {
    workflowId,
    workflowType,
    event: 'workflow_start',
  });
}

/**
 * Log workflow completion
 */
export function logWorkflowComplete(
  workflowId: number,
  workflowType: string,
  duration: number
): void {
  info(`Workflow completed: ${workflowType}`, {
    workflowId,
    workflowType,
    duration,
    event: 'workflow_complete',
  });
}

/**
 * Log workflow failure
 */
export function logWorkflowFailure(
  workflowId: number,
  workflowType: string,
  errorObj: Error
): void {
  error(`Workflow failed: ${workflowType}`, errorObj, {
    workflowId,
    workflowType,
    event: 'workflow_failure',
  });
}

/**
 * Log webhook received
 */
export function logWebhookReceived(
  source: string,
  eventType: string,
  webhookId?: string
): void {
  info(`Webhook received: ${source}/${eventType}`, {
    source,
    eventType,
    webhookId,
    event: 'webhook_received',
  });
}

export default logger;
