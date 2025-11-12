/**
 * Validation middleware for webhook payloads
 * Validates and transforms webhook payloads
 */

import { Request, Response, NextFunction } from 'express';
import { WorkflowType } from '../types.js';
import * as logger from '../utils/logger.js';

/**
 * Validate GitHub webhook payload
 */
export function validateGitHubPayload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const eventType = req.headers['x-github-event'] as string;

    if (!eventType) {
      res.status(400).json({
        success: false,
        error: 'Missing X-GitHub-Event header',
      });
      return;
    }

    // Store event type in body for handler
    req.body._eventType = eventType;
    req.body._source = 'github';

    // Basic validation based on event type
    if (eventType === 'push' && !req.body.commits) {
      res.status(400).json({
        success: false,
        error: 'Invalid push event: missing commits',
      });
      return;
    }

    if (eventType === 'pull_request' && !req.body.pull_request) {
      res.status(400).json({
        success: false,
        error: 'Invalid pull_request event: missing pull_request data',
      });
      return;
    }

    if (eventType === 'issues' && !req.body.issue) {
      res.status(400).json({
        success: false,
        error: 'Invalid issues event: missing issue data',
      });
      return;
    }

    logger.debug(`GitHub ${eventType} event validated`);
    next();
  } catch (error) {
    logger.error('GitHub payload validation error', error as Error);
    res.status(400).json({
      success: false,
      error: 'Invalid payload',
    });
  }
}

/**
 * Validate GitLab webhook payload
 */
export function validateGitLabPayload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const eventType = req.headers['x-gitlab-event'] as string;

    if (!eventType) {
      res.status(400).json({
        success: false,
        error: 'Missing X-Gitlab-Event header',
      });
      return;
    }

    // Store event type in body for handler
    req.body._eventType = eventType;
    req.body._source = 'gitlab';

    // Basic validation based on event type
    if (eventType === 'Push Hook' && !req.body.commits) {
      res.status(400).json({
        success: false,
        error: 'Invalid push hook: missing commits',
      });
      return;
    }

    if (eventType === 'Merge Request Hook' && !req.body.merge_request) {
      res.status(400).json({
        success: false,
        error: 'Invalid merge request hook: missing merge_request data',
      });
      return;
    }

    if (eventType === 'Issue Hook' && !req.body.issue) {
      res.status(400).json({
        success: false,
        error: 'Invalid issue hook: missing issue data',
      });
      return;
    }

    logger.debug(`GitLab ${eventType} validated`);
    next();
  } catch (error) {
    logger.error('GitLab payload validation error', error as Error);
    res.status(400).json({
      success: false,
      error: 'Invalid payload',
    });
  }
}

/**
 * Validate custom webhook payload
 */
export function validateCustomPayload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const { workflowType, taskDescription } = req.body;

    if (!workflowType) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: workflowType',
      });
      return;
    }

    if (!taskDescription) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: taskDescription',
      });
      return;
    }

    // Validate workflow type
    const validTypes = Object.values(WorkflowType);
    if (!validTypes.includes(workflowType as WorkflowType)) {
      res.status(400).json({
        success: false,
        error: `Invalid workflowType. Must be one of: ${validTypes.join(', ')}`,
      });
      return;
    }

    // Store source
    req.body._source = 'custom';

    logger.debug(`Custom webhook validated: ${workflowType}`);
    next();
  } catch (error) {
    logger.error('Custom payload validation error', error as Error);
    res.status(400).json({
      success: false,
      error: 'Invalid payload',
    });
  }
}

/**
 * Validate manual workflow submission payload
 */
export function validateManualPayload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const { workflowType, taskDescription } = req.body;

    if (!workflowType) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: workflowType',
      });
      return;
    }

    if (!taskDescription) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: taskDescription',
      });
      return;
    }

    // Validate workflow type
    const validTypes = Object.values(WorkflowType);
    if (!validTypes.includes(workflowType as WorkflowType)) {
      res.status(400).json({
        success: false,
        error: `Invalid workflowType. Must be one of: ${validTypes.join(', ')}`,
      });
      return;
    }

    // Validate task description length
    if (taskDescription.length < 10) {
      res.status(400).json({
        success: false,
        error: 'taskDescription must be at least 10 characters',
      });
      return;
    }

    if (taskDescription.length > 5000) {
      res.status(400).json({
        success: false,
        error: 'taskDescription must be less than 5000 characters',
      });
      return;
    }

    // Store source
    req.body._source = 'manual';

    logger.debug(`Manual workflow validated: ${workflowType}`);
    next();
  } catch (error) {
    logger.error('Manual payload validation error', error as Error);
    res.status(400).json({
      success: false,
      error: 'Invalid payload',
    });
  }
}
