/**
 * Module Manager
 * Handles discovery and management of ex_nihilo modules
 */

import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import * as logger from './logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ModuleManifest, ModulePluginMetadata } from '../types/module-plugin.js';

const execAsync = promisify(exec);

export interface Module {
  name: string;
  path: string;
  description?: string;
  version?: string;
  hasGit: boolean;
  gitStatus?: {
    branch: string;
    lastCommit?: {
      hash: string;
      message: string;
      date: string;
    };
    isDirty: boolean;
  };
  hasPackageJson: boolean;
  packageInfo?: {
    name: string;
    version: string;
    description?: string;
    dependencies?: Record<string, string>;
  };
  hasPrompts: boolean;
  prompts?: string[];
}

/**
 * Get modules directory path
 */
export function getModulesPath(): string {
  return path.join(config.workspace.root, 'modules');
}

/**
 * Discover all modules in the modules directory
 */
export async function discoverModules(): Promise<Module[]> {
  try {
    const modulesPath = getModulesPath();

    // Check if modules directory exists
    try {
      await fs.access(modulesPath);
    } catch {
      logger.warn('Modules directory does not exist', { path: modulesPath });
      return [];
    }

    // Read all directories in modules
    const entries = await fs.readdir(modulesPath, { withFileTypes: true });
    const moduleDirs = entries.filter(entry => entry.isDirectory());

    // Get detailed info for each module
    const modules = await Promise.all(
      moduleDirs.map(dir => getModuleInfo(dir.name))
    );

    return modules.filter((m): m is Module => m !== null);
  } catch (error) {
    logger.error('Failed to discover modules', error as Error);
    return [];
  }
}

/**
 * Get detailed information about a specific module
 */
export async function getModuleInfo(moduleName: string): Promise<Module | null> {
  try {
    const modulePath = path.join(getModulesPath(), moduleName);

    // Check if module directory exists
    try {
      const stat = await fs.stat(modulePath);
      if (!stat.isDirectory()) {
        return null;
      }
    } catch {
      return null;
    }

    const module: Module = {
      name: moduleName,
      path: modulePath,
      hasGit: false,
      hasPackageJson: false,
      hasPrompts: false,
    };

    // Check for Git repository
    try {
      await fs.access(path.join(modulePath, '.git'));
      module.hasGit = true;
      module.gitStatus = await getGitStatus(modulePath);
    } catch {
      // No git repository
    }

    // Check for package.json
    try {
      const packageJsonPath = path.join(modulePath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      module.hasPackageJson = true;
      module.packageInfo = {
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description,
        dependencies: packageJson.dependencies,
      };
      module.description = packageJson.description;
      module.version = packageJson.version;
    } catch {
      // No package.json
    }

    // Check for AI prompts directory
    try {
      const promptsPath = path.join(modulePath, 'config', 'prompts');
      await fs.access(promptsPath);
      const promptFiles = await fs.readdir(promptsPath);
      module.hasPrompts = promptFiles.length > 0;
      module.prompts = promptFiles.filter(f => f.endsWith('.md'));
    } catch {
      // No prompts directory
    }

    return module;
  } catch (error) {
    logger.error(`Failed to get module info for ${moduleName}`, error as Error);
    return null;
  }
}

/**
 * Get Git status for a module
 */
async function getGitStatus(modulePath: string): Promise<{
  branch: string;
  lastCommit?: { hash: string; message: string; date: string };
  isDirty: boolean;
}> {
  try {
    // Get current branch
    const { stdout: branchOutput } = await execAsync('git branch --show-current', {
      cwd: modulePath,
    });
    const branch = branchOutput.trim();

    // Get last commit info
    let lastCommit;
    try {
      const { stdout: commitOutput } = await execAsync(
        'git log -1 --format="%H|%s|%ai"',
        { cwd: modulePath }
      );
      const [hash, message, date] = commitOutput.trim().split('|');
      lastCommit = { hash, message, date };
    } catch {
      // No commits yet
    }

    // Check if working directory is dirty
    const { stdout: statusOutput } = await execAsync('git status --porcelain', {
      cwd: modulePath,
    });
    const isDirty = statusOutput.trim().length > 0;

    return {
      branch,
      lastCommit,
      isDirty,
    };
  } catch (error) {
    logger.error('Failed to get git status', error as Error);
    return {
      branch: 'unknown',
      isDirty: false,
    };
  }
}

/**
 * Get commit history for a module
 */
export async function getModuleCommitHistory(
  moduleName: string,
  limit: number = 50
): Promise<Array<{
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}>> {
  try {
    const modulePath = path.join(getModulesPath(), moduleName);

    const { stdout } = await execAsync(
      `git log -${limit} --format="%H|%h|%s|%an|%ai"`,
      { cwd: modulePath }
    );

    const commits = stdout
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => {
        const [hash, shortHash, message, author, date] = line.split('|');
        return { hash, shortHash, message, author, date };
      });

    return commits;
  } catch (error) {
    logger.error(`Failed to get commit history for ${moduleName}`, error as Error);
    return [];
  }
}

