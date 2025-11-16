/**
 * Auto-Fix Manager
 * Manages automatic fixing of failed workflows
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import * as logger from './logger.js';

interface AutoFixConfig {
  enabled: boolean;
  autoTriggerOnFailure: boolean;
  maxAutoFixes: number;
  cooldownMinutes: number;
  excludedErrorTypes: string[];
  includedWorkflowTypes: string[];
  notifyOnAutoFix: boolean;
}

interface AutoFixAttempt {
  workflowId: number;
  timestamp: Date;
  status: 'pending' | 'running' | 'success' | 'failed';
  error?: string;
}

export class AutoFixManager {
  private static instance: AutoFixManager;
  private config: AutoFixConfig;
  private recentAttempts: Map<number, AutoFixAttempt[]> = new Map();

  private constructor() {
    this.config = {
      enabled: false,
      autoTriggerOnFailure: false,
      maxAutoFixes: 3,
      cooldownMinutes: 30,
      excludedErrorTypes: ['infrastructure_error', 'api_error'],
      includedWorkflowTypes: ['feature', 'bugfix', 'refactor'],
      notifyOnAutoFix: true,
    };

    this.loadConfig().catch((error) => {
      logger.warn('Failed to load auto-fix config, using defaults', error as Error);
    });
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): AutoFixManager {
    if (!AutoFixManager.instance) {
      AutoFixManager.instance = new AutoFixManager();
    }
    return AutoFixManager.instance;
  }

  /**
   * Load configuration from file
   */
  private async loadConfig(): Promise<void> {
    try {
      const configPath = path.join(
        process.cwd(),
        'config',
        'auto-fix-config.json'
      );
      const configData = await fs.readFile(configPath, 'utf-8');
      this.config = JSON.parse(configData);
      logger.info('Auto-fix config loaded', this.config);
    } catch (error) {
      logger.warn('Could not load auto-fix config', error as Error);
    }
  }

  /**
   * Check if auto-fix should be triggered for a workflow
   */
  public shouldTriggerAutoFix(
    workflowId: number,
    workflowType: string,
    errorType?: string
  ): boolean {
    if (!this.config.enabled || !this.config.autoTriggerOnFailure) {
      logger.debug('Auto-fix disabled or auto-trigger disabled', {
        enabled: this.config.enabled,
        autoTrigger: this.config.autoTriggerOnFailure,
      });
      return false;
    }

    // Check if workflow type is included
    if (!this.config.includedWorkflowTypes.includes(workflowType)) {
      logger.debug('Workflow type not included in auto-fix', { workflowType });
      return false;
    }

    // Check if error type is excluded
    if (errorType && this.config.excludedErrorTypes.includes(errorType)) {
      logger.debug('Error type excluded from auto-fix', { errorType });
      return false;
    }

    // Check recent attempts
    const attempts = this.recentAttempts.get(workflowId) || [];

    // Check max attempts
    if (attempts.length >= this.config.maxAutoFixes) {
      logger.warn('Max auto-fix attempts reached for workflow', {
        workflowId,
        attempts: attempts.length,
        max: this.config.maxAutoFixes,
      });
      return false;
    }

    // Check cooldown
    const lastAttempt = attempts[attempts.length - 1];
    if (lastAttempt) {
      const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
      const timeSinceLastAttempt =
        Date.now() - lastAttempt.timestamp.getTime();

      if (timeSinceLastAttempt < cooldownMs) {
        logger.debug('Auto-fix cooldown period active', {
          workflowId,
          timeSinceLastAttempt,
          cooldownMs,
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Trigger auto-fix for a workflow
   */
  public async triggerAutoFix(workflowId: number): Promise<void> {
    logger.info('Triggering auto-fix for workflow', { workflowId });

    // Record attempt
    const attempt: AutoFixAttempt = {
      workflowId,
      timestamp: new Date(),
      status: 'running',
    };

    const attempts = this.recentAttempts.get(workflowId) || [];
    attempts.push(attempt);
    this.recentAttempts.set(workflowId, attempts);

    try {
      // Spawn auto-fix process
      const scriptPath = path.join(
        process.cwd(),
        'scripts',
        'auto-fix-workflow.ts'
      );

      const autoFixProcess = spawn('tsx', [scriptPath, workflowId.toString()], {
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd(),
      });

      autoFixProcess.unref();

      logger.info('Auto-fix process spawned', { workflowId, pid: autoFixProcess.pid });

      // Update attempt status (optimistically)
      attempt.status = 'pending';

      if (this.config.notifyOnAutoFix) {
        // TODO: Add notification system (webhook, email, etc.)
        logger.info('Auto-fix triggered - notification sent', { workflowId });
      }
    } catch (error) {
      logger.error('Failed to trigger auto-fix', error as Error, { workflowId });
      attempt.status = 'failed';
      attempt.error = (error as Error).message;
    }
  }

  /**
   * Get auto-fix status for a workflow
   */
  public getAutoFixStatus(workflowId: number): AutoFixAttempt[] {
    return this.recentAttempts.get(workflowId) || [];
  }

  /**
   * Get current config
   */
  public getConfig(): AutoFixConfig {
    return { ...this.config };
  }

  /**
   * Update config
   */
  public async updateConfig(config: Partial<AutoFixConfig>): Promise<void> {
    this.config = { ...this.config, ...config };

    const configPath = path.join(
      process.cwd(),
      'config',
      'auto-fix-config.json'
    );

    await fs.writeFile(
      configPath,
      JSON.stringify(this.config, null, 2),
      'utf-8'
    );

    logger.info('Auto-fix config updated', this.config);
  }
}

// Export singleton instance
export const autoFixManager = AutoFixManager.getInstance();
