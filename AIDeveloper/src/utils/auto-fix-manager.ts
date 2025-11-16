/**
 * Auto-Fix Manager
 * Manages automatic fixing of failed workflows
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import * as logger from './logger.js';
import { emitToClients } from '../websocket-emitter.js';

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
  id: string;
  workflowId: number;
  timestamp: Date;
  status: 'pending' | 'running' | 'investigating' | 'fixing' | 'testing' | 'success' | 'failed';
  error?: string;
  pid?: number;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  rootCause?: string;
  fixDescription?: string;
  commitHash?: string;
  newWorkflowId?: number;
  progress?: {
    stage: string;
    percentage: number;
    message: string;
  };
}

interface AutoFixSummary {
  totalAttempts: number;
  activeAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  recentAttempts: AutoFixAttempt[];
}

export class AutoFixManager {
  private static instance: AutoFixManager;
  private config: AutoFixConfig;
  private recentAttempts: Map<number, AutoFixAttempt[]> = new Map();
  private allAttempts: AutoFixAttempt[] = [];
  private activeAttempts: Map<string, AutoFixAttempt> = new Map();

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
  public async triggerAutoFix(workflowId: number): Promise<string> {
    logger.info('Triggering auto-fix for workflow', { workflowId });

    // Generate unique attempt ID
    const attemptId = `autofix-${workflowId}-${Date.now()}`;

    // Record attempt
    const attempt: AutoFixAttempt = {
      id: attemptId,
      workflowId,
      timestamp: new Date(),
      startedAt: new Date(),
      status: 'pending',
      progress: {
        stage: 'Initializing',
        percentage: 0,
        message: 'Auto-fix process starting...'
      }
    };

    // Add to all collections
    const attempts = this.recentAttempts.get(workflowId) || [];
    attempts.push(attempt);
    this.recentAttempts.set(workflowId, attempts);
    this.allAttempts.push(attempt);
    this.activeAttempts.set(attemptId, attempt);

    try {
      // Spawn auto-fix process
      const scriptPath = path.join(
        process.cwd(),
        'scripts',
        'auto-fix-workflow.ts'
      );

      // Auto-fix script needs to run from project root (parent of AIDeveloper)
      const projectRoot = path.join(process.cwd(), '..');

      const autoFixProcess = spawn('tsx', [scriptPath, workflowId.toString(), attemptId], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: projectRoot,
      });

      // Store PID
      attempt.pid = autoFixProcess.pid;
      attempt.status = 'running';

      // Monitor stdout for progress updates
      autoFixProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        this.parseProgressUpdate(attemptId, output);
      });

      // Monitor stderr for errors
      autoFixProcess.stderr?.on('data', (data) => {
        const error = data.toString();
        logger.error('Auto-fix process error output', new Error(error), { attemptId });
      });

      // Handle process exit
      autoFixProcess.on('exit', (code) => {
        const attempt = this.activeAttempts.get(attemptId);
        if (attempt) {
          attempt.completedAt = new Date();
          attempt.duration = attempt.completedAt.getTime() - attempt.startedAt.getTime();

          if (code === 0) {
            attempt.status = 'success';
            logger.info('Auto-fix process completed successfully', { attemptId, workflowId });

            // Emit success event
            emitToClients('autofix:completed', {
              attemptId,
              workflowId,
              status: 'success',
              duration: attempt.duration
            });
          } else {
            attempt.status = 'failed';
            attempt.error = `Process exited with code ${code}`;
            logger.error('Auto-fix process failed', new Error(`Process exited with code ${code}`), { attemptId, workflowId });

            // Emit failure event
            emitToClients('autofix:failed', {
              attemptId,
              workflowId,
              error: attempt.error,
              duration: attempt.duration
            });
          }

          this.activeAttempts.delete(attemptId);
        }
      });

      autoFixProcess.unref();

      logger.info('Auto-fix process spawned', {
        workflowId,
        attemptId,
        pid: autoFixProcess.pid
      });

      // Emit WebSocket event
      emitToClients('autofix:started', {
        attemptId,
        workflowId,
        timestamp: attempt.startedAt
      });

      if (this.config.notifyOnAutoFix) {
        logger.info('Auto-fix triggered - notification sent', { workflowId, attemptId });
      }

      return attemptId;
    } catch (error) {
      logger.error('Failed to trigger auto-fix', error as Error, { workflowId, attemptId });
      attempt.status = 'failed';
      attempt.error = (error as Error).message;
      attempt.completedAt = new Date();
      attempt.duration = attempt.completedAt.getTime() - attempt.startedAt.getTime();
      this.activeAttempts.delete(attemptId);
      throw error;
    }
  }

  /**
   * Parse progress updates from auto-fix process stdout
   */
  private parseProgressUpdate(attemptId: string, output: string): void {
    const attempt = this.activeAttempts.get(attemptId);
    if (!attempt) return;

    try {
      // Look for JSON progress updates
      const jsonMatch = output.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const progress = JSON.parse(jsonMatch[0]);
        if (progress.stage) {
          attempt.progress = progress;
          attempt.status = progress.status || attempt.status;
          logger.debug('Auto-fix progress update', { attemptId, progress });

          // Emit progress update via WebSocket
          emitToClients('autofix:progress', {
            attemptId,
            workflowId: attempt.workflowId,
            progress: attempt.progress,
            status: attempt.status
          });
        }
      }
    } catch (error) {
      // Ignore parse errors
    }
  }

  /**
   * Update auto-fix attempt status (called by auto-fix script)
   */
  public updateAttemptStatus(
    attemptId: string,
    update: Partial<AutoFixAttempt>
  ): void {
    const attempt = this.activeAttempts.get(attemptId);
    if (attempt) {
      Object.assign(attempt, update);
      logger.info('Auto-fix attempt updated', { attemptId, update });

      // Emit update event
      emitToClients('autofix:updated', {
        attemptId,
        workflowId: attempt.workflowId,
        ...update
      });
    }
  }

  /**
   * Get auto-fix status for a workflow
   */
  public getAutoFixStatus(workflowId: number): AutoFixAttempt[] {
    return this.recentAttempts.get(workflowId) || [];
  }

  /**
   * Get specific auto-fix attempt by ID
   */
  public getAttempt(attemptId: string): AutoFixAttempt | undefined {
    return this.activeAttempts.get(attemptId) ||
           this.allAttempts.find(a => a.id === attemptId);
  }

  /**
   * Get all active auto-fix attempts
   */
  public getActiveAttempts(): AutoFixAttempt[] {
    return Array.from(this.activeAttempts.values());
  }

  /**
   * Get all auto-fix attempts (with optional limit)
   */
  public getAllAttempts(limit?: number): AutoFixAttempt[] {
    const attempts = [...this.allAttempts].sort((a, b) =>
      b.timestamp.getTime() - a.timestamp.getTime()
    );
    return limit ? attempts.slice(0, limit) : attempts;
  }

  /**
   * Get auto-fix summary statistics
   */
  public getSummary(): AutoFixSummary {
    const totalAttempts = this.allAttempts.length;
    const activeAttempts = this.activeAttempts.size;
    const successfulAttempts = this.allAttempts.filter(a => a.status === 'success').length;
    const failedAttempts = this.allAttempts.filter(a => a.status === 'failed').length;
    const recentAttempts = this.getAllAttempts(10);

    return {
      totalAttempts,
      activeAttempts,
      successfulAttempts,
      failedAttempts,
      recentAttempts
    };
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
