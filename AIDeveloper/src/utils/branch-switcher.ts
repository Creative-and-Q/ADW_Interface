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

export interface BranchInfo {
  name: string;
  isLocal: boolean;
  isRemote: boolean;
  isCurrent: boolean;
}

/**
 * Get list of all git branches (local and remote)
 */
export async function listBranches(): Promise<BranchInfo[]> {
  try {
    // Fetch latest from remote
    await execAsync('git fetch --all', {
      cwd: process.cwd(),
    });

    // Get all branches (local and remote)
    const { stdout } = await execAsync('git branch -a', {
      cwd: process.cwd(),
    });

    const branchMap = new Map<string, BranchInfo>();

    // Parse branch list
    stdout.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.includes('->')) return;

      const isCurrent = trimmed.startsWith('*');
      const branchLine = trimmed.replace(/^\*\s+/, '');

      if (branchLine.startsWith('remotes/origin/')) {
        // Remote branch
        const name = branchLine.replace('remotes/origin/', '');
        const existing = branchMap.get(name);
        if (existing) {
          existing.isRemote = true;
        } else {
          branchMap.set(name, {
            name,
            isLocal: false,
            isRemote: true,
            isCurrent: false,
          });
        }
      } else {
        // Local branch
        const existing = branchMap.get(branchLine);
        if (existing) {
          existing.isLocal = true;
          if (isCurrent) existing.isCurrent = true;
        } else {
          branchMap.set(branchLine, {
            name: branchLine,
            isLocal: true,
            isRemote: false,
            isCurrent,
          });
        }
      }
    });

    return Array.from(branchMap.values()).sort((a, b) => {
      // Sort: current first, then local, then remote-only, alphabetically within each group
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      if (a.isLocal && !b.isLocal) return -1;
      if (!a.isLocal && b.isLocal) return 1;
      return a.name.localeCompare(b.name);
    });
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
 * Switch git branch (handles both local and remote branches)
 */
async function checkoutBranch(branch: string, isRemoteOnly: boolean = false): Promise<void> {
  try {
    logger.info(`Checking out branch: ${branch}`, { isRemoteOnly });

    if (isRemoteOnly) {
      // Create local branch tracking remote
      await execAsync(`git checkout -b ${branch} origin/${branch}`, {
        cwd: process.cwd(),
      });
      logger.info(`Successfully created and checked out branch tracking origin/${branch}`);
    } else {
      // Checkout existing local branch
      await execAsync(`git checkout ${branch}`, {
        cwd: process.cwd(),
      });
      logger.info(`Successfully checked out local branch: ${branch}`);
    }
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

    // Step 3: Determine if branch is remote-only
    const branches = await listBranches();
    const branchInfo = branches.find(b => b.name === targetBranch);
    const isRemoteOnly = branchInfo && !branchInfo.isLocal && branchInfo.isRemote;

    // Step 4: Switch to target branch
    try {
      await checkoutBranch(targetBranch, isRemoteOnly);
    } catch (error) {
      return {
        success: false,
        message: `Failed to checkout branch '${targetBranch}'. ${isRemoteOnly ? 'Remote branch may not exist.' : 'Branch may not exist.'}`,
        error: (error as Error).message,
      };
    }

    // Step 5: Build backend
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

    // Step 6: Build frontend
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
