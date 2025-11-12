/**
 * File system operations helper
 * Provides safe file system utilities with validation
 */

import fs from 'fs/promises';
import path from 'path';
import * as logger from './logger.js';
import { config } from '../config.js';

/**
 * Validate that path is within workspace
 */
export function validatePath(filePath: string): boolean {
  const absolutePath = path.resolve(filePath);
  const workspaceRoot = path.resolve(config.workspace.root);
  return absolutePath.startsWith(workspaceRoot);
}

/**
 * Get absolute path within workspace
 */
export function getAbsolutePath(relativePath: string): string {
  return path.join(config.workspace.root, relativePath);
}

/**
 * Read file contents
 */
export async function readFile(filePath: string): Promise<string> {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : getAbsolutePath(filePath);

    if (!validatePath(absolutePath)) {
      throw new Error(`Path is outside workspace: ${filePath}`);
    }

    const content = await fs.readFile(absolutePath, 'utf-8');
    logger.debug(`Read file: ${filePath}`);
    return content;
  } catch (error) {
    logger.error(`Failed to read file: ${filePath}`, error as Error);
    throw error;
  }
}

/**
 * Write file contents (creates directories if needed)
 */
export async function writeFile(
  filePath: string,
  content: string,
  options?: { atomic?: boolean }
): Promise<void> {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : getAbsolutePath(filePath);

    if (!validatePath(absolutePath)) {
      throw new Error(`Path is outside workspace: ${filePath}`);
    }

    // Ensure directory exists
    const directory = path.dirname(absolutePath);
    await fs.mkdir(directory, { recursive: true });

    if (options?.atomic) {
      // Atomic write using temp file
      const tempPath = `${absolutePath}.tmp`;
      await fs.writeFile(tempPath, content, 'utf-8');
      await fs.rename(tempPath, absolutePath);
    } else {
      await fs.writeFile(absolutePath, content, 'utf-8');
    }

    logger.debug(`Wrote file: ${filePath}`);
  } catch (error) {
    logger.error(`Failed to write file: ${filePath}`, error as Error);
    throw error;
  }
}

/**
 * Append content to file
 */
export async function appendFile(
  filePath: string,
  content: string
): Promise<void> {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : getAbsolutePath(filePath);

    if (!validatePath(absolutePath)) {
      throw new Error(`Path is outside workspace: ${filePath}`);
    }

    await fs.appendFile(absolutePath, content, 'utf-8');
    logger.debug(`Appended to file: ${filePath}`);
  } catch (error) {
    logger.error(`Failed to append to file: ${filePath}`, error as Error);
    throw error;
  }
}

/**
 * Delete file
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : getAbsolutePath(filePath);

    if (!validatePath(absolutePath)) {
      throw new Error(`Path is outside workspace: ${filePath}`);
    }

    await fs.unlink(absolutePath);
    logger.debug(`Deleted file: ${filePath}`);
  } catch (error) {
    logger.error(`Failed to delete file: ${filePath}`, error as Error);
    throw error;
  }
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : getAbsolutePath(filePath);

    if (!validatePath(absolutePath)) {
      return false;
    }

    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create directory (recursive)
 */
export async function createDirectory(dirPath: string): Promise<void> {
  try {
    const absolutePath = path.isAbsolute(dirPath) ? dirPath : getAbsolutePath(dirPath);

    if (!validatePath(absolutePath)) {
      throw new Error(`Path is outside workspace: ${dirPath}`);
    }

    await fs.mkdir(absolutePath, { recursive: true });
    logger.debug(`Created directory: ${dirPath}`);
  } catch (error) {
    logger.error(`Failed to create directory: ${dirPath}`, error as Error);
    throw error;
  }
}

/**
 * List files in directory
 */
export async function listFiles(
  dirPath: string,
  pattern?: RegExp
): Promise<string[]> {
  try {
    const absolutePath = path.isAbsolute(dirPath) ? dirPath : getAbsolutePath(dirPath);

    if (!validatePath(absolutePath)) {
      throw new Error(`Path is outside workspace: ${dirPath}`);
    }

    const entries = await fs.readdir(absolutePath, { withFileTypes: true });
    let files = entries
      .filter(entry => entry.isFile())
      .map(entry => path.join(dirPath, entry.name));

    if (pattern) {
      files = files.filter(file => pattern.test(file));
    }

    return files;
  } catch (error) {
    logger.error(`Failed to list files in: ${dirPath}`, error as Error);
    throw error;
  }
}

