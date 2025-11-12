/**
 * Centralized Error Handler
 * Implements DRY principles for consistent error logging and handling
 */

import * as logger from './logger.js';

export interface ErrorContext {
  operation: string;
  module?: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: ErrorContext;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: ErrorContext
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Log and handle errors consistently
 */
export function handleError(error: Error | AppError, context?: ErrorContext): void {
  const errorDetails: any = {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  };

  if (error instanceof AppError) {
    errorDetails.statusCode = error.statusCode;
    errorDetails.isOperational = error.isOperational;
    errorDetails.context = error.context || context;
  } else if (context) {
    errorDetails.context = context;
  }

  // Log to console for development
  if (process.env.NODE_ENV === 'development') {
    console.error('='.repeat(80));
    console.error('ERROR OCCURRED:');
    console.error('-'.repeat(80));
    console.error('Message:', error.message);
    if (context) {
      console.error('Operation:', context.operation);
      if (context.module) console.error('Module:', context.module);
      if (context.metadata) console.error('Metadata:', context.metadata);
    }
    console.error('-'.repeat(80));
    console.error('Stack:', error.stack);
    console.error('='.repeat(80));
  }

  // Log using winston logger
  logger.error(error.message, errorDetails);
}

/**
 * Wrap async functions with error handling
 */
export function asyncHandler(
  fn: Function,
  context?: ErrorContext
): (req: any, res: any, next: any) => Promise<void> {
  return async (req: any, res: any, next: any) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      handleError(error as Error, context);
      next(error);
    }
  };
}

/**
 * Safe async execution with error logging
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  context: ErrorContext,
  defaultValue?: T
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    handleError(error as Error, context);
    return defaultValue;
  }
}

/**
 * Validate required parameters
 */
export function validateRequired(params: Record<string, any>, required: string[]): void {
  const missing = required.filter((key) => params[key] === undefined || params[key] === null);

  if (missing.length > 0) {
    throw new AppError(
      `Missing required parameters: ${missing.join(', ')}`,
      400,
      true,
      {
        operation: 'validation',
        metadata: { missing, provided: Object.keys(params) },
      }
    );
  }
}

/**
 * Create standardized error response
 */
export function createErrorResponse(error: Error | AppError): {
  error: string;
  statusCode: number;
  details?: any;
} {
  if (error instanceof AppError) {
    return {
      error: error.message,
      statusCode: error.statusCode,
      details: error.context,
    };
  }

  // Don't expose internal errors in production
  const message =
    process.env.NODE_ENV === 'production'
      ? 'An internal error occurred'
      : error.message;

  return {
    error: message,
    statusCode: 500,
  };
}

/**
 * Log operation start
 */
export function logOperation(context: ErrorContext): void {
  logger.info(`Starting operation: ${context.operation}`, context);

  if (process.env.NODE_ENV === 'development') {
    console.log(`▶ ${context.operation}`, context.metadata || '');
  }
}

/**
 * Log operation success
 */
export function logSuccess(context: ErrorContext, result?: any): void {
  const logData = {
    ...context,
    result: result ? JSON.stringify(result).substring(0, 200) : undefined,
    duration: result?.duration,
  };

  logger.info(`Operation successful: ${context.operation}`, logData);

  if (process.env.NODE_ENV === 'development') {
    console.log(`✓ ${context.operation} completed`);
  }
}

/**
 * Create module-specific error context
 */
export function createModuleContext(
  operation: string,
  moduleName: string,
  metadata?: Record<string, any>
): ErrorContext {
  return {
    operation,
    module: moduleName,
    metadata,
  };
}
