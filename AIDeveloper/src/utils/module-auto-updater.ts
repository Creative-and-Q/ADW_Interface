/**
 * Module Auto-Updater
 * Periodically checks modules with autoUpdate=true for updates on master branch
 */

import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import * as logger from "./logger.js";
import { getModulesPath, discoverModules } from "./module-manager.js";
import { query } from "../database.js";

const execAsync = promisify(exec);

const UPDATE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
let updateIntervalId: NodeJS.Timeout | null = null;

interface UpdateResult {
  moduleName: string;
  updated: boolean;
  error?: string;
  newCommits?: number;
  message: string;
}

/**
 * Check if a module has updates available on origin/master
 */
async function checkForUpdates(modulePath: string): Promise<{
  hasUpdates: boolean;
  behindBy: number;
  error?: string;
}> {
  try {
    // Fetch latest from origin without merging
    await execAsync("git fetch origin master", {
      cwd: modulePath,
      timeout: 30000,
    });

    // Check how many commits behind we are
    const { stdout } = await execAsync("git rev-list HEAD..origin/master --count", {
      cwd: modulePath,
    });

    const behindBy = parseInt(stdout.trim(), 10) || 0;

    return {
      hasUpdates: behindBy > 0,
      behindBy,
    };
  } catch (error: unknown) {
    return {
      hasUpdates: false,
      behindBy: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Pull updates for a module from origin/master
 */
async function pullUpdates(modulePath: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    // Check for uncommitted changes
    const { stdout: statusOutput } = await execAsync("git status --porcelain", {
      cwd: modulePath,
    });

    if (statusOutput.trim().length > 0) {
      return {
        success: false,
        message: "Module has uncommitted changes, skipping update",
      };
    }

    // Pull from origin master
    const { stdout } = await execAsync("git pull origin master", {
      cwd: modulePath,
      timeout: 60000,
    });

    return {
      success: true,
      message: stdout.trim() || "Updated successfully",
    };
  } catch (error: unknown) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Rebuild a module after update (npm install + build)
 */
async function rebuildModule(modulePath: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    // Run npm install
    await execAsync("npm install", {
      cwd: modulePath,
      timeout: 120000,
    });

    // Run build if available
    try {
      await execAsync("npm run build", {
        cwd: modulePath,
        timeout: 120000,
      });
    } catch {
      // Build script may not exist, that's ok
    }

    return { success: true, message: "Rebuild completed" };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Rebuild failed: ${message}` };
  }
}

/**
 * Check and update a single module
 */
async function checkAndUpdateModule(moduleName: string): Promise<UpdateResult> {
  const modulePath = path.join(getModulesPath(), moduleName);

  // Check for updates
  const { hasUpdates, behindBy, error: fetchError } = await checkForUpdates(modulePath);

  if (fetchError) {
    return {
      moduleName,
      updated: false,
      error: fetchError,
      message: `Failed to check for updates: ${fetchError}`,
    };
  }

  if (!hasUpdates) {
    return {
      moduleName,
      updated: false,
      message: "Already up to date",
    };
  }

  logger.info(`Module ${moduleName} has ${behindBy} new commit(s), pulling updates...`);

  // Pull updates
  const pullResult = await pullUpdates(modulePath);

  if (!pullResult.success) {
    return {
      moduleName,
      updated: false,
      error: pullResult.message,
      message: pullResult.message,
    };
  }

  // Rebuild module
  const rebuildResult = await rebuildModule(modulePath);

  if (!rebuildResult.success) {
    logger.warn(`Module ${moduleName} updated but rebuild failed: ${rebuildResult.message}`);
  }

  return {
    moduleName,
    updated: true,
    newCommits: behindBy,
    message: `Updated with ${behindBy} new commit(s)${rebuildResult.success ? ", rebuilt successfully" : `, rebuild failed: ${rebuildResult.message}`}`,
  };
}

/**
 * Get list of modules with auto-update enabled from database
 */
async function getAutoUpdateModules(): Promise<string[]> {
  try {
    const result = await query("SELECT module_name FROM module_settings WHERE auto_update = TRUE");
    return result.map((row: { module_name: string }) => row.module_name);
  } catch (error) {
    logger.error("Failed to get auto-update modules from database", error as Error);
    return [];
  }
}

/**
 * Check all modules with autoUpdate=true for updates
 */
export async function checkAllModulesForUpdates(): Promise<UpdateResult[]> {
  const results: UpdateResult[] = [];

  try {
    // Get modules with auto-update enabled from database
    const autoUpdateModuleNames = await getAutoUpdateModules();

    if (autoUpdateModuleNames.length === 0) {
      logger.debug("No modules have auto-update enabled");
      return results;
    }

    // Get all modules to check which have git
    const modules = await discoverModules();
    const moduleMap = new Map(modules.map((m) => [m.name, m]));

    for (const moduleName of autoUpdateModuleNames) {
      const module = moduleMap.get(moduleName);

      // Skip if module not found or doesn't have git
      if (!module) {
        logger.warn(`Auto-update module ${moduleName} not found in modules directory`);
        continue;
      }

      if (!module.hasGit) {
        logger.warn(`Auto-update module ${moduleName} does not have git initialized`);
        continue;
      }

      logger.debug(`Checking ${moduleName} for updates...`);

      const result = await checkAndUpdateModule(moduleName);
      results.push(result);

      if (result.updated) {
        logger.info(`Module ${moduleName}: ${result.message}`);
      }
    }

    // Log summary if any updates occurred
    const updatedModules = results.filter((r) => r.updated);
    if (updatedModules.length > 0) {
      logger.info(`Auto-update: ${updatedModules.length} module(s) updated`, {
        modules: updatedModules.map((m) => m.moduleName),
      });
    }
  } catch (error) {
    logger.error("Failed to check modules for updates", error as Error);
  }

  return results;
}

/**
 * Start the periodic auto-update check
 */
export function startAutoUpdateCheck(): void {
  if (updateIntervalId) {
    logger.warn("Auto-update check already running");
    return;
  }

  logger.info(`Starting module auto-update check (every ${UPDATE_INTERVAL_MS / 1000}s)`);

  // Run immediately on start
  checkAllModulesForUpdates().catch((err) => {
    logger.error("Initial auto-update check failed", err);
  });

  // Then run periodically
  updateIntervalId = setInterval(() => {
    checkAllModulesForUpdates().catch((err) => {
      logger.error("Periodic auto-update check failed", err);
    });
  }, UPDATE_INTERVAL_MS);
}

/**
 * Stop the periodic auto-update check
 */
export function stopAutoUpdateCheck(): void {
  if (updateIntervalId) {
    clearInterval(updateIntervalId);
    updateIntervalId = null;
    logger.info("Stopped module auto-update check");
  }
}

/**
 * Manually trigger an update check for a specific module
 */
export async function triggerModuleUpdate(moduleName: string): Promise<UpdateResult> {
  return checkAndUpdateModule(moduleName);
}