/**
 * List directories in directory
 */
export async function listDirectories(dirPath: string): Promise<string[]> {
  try {
    const absolutePath = path.isAbsolute(dirPath) ? dirPath : getAbsolutePath(dirPath);

    if (!validatePath(absolutePath)) {
      throw new Error(`Path is outside workspace: ${dirPath}`);
    }

    const entries = await fs.readdir(absolutePath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(dirPath, entry.name));
  } catch (error) {
    logger.error(`Failed to list directories in: ${dirPath}`, error as Error);
    throw error;
  }
}

/**
 * Recursively list all files in directory and subdirectories
 */
export async function listFilesRecursive(
  dirPath: string,
  pattern?: RegExp,
  maxDepth: number = 10
): Promise<string[]> {
  if (maxDepth <= 0) {
    return [];
  }

  try {
    const absolutePath = path.isAbsolute(dirPath) ? dirPath : getAbsolutePath(dirPath);

    if (!validatePath(absolutePath)) {
      throw new Error(`Path is outside workspace: ${dirPath}`);
    }

    const entries = await fs.readdir(absolutePath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Skip node_modules, .git, dist, and other common excluded directories
      if (
        entry.isDirectory() &&
        !['node_modules', '.git', 'dist', 'build', '.cache', 'coverage'].includes(entry.name)
      ) {
        const subFiles = await listFilesRecursive(fullPath, pattern, maxDepth - 1);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        if (!pattern || pattern.test(fullPath)) {
          files.push(fullPath);
        }
      }
    }

    return files;
  } catch (error) {
    logger.error(`Failed to list files recursively in: ${dirPath}`, error as Error);
    throw error;
  }
}

/**
 * Get file stats
 */
export async function getFileStats(filePath: string): Promise<{
  size: number;
  created: Date;
  modified: Date;
  isFile: boolean;
  isDirectory: boolean;
}> {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : getAbsolutePath(filePath);

    if (!validatePath(absolutePath)) {
      throw new Error(`Path is outside workspace: ${filePath}`);
    }

    const stats = await fs.stat(absolutePath);

    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
    };
  } catch (error) {
    logger.error(`Failed to get file stats: ${filePath}`, error as Error);
    throw error;
  }
}

/**
 * Copy file
 */
export async function copyFile(
  sourcePath: string,
  destPath: string
): Promise<void> {
  try {
    const absoluteSource = path.isAbsolute(sourcePath) ? sourcePath : getAbsolutePath(sourcePath);
    const absoluteDest = path.isAbsolute(destPath) ? destPath : getAbsolutePath(destPath);

    if (!validatePath(absoluteSource) || !validatePath(absoluteDest)) {
      throw new Error('Path is outside workspace');
    }

    // Ensure destination directory exists
    const destDir = path.dirname(absoluteDest);
    await fs.mkdir(destDir, { recursive: true });

    await fs.copyFile(absoluteSource, absoluteDest);
    logger.debug(`Copied file from ${sourcePath} to ${destPath}`);
  } catch (error) {
    logger.error(`Failed to copy file from ${sourcePath} to ${destPath}`, error as Error);
    throw error;
  }
}

/**
 * Move/rename file
 */
export async function moveFile(
  sourcePath: string,
  destPath: string
): Promise<void> {
  try {
    const absoluteSource = path.isAbsolute(sourcePath) ? sourcePath : getAbsolutePath(sourcePath);
    const absoluteDest = path.isAbsolute(destPath) ? destPath : getAbsolutePath(destPath);

    if (!validatePath(absoluteSource) || !validatePath(absoluteDest)) {
      throw new Error('Path is outside workspace');
    }

    // Ensure destination directory exists
    const destDir = path.dirname(absoluteDest);
    await fs.mkdir(destDir, { recursive: true });

    await fs.rename(absoluteSource, absoluteDest);
    logger.debug(`Moved file from ${sourcePath} to ${destPath}`);
  } catch (error) {
    logger.error(`Failed to move file from ${sourcePath} to ${destPath}`, error as Error);
    throw error;
  }
}
