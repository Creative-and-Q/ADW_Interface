/**
 * Git operations helper
 * Provides utilities for git operations using simple-git
 */

import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import { config } from '../config.js';
import { GitOperationResult } from '../types.js';
import * as logger from './logger.js';

/**
 * Get configured git instance for workspace
 */
export function getGit(workingDir?: string): SimpleGit {
  const options: Partial<SimpleGitOptions> = {
    baseDir: workingDir || config.workspace.root,
    binary: 'git',
    maxConcurrentProcesses: 6,
  };

  const git = simpleGit(options);

  // Configure git user
  git.addConfig('user.name', config.git.userName, false, 'global').catch(() => {});
  git.addConfig('user.email', config.git.userEmail, false, 'global').catch(() => {});

  return git;
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(workingDir?: string): Promise<string> {
  try {
    const git = getGit(workingDir);
    const status = await git.status();
    return status.current || config.git.defaultBranch;
  } catch (error) {
    logger.error('Failed to get current branch', error as Error);
    throw error;
  }
}

/**
 * Create a new branch
 */
export async function createBranch(
  branchName: string,
  workingDir?: string
): Promise<GitOperationResult> {
  try {
    const git = getGit(workingDir);

    // Check if branch already exists
    const branches = await git.branch();
    if (branches.all.includes(branchName)) {
      logger.warn(`Branch ${branchName} already exists, checking it out`);
      await git.checkout(branchName);
    } else {
      await git.checkoutLocalBranch(branchName);
      logger.info(`Created and checked out branch: ${branchName}`);
    }

    return {
      success: true,
      branch: branchName,
      message: `Branch ${branchName} created successfully`,
    };
  } catch (error) {
    logger.error(`Failed to create branch: ${branchName}`, error as Error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Commit changes to current branch
 */
export async function commitChanges(
  message: string,
  files: string[] = ['.'],
  workingDir?: string
): Promise<GitOperationResult> {
  try {
    const git = getGit(workingDir);

    // Add files
    await git.add(files);

    // Check if there are changes to commit
    const status = await git.status();
    if (status.staged.length === 0) {
      logger.warn('No changes to commit');
      return {
        success: true,
        message: 'No changes to commit',
      };
    }

    // Commit changes
    const result = await git.commit(message);

    logger.info(`Committed changes: ${result.commit}`);

    return {
      success: true,
      commit: result.commit,
      message: `Changes committed successfully: ${result.summary.changes} changes`,
    };
  } catch (error) {
    logger.error('Failed to commit changes', error as Error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Get recent commits
 */
export async function getRecentCommits(
  count: number = 10,
  workingDir?: string
): Promise<Array<{ hash: string; message: string; author: string; date: string }>> {
  try {
    const git = getGit(workingDir);
    const log = await git.log({ maxCount: count });

    return log.all.map(commit => ({
      hash: commit.hash,
      message: commit.message,
      author: commit.author_name,
      date: commit.date,
    }));
  } catch (error) {
    logger.error('Failed to get recent commits', error as Error);
    return [];
  }
}

/**
 * Get diff for specific files or branch
 */
export async function diffFiles(
  branch?: string,
  files?: string[],
  workingDir?: string
): Promise<string> {
  try {
    const git = getGit(workingDir);

    if (branch) {
      // Diff between current branch and specified branch
      const diff = await git.diff([`${branch}...HEAD`, ...(files || [])]);
      return diff;
    } else {
      // Diff of unstaged changes
      const diff = await git.diff(files);
      return diff;
    }
  } catch (error) {
    logger.error('Failed to get diff', error as Error);
    throw error;
  }
}

/**
 * Get status of working directory
 */
export async function getStatus(workingDir?: string): Promise<{
  modified: string[];
  created: string[];
  deleted: string[];
  renamed: string[];
  staged: string[];
}> {
  try {
    const git = getGit(workingDir);
    const status = await git.status();

    return {
      modified: status.modified,
      created: status.not_added,
      deleted: status.deleted,
      renamed: status.renamed.map(r => `${r.from} -> ${r.to}`),
      staged: status.staged,
    };
  } catch (error) {
    logger.error('Failed to get git status', error as Error);
    throw error;
  }
}

/**
 * Stash changes
 */
export async function stashChanges(
  message?: string,
  workingDir?: string
): Promise<GitOperationResult> {
  try {
    const git = getGit(workingDir);
    await git.stash(['push', ...(message ? ['-m', message] : [])]);

    logger.info('Changes stashed successfully');

    return {
      success: true,
      message: 'Changes stashed successfully',
    };
  } catch (error) {
    logger.error('Failed to stash changes', error as Error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Pop stashed changes
 */
export async function popStash(workingDir?: string): Promise<GitOperationResult> {
  try {
    const git = getGit(workingDir);
    await git.stash(['pop']);

    logger.info('Stashed changes popped successfully');

    return {
      success: true,
      message: 'Stashed changes applied successfully',
    };
  } catch (error) {
    logger.error('Failed to pop stash', error as Error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Check if working directory is clean
 */
export async function isWorkingDirectoryClean(workingDir?: string): Promise<boolean> {
  try {
    const git = getGit(workingDir);
    const status = await git.status();
    return status.isClean();
  } catch (error) {
    logger.error('Failed to check working directory status', error as Error);
    return false;
  }
}

/**
 * Reset changes in working directory
 */
export async function resetChanges(
  hard: boolean = false,
  workingDir?: string
): Promise<GitOperationResult> {
  try {
    const git = getGit(workingDir);

    if (hard) {
      await git.reset(['--hard']);
      logger.info('Hard reset completed');
    } else {
      await git.reset(['--soft']);
      logger.info('Soft reset completed');
    }

    return {
      success: true,
      message: `Reset completed (${hard ? 'hard' : 'soft'})`,
    };
  } catch (error) {
    logger.error('Failed to reset changes', error as Error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Pull latest changes from remote
 */
export async function pullChanges(
  branch?: string,
  workingDir?: string
): Promise<GitOperationResult> {
  try {
    const git = getGit(workingDir);
    const currentBranch = branch || (await getCurrentBranch(workingDir));
    await git.pull('origin', currentBranch);

    logger.info(`Pulled latest changes from origin/${currentBranch}`);

    return {
      success: true,
      message: `Pulled changes from origin/${currentBranch}`,
    };
  } catch (error) {
    logger.error('Failed to pull changes', error as Error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Push changes to remote
 */
export async function pushChanges(
  branch?: string,
  workingDir?: string
): Promise<GitOperationResult> {
  try {
    const git = getGit(workingDir);
    const currentBranch = branch || (await getCurrentBranch(workingDir));
    await git.push('origin', currentBranch);

    logger.info(`Pushed changes to origin/${currentBranch}`);

    return {
      success: true,
      message: `Pushed changes to origin/${currentBranch}`,
    };
  } catch (error) {
    logger.error('Failed to push changes', error as Error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
