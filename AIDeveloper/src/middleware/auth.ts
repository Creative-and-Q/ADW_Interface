/**
 * Authentication middleware for webhook endpoints
 * Verifies webhook signatures and tokens
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config.js';
import * as logger from '../utils/logger.js';

/**
 * Verify GitHub webhook signature
 * Uses HMAC SHA-256 signature verification
 */
export function verifyGitHubSignature(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;

    if (!signature) {
      logger.warn('GitHub webhook missing signature');
      res.status(401).json({
        success: false,
        error: 'Missing X-Hub-Signature-256 header',
      });
      return;
    }

    // Get raw body for signature verification
    const rawBody = JSON.stringify(req.body);

    // Compute expected signature
    const hmac = crypto.createHmac('sha256', config.webhooks.secrets.github);
    hmac.update(rawBody);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;

    // Constant-time comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      logger.warn('GitHub webhook signature verification failed');
      res.status(401).json({
        success: false,
        error: 'Invalid signature',
      });
      return;
    }

    logger.debug('GitHub webhook signature verified');
    next();
  } catch (error) {
    logger.error('GitHub signature verification error', error as Error);
    res.status(500).json({
      success: false,
      error: 'Signature verification failed',
    });
  }
}

/**
 * Verify GitLab webhook token
 */
export function verifyGitLabToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const token = req.headers['x-gitlab-token'] as string;

    if (!token) {
      logger.warn('GitLab webhook missing token');
      res.status(401).json({
        success: false,
        error: 'Missing X-Gitlab-Token header',
      });
      return;
    }

    // Compare token with configured secret
    if (token !== config.webhooks.secrets.gitlab) {
      logger.warn('GitLab webhook token verification failed');
      res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
      return;
    }

    logger.debug('GitLab webhook token verified');
    next();
  } catch (error) {
    logger.error('GitLab token verification error', error as Error);
    res.status(500).json({
      success: false,
      error: 'Token verification failed',
    });
  }
}

/**
 * Verify custom webhook bearer token
 */
export function verifyCustomToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization as string;

    if (!authHeader) {
      logger.warn('Custom webhook missing authorization header');
      res.status(401).json({
        success: false,
        error: 'Missing Authorization header',
      });
      return;
    }

    // Extract bearer token
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
      logger.warn('Custom webhook invalid authorization format');
      res.status(401).json({
        success: false,
        error: 'Invalid authorization format. Expected: Bearer <token>',
      });
      return;
    }

    const token = match[1];

    // Compare token with configured secret
    if (token !== config.webhooks.secrets.custom) {
      logger.warn('Custom webhook token verification failed');
      res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
      return;
    }

    logger.debug('Custom webhook token verified');
    next();
  } catch (error) {
    logger.error('Custom token verification error', error as Error);
    res.status(500).json({
      success: false,
      error: 'Token verification failed',
    });
  }
}