/**
 * Get prompts for a module
 */
export async function getModulePrompts(moduleName: string): Promise<Array<{
  name: string;
  path: string;
  content?: string;
}>> {
  try {
    const promptsPath = path.join(getModulesPath(), moduleName, 'config', 'prompts');

    const files = await fs.readdir(promptsPath);
    const promptFiles = files.filter(f => f.endsWith('.md'));

    const prompts = await Promise.all(
      promptFiles.map(async (file) => {
        const filePath = path.join(promptsPath, file);
        return {
          name: file,
          path: filePath,
        };
      })
    );

    return prompts;
  } catch (error) {
    logger.debug(`No prompts found for ${moduleName}`, { error: (error as Error).message });
    return [];
  }
}

/**
 * Read a specific prompt file
 */
export async function getModulePromptContent(
  moduleName: string,
  promptName: string
): Promise<string | null> {
  try {
    const promptPath = path.join(
      getModulesPath(),
      moduleName,
      'config',
      'prompts',
      promptName
    );
    const content = await fs.readFile(promptPath, 'utf-8');
    return content;
  } catch (error) {
    logger.error(`Failed to read prompt ${promptName} for ${moduleName}`, error as Error);
    return null;
  }
}

/**
 * Update a module prompt file
 */
export async function updateModulePrompt(
  moduleName: string,
  promptName: string,
  content: string
): Promise<boolean> {
  try {
    const promptPath = path.join(
      getModulesPath(),
      moduleName,
      'config',
      'prompts',
      promptName
    );
    await fs.writeFile(promptPath, content, 'utf-8');
    logger.info(`Updated prompt ${promptName} for ${moduleName}`);
    return true;
  } catch (error) {
    logger.error(`Failed to update prompt ${promptName} for ${moduleName}`, error as Error);
    return false;
  }
}

/**
 * Get file statistics for a module
 */
export async function getModuleStats(moduleName: string): Promise<{
  totalFiles: number;
  totalLines: number;
  filesByType: Record<string, number>;
}> {
  try {
    const modulePath = path.join(getModulesPath(), moduleName);

    // Count files recursively
    const countFiles = async (dir: string): Promise<{
      files: string[];
      totalLines: number;
    }> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      let files: string[] = [];
      let totalLines = 0;

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip node_modules, .git, dist, etc.
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
          continue;
        }

        if (entry.isDirectory()) {
          const subResult = await countFiles(fullPath);
          files = files.concat(subResult.files);
          totalLines += subResult.totalLines;
        } else if (entry.isFile()) {
          files.push(fullPath);

          // Count lines for text files
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            totalLines += content.split('\n').length;
          } catch {
            // Binary file or read error, skip
          }
        }
      }

      return { files, totalLines };
    };

    const { files, totalLines } = await countFiles(modulePath);

    // Group by file type
    const filesByType: Record<string, number> = {};
    for (const file of files) {
      const ext = path.extname(file).slice(1) || 'no-extension';
      filesByType[ext] = (filesByType[ext] || 0) + 1;
    }

    return {
      totalFiles: files.length,
      totalLines,
      filesByType,
    };
  } catch (error) {
    logger.error(`Failed to get stats for ${moduleName}`, error as Error);
    return {
      totalFiles: 0,
      totalLines: 0,
      filesByType: {},
    };
  }
}

/**
 * Read module manifest from module.json or aideveloper.json
 */
