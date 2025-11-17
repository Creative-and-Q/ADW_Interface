/**
 * Branch Switcher Utility
 * Handles git branch switching with automatic rebuild and failsafe rollback
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as logger from './logger.js';
import path from 'path';

const execAsync = promisify(exec);

export interface BranchSwitchResult {
  success: boolean;
  message: string;
  previousBranch?: string;
  newBranch?: string;
  buildLogs?: string;
  error?: string;
}

/**
 * Get list of all git branches
 */
export async function listBranches(): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git branch -a', {
      cwd: process.cwd(),
    });

    // Parse branch list, remove current branch marker and remote info
    const branches = stdout
      .split('\n')
      .map(b => b.trim())
      .filter(b => b && !b.startsWith('remotes/'))
      .map(b => b.replace(/^\*\s+/, ''))
      .filter(b => b && !b.includes('->'));

    return branches;
  } catch (error) {
    logger.error('Failed to list branches', error as Error);
    return [];
  }
}

/**
 * Get current git branch
 */
export async function getCurrentBranch(): Promise<string> {
  try {
    const { stdout } = await execAsync('git branch --show-current', {
      cwd: process.cwd(),
    });
    return stdout.trim();
  } catch (error) {
    logger.error('Failed to get current branch', error as Error);
    throw error;
  }
}

/**
 * Check if there are uncommitted changes
 */
async function hasUncommittedChanges(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('git status --porcelain', {
      cwd: process.cwd(),
    });
    return stdout.trim().length > 0;
  } catch (error) {
    logger.error('Failed to check git status', error as Error);
    return false;
  }
}

/**
 * Build backend (TypeScript compilation)
 */
async function buildBackend(): Promise<{ success: boolean; logs: string }> {
  try {
    logger.info('Building backend...');
    const { stdout, stderr } = await execAsync('npm run build', {
      cwd: process.cwd(),
      timeout: 120000, // 2 minutes
    });

    const logs = `${stdout}\n${stderr}`;
    logger.info('Backend build completed successfully');
    return { success: true, logs };
  } catch (error: any) {
    const logs = `${error.stdout || ''}\n${error.stderr || ''}`;
    logger.error('Backend build failed', error as Error, { logs });
    return { success: false, logs };
  }
}

/**
 * Build frontend
 */
async function buildFrontend(): Promise<{ success: boolean; logs: string }> {
  try {
    logger.info('Building frontend...');
    const frontendPath = path.join(process.cwd(), 'frontend');
    const { stdout, stderr } = await execAsync('npm run build', {
      cwd: frontendPath,
      timeout: 120000, // 2 minutes
    });

    const logs = `${stdout}\n${stderr}`;
    logger.info('Frontend build completed successfully');
    return { success: true, logs };
  } catch (error: any) {
    const logs = `${error.stdout || ''}\n${error.stderr || ''}`;
    logger.error('Frontend build failed', error as Error, { logs });
    return { success: false, logs };
  }
}

/**
 * Switch git branch
 */
async function checkoutBranch(branch: string): Promise<void> {
  try {
    logger.info(`Checking out branch: ${branch}`);
    await execAsync(`git checkout ${branch}`, {
      cwd: process.cwd(),
    });
    logger.info(`Successfully checked out branch: ${branch}`);
  } catch (error) {
    logger.error(`Failed to checkout branch: ${branch}`, error as Error);
    throw error;
  }
}

/**
 * Switch branch with rebuild and failsafe rollback
 *
 * Process:
 * 1. Check for uncommitted changes (abort if found)
 * 2. Store current branch
 * 3. Switch to target branch
 * 4. Build backend
 * 5. Build frontend
 * 6. If any build fails:
 *    - Switch back to previous branch
 *    - Rebuild on safe branch
 *    - Return error with details
 * 7. Return success
 */
export async function switchBranchWithRebuild(
  targetBranch: string
): Promise<BranchSwitchResult> {
  const startTime = Date.now();
  let buildLogs = '';

  try {
    // Step 1: Check for uncommitted changes
    const hasChanges = await hasUncommittedChanges();
    if (hasChanges) {
      return {
        success: false,
        message: 'Cannot switch branches: You have uncommitted changes. Please commit or stash them first.',
        error: 'UNCOMMITTED_CHANGES',
      };
    }

    // Step 2: Get current branch (for rollback)
    const previousBranch = await getCurrentBranch();
    logger.info('Starting branch switch with rebuild', {
      from: previousBranch,
      to: targetBranch,
    });

    if (previousBranch === targetBranch) {
      return {
        success: false,
        message: `Already on branch '${targetBranch}'`,
        previousBranch,
        newBranch: targetBranch,
      };
    }

    // Step 3: Switch to target branch
    try {
      await checkoutBranch(targetBranch);
    } catch (error) {
      return {
        success: false,
        message: `Failed to checkout branch '${targetBranch}'. Branch may not exist.`,
        error: (error as Error).message,
      };
    }

    // Step 4: Build backend
    const backendBuild = await buildBackend();
    buildLogs += `\n=== Backend Build ===\n${backendBuild.logs}\n`;

    if (!backendBuild.success) {
      logger.warn('Backend build failed, rolling back to previous branch', {
        targetBranch,
        previousBranch,
      });

      // Rollback to previous branch
      await checkoutBranch(previousBranch);

      // Rebuild on safe branch
      const rollbackBuild = await buildBackend();
      buildLogs += `\n=== Rollback Backend Build ===\n${rollbackBuild.logs}\n`;

      return {
        success: false,
        message: `Backend build failed on branch '${targetBranch}'. Rolled back to '${previousBranch}'.`,
        previousBranch,
        buildLogs,
        error: 'BACKEND_BUILD_FAILED',
      };
    }

    // Step 5: Build frontend
    const frontendBuild = await buildFrontend();
    buildLogs += `\n=== Frontend Build ===\n${frontendBuild.logs}\n`;

    if (!frontendBuild.success) {
      logger.warn('Frontend build failed, rolling back to previous branch', {
        targetBranch,
        previousBranch,
      });

      // Rollback to previous branch
      await checkoutBranch(previousBranch);

      // Rebuild both on safe branch
      const rollbackBackend = await buildBackend();
      const rollbackFrontend = await buildFrontend();
      buildLogs += `\n=== Rollback Backend Build ===\n${rollbackBackend.logs}\n`;
      buildLogs += `\n=== Rollback Frontend Build ===\n${rollbackFrontend.logs}\n`;

      return {
        success: false,
        message: `Frontend build failed on branch '${targetBranch}'. Rolled back to '${previousBranch}'.`,
        previousBranch,
        buildLogs,
        error: 'FRONTEND_BUILD_FAILED',
      };
    }

    // Success!
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info('Branch switch completed successfully', {
      previousBranch,
      newBranch: targetBranch,
      duration: `${duration}s`,
    });

    return {
      success: true,
      message: `Successfully switched to branch '${targetBranch}' and rebuilt (${duration}s)`,
      previousBranch,
      newBranch: targetBranch,
      buildLogs,
    };
  } catch (error) {
    logger.error('Branch switch failed with unexpected error', error as Error);
    return {
      success: false,
      message: `Unexpected error during branch switch: ${(error as Error).message}`,
      buildLogs,
      error: (error as Error).message,
    };
  }
}