export async function readModuleManifest(moduleName: string): Promise<ModuleManifest | null> {
  try {
    const modulePath = path.join(getModulesPath(), moduleName);
    
    // Try module.json first, then aideveloper.json
    const manifestPaths = [
      path.join(modulePath, 'module.json'),
      path.join(modulePath, 'aideveloper.json'),
    ];

    for (const manifestPath of manifestPaths) {
      try {
        const content = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(content) as ModuleManifest;
        
        // Validate required fields
        if (!manifest.name || !manifest.version || !manifest.description) {
          logger.warn(`Invalid manifest for ${moduleName}: missing required fields`);
          return null;
        }

        return manifest;
      } catch {
        // File doesn't exist, try next
        continue;
      }
    }

    return null;
  } catch (error) {
    logger.error(`Failed to read manifest for ${moduleName}`, error as Error);
    return null;
  }
}

/**
 * Get module plugin metadata (includes manifest)
 */
export async function getModulePluginMetadata(moduleName: string): Promise<ModulePluginMetadata | null> {
  try {
    const module = await getModuleInfo(moduleName);
    if (!module) {
      return null;
    }

    const manifest = await readModuleManifest(moduleName);
    
    // Check for frontend directory
    const frontendPath = path.join(module.path, 'frontend');
    let hasFrontend = false;
    try {
      const stat = await fs.stat(frontendPath);
      hasFrontend = stat.isDirectory();
    } catch {
      hasFrontend = false;
    }

    return {
      name: module.name,
      path: module.path,
      manifest: manifest || undefined,
      hasManifest: !!manifest,
      hasFrontend,
      frontendPath: hasFrontend ? frontendPath : undefined,
    };
  } catch (error) {
    logger.error(`Failed to get plugin metadata for ${moduleName}`, error as Error);
    return null;
  }
}

/**
 * Get all module manifests
 */
export async function getAllModuleManifests(): Promise<Map<string, ModuleManifest>> {
  const modules = await discoverModules();
  const manifests = new Map<string, ModuleManifest>();

  for (const module of modules) {
    const manifest = await readModuleManifest(module.name);
    if (manifest) {
      manifests.set(module.name, manifest);
    }
  }

  return manifests;
}

/**
 * Get all module pages from manifests
 */
export async function getAllModulePages(): Promise<Array<{
  module: string;
  page: import('../types/module-plugin.js').ModulePage;
}>> {
  const manifests = await getAllModuleManifests();
  const pages: Array<{ module: string; page: import('../types/module-plugin.js').ModulePage }> = [];

  for (const [moduleName, manifest] of manifests) {
    if (manifest.pages) {
      for (const page of manifest.pages) {
        pages.push({ module: moduleName, page });
      }
    }
  }

  return pages;
}

/**
 * Get all dashboard widgets from manifests
 */
export async function getAllDashboardWidgets(): Promise<Array<{
  module: string;
  widget: import('../types/module-plugin.js').DashboardWidget;
}>> {
  const manifests = await getAllModuleManifests();
  const widgets: Array<{ module: string; widget: import('../types/module-plugin.js').DashboardWidget }> = [];

  for (const [moduleName, manifest] of manifests) {
    if (manifest.dashboardWidgets) {
      for (const widget of manifest.dashboardWidgets) {
        widgets.push({ module: moduleName, widget });
      }
    }
  }

  return widgets;
}

/**
 * Get all environment variables from manifests
 */
export async function getAllModuleEnvVars(): Promise<Array<{
  module: string;
  envVar: import('../types/module-plugin.js').EnvVarDefinition;
}>> {
  const manifests = await getAllModuleManifests();
  const envVars: Array<{ module: string; envVar: import('../types/module-plugin.js').EnvVarDefinition }> = [];

  for (const [moduleName, manifest] of manifests) {
    if (manifest.envVars) {
      for (const envVar of manifest.envVars) {
        envVars.push({ module: moduleName, envVar });
      }
    }
  }

  return envVars;
}

/**
 * Get all API routes from manifests
 */
export async function getAllApiRoutes(): Promise<Array<{
  module: string;
  route: import('../types/module-plugin.js').ApiRoute;
}>> {
  const manifests = await getAllModuleManifests();
  const routes: Array<{ module: string; route: import('../types/module-plugin.js').ApiRoute }> = [];

  for (const [moduleName, manifest] of manifests) {
    if (manifest.apiRoutes) {
      for (const route of manifest.apiRoutes) {
        routes.push({ module: moduleName, route });
      }
    }
  }

  return routes;
}
