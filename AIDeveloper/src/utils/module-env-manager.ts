/**
 * Module Environment Variable Manager
 * Handles reading and writing environment variables directly from each module's .env file
 */

import fs from 'fs/promises';
import path from 'path';
import { discoverModules, getModulesPath } from './module-manager.js';
import * as logger from './logger.js';

/**
 * Parsed environment variable from a module's .env file
 */
export interface ModuleEnvVar {
  key: string;
  value: string;
  comment?: string; // Comment from .env.example if available
}

/**
 * Environment variable status for a module
 */
export interface ModuleEnvStatus {
  moduleName: string;
  modulePath: string;
  hasEnvFile: boolean;
  hasEnvExample: boolean;
  envVars: ModuleEnvVar[];
  missingFromExample: string[]; // Keys in .env.example but not in .env
}

/**
 * Parse a .env file content into key-value pairs
 */
function parseEnvFile(content: string): Map<string, string> {
  const env = new Map<string, string>();
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env.set(key, value);
    }
  }

  return env;
}

/**
 * Parse a .env.example file to extract keys and comments
 */
function parseEnvExample(content: string): Map<string, { defaultValue: string; comment?: string }> {
  const envExample = new Map<string, { defaultValue: string; comment?: string }>();
  const lines = content.split('\n');
  let currentComment = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Track comments
    if (trimmed.startsWith('#')) {
      currentComment = trimmed.slice(1).trim();
      continue;
    }

    if (!trimmed) {
      currentComment = '';
      continue;
    }

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let defaultValue = match[2].trim();
      // Remove surrounding quotes if present
      if ((defaultValue.startsWith('"') && defaultValue.endsWith('"')) ||
          (defaultValue.startsWith("'") && defaultValue.endsWith("'"))) {
        defaultValue = defaultValue.slice(1, -1);
      }
      envExample.set(key, {
        defaultValue,
        comment: currentComment || undefined,
      });
      currentComment = '';
    }
  }

  return envExample;
}

/**
 * Serialize environment variables back to .env format
 */
function serializeEnvFile(env: Map<string, string>): string {
  const lines: string[] = [];

  for (const [key, value] of env) {
    // Escape values that contain spaces, equals, or special characters
    const escapedValue = value.includes(' ') || value.includes('=') || value.includes('#')
      ? `"${value}"`
      : value;
    lines.push(`${key}=${escapedValue}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Get the .env file path for a module
 */
function getModuleEnvPath(moduleName: string): string {
  return path.join(getModulesPath(), moduleName, '.env');
}

/**
 * Get the .env.example file path for a module
 */
function getModuleEnvExamplePath(moduleName: string): string {
  return path.join(getModulesPath(), moduleName, '.env.example');
}

/**
 * Read environment variables from a module's .env file
 */
export async function readModuleEnvFile(moduleName: string): Promise<Map<string, string>> {
  try {
    const envPath = getModuleEnvPath(moduleName);
    const content = await fs.readFile(envPath, 'utf-8');
    return parseEnvFile(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Map();
    }
    logger.error(`Failed to read .env file for ${moduleName}`, error as Error);
    return new Map();
  }
}

/**
 * Read .env.example file for a module
 */
export async function readModuleEnvExample(moduleName: string): Promise<Map<string, { defaultValue: string; comment?: string }>> {
  try {
    const envExamplePath = getModuleEnvExamplePath(moduleName);
    const content = await fs.readFile(envExamplePath, 'utf-8');
    return parseEnvExample(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Map();
    }
    logger.error(`Failed to read .env.example file for ${moduleName}`, error as Error);
    return new Map();
  }
}

/**
 * Check if a module has a .env file
 */
export async function hasEnvFile(moduleName: string): Promise<boolean> {
  try {
    await fs.access(getModuleEnvPath(moduleName));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a module has a .env.example file
 */
export async function hasEnvExample(moduleName: string): Promise<boolean> {
  try {
    await fs.access(getModuleEnvExamplePath(moduleName));
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy .env.example to .env for a module (if .env doesn't exist)
 */
export async function copyEnvExample(moduleName: string): Promise<boolean> {
  try {
    const envPath = getModuleEnvPath(moduleName);
    const envExamplePath = getModuleEnvExamplePath(moduleName);

    // Check if .env already exists
    if (await hasEnvFile(moduleName)) {
      logger.info(`Module ${moduleName} already has a .env file`);
      return false;
    }

    // Check if .env.example exists
    if (!await hasEnvExample(moduleName)) {
      logger.info(`Module ${moduleName} does not have a .env.example file`);
      return false;
    }

    // Copy the file
    await fs.copyFile(envExamplePath, envPath);
    logger.info(`Copied .env.example to .env for module ${moduleName}`);
    return true;
  } catch (error) {
    logger.error(`Failed to copy .env.example for ${moduleName}`, error as Error);
    return false;
  }
}

/**
 * Get the environment status for a single module
 */
export async function getModuleEnvStatus(moduleName: string): Promise<ModuleEnvStatus> {
  const modulePath = path.join(getModulesPath(), moduleName);
  const hasEnv = await hasEnvFile(moduleName);
  const hasExample = await hasEnvExample(moduleName);

  const currentEnv = await readModuleEnvFile(moduleName);
  const exampleEnv = await readModuleEnvExample(moduleName);

  // Build list of env vars with comments from example
  const envVars: ModuleEnvVar[] = [];
  for (const [key, value] of currentEnv) {
    const exampleInfo = exampleEnv.get(key);
    envVars.push({
      key,
      value,
      comment: exampleInfo?.comment,
    });
  }

  // Find keys that are in .env.example but not in .env
  const missingFromExample: string[] = [];
  for (const key of exampleEnv.keys()) {
    if (!currentEnv.has(key)) {
      missingFromExample.push(key);
    }
  }

  return {
    moduleName,
    modulePath,
    hasEnvFile: hasEnv,
    hasEnvExample: hasExample,
    envVars,
    missingFromExample,
  };
}

/**
 * Get environment status for all modules
 */
export async function getAllModulesEnvStatus(): Promise<ModuleEnvStatus[]> {
  const modules = await discoverModules();
  const statuses: ModuleEnvStatus[] = [];

  for (const module of modules) {
    const status = await getModuleEnvStatus(module.name);
    statuses.push(status);
  }

  return statuses;
}

/**
 * Update a single environment variable in a module's .env file
 */
export async function updateModuleEnvVar(
  moduleName: string,
  key: string,
  value: string
): Promise<void> {
  const envPath = getModuleEnvPath(moduleName);
  const currentEnv = await readModuleEnvFile(moduleName);

  currentEnv.set(key, value);

  await fs.writeFile(envPath, serializeEnvFile(currentEnv), 'utf-8');
  logger.info(`Updated ${key} in ${moduleName}/.env`);
}

/**
 * Update multiple environment variables in a module's .env file
 */
export async function updateModuleEnvVars(
  moduleName: string,
  updates: Record<string, string | null>
): Promise<void> {
  const envPath = getModuleEnvPath(moduleName);
  const currentEnv = await readModuleEnvFile(moduleName);

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === '') {
      currentEnv.delete(key);
    } else {
      currentEnv.set(key, value);
    }
  }

  await fs.writeFile(envPath, serializeEnvFile(currentEnv), 'utf-8');
  logger.info(`Updated ${Object.keys(updates).length} variables in ${moduleName}/.env`);
}

/**
 * Delete an environment variable from a module's .env file
 */
export async function deleteModuleEnvVar(
  moduleName: string,
  key: string
): Promise<void> {
  const envPath = getModuleEnvPath(moduleName);
  const currentEnv = await readModuleEnvFile(moduleName);

  currentEnv.delete(key);

  await fs.writeFile(envPath, serializeEnvFile(currentEnv), 'utf-8');
  logger.info(`Deleted ${key} from ${moduleName}/.env`);
}

/**
 * Add missing variables from .env.example to .env with their default values
 */
export async function syncEnvWithExample(moduleName: string): Promise<string[]> {
  const currentEnv = await readModuleEnvFile(moduleName);
  const exampleEnv = await readModuleEnvExample(moduleName);

  const addedKeys: string[] = [];

  for (const [key, { defaultValue }] of exampleEnv) {
    if (!currentEnv.has(key)) {
      currentEnv.set(key, defaultValue);
      addedKeys.push(key);
    }
  }

  if (addedKeys.length > 0) {
    const envPath = getModuleEnvPath(moduleName);
    await fs.writeFile(envPath, serializeEnvFile(currentEnv), 'utf-8');
    logger.info(`Added ${addedKeys.length} missing variables to ${moduleName}/.env`);
  }

  return addedKeys;
}

/**
 * Create a new .env file for a module with given variables
 */
export async function createModuleEnvFile(
  moduleName: string,
  vars: Record<string, string>
): Promise<void> {
  const envPath = getModuleEnvPath(moduleName);
  const env = new Map(Object.entries(vars));

  await fs.writeFile(envPath, serializeEnvFile(env), 'utf-8');
  logger.info(`Created .env file for ${moduleName} with ${Object.keys(vars).length} variables`);
}

// ============================================================================
// Legacy API compatibility layer (deprecated - will be removed in future)
// These functions maintain compatibility with the old global .env system
// ============================================================================

export interface EnvVarValue {
  key: string;
  value: string | null;
  module: string;
  definition: {
    description: string;
    required: boolean;
    defaultValue?: string;
    type?: 'string' | 'number' | 'boolean';
    secret?: boolean;
    modulePrefix?: string;
  };
}

/**
 * @deprecated Use getModuleEnvStatus or getAllModulesEnvStatus instead
 */
export async function getAllModuleEnvVarValues(): Promise<EnvVarValue[]> {
  const statuses = await getAllModulesEnvStatus();
  const results: EnvVarValue[] = [];

  for (const status of statuses) {
    for (const envVar of status.envVars) {
      results.push({
        key: envVar.key,
        value: envVar.value,
        module: status.moduleName,
        definition: {
          description: envVar.comment || '',
          required: false,
          defaultValue: undefined,
          type: 'string',
          secret: envVar.key.toLowerCase().includes('key') ||
                  envVar.key.toLowerCase().includes('secret') ||
                  envVar.key.toLowerCase().includes('password'),
        },
      });
    }
  }

  return results;
}

/**
 * @deprecated Use getModuleEnvStatus instead
 */
export async function getModuleEnvVars(moduleName: string): Promise<EnvVarValue[]> {
  const status = await getModuleEnvStatus(moduleName);

  return status.envVars.map(envVar => ({
    key: envVar.key,
    value: envVar.value,
    module: moduleName,
    definition: {
      description: envVar.comment || '',
      required: false,
      defaultValue: undefined,
      type: 'string' as const,
      secret: envVar.key.toLowerCase().includes('key') ||
              envVar.key.toLowerCase().includes('secret') ||
              envVar.key.toLowerCase().includes('password'),
    },
  }));
}

/**
 * @deprecated Use updateModuleEnvVar instead
 */
export async function updateEnvVar(
  _key: string,
  _value: string | null
): Promise<void> {
  // This is a legacy function - it used to update a global .env file
  // Now it's essentially a no-op since we've moved to per-module .env files
  logger.warn('updateEnvVar is deprecated - use updateModuleEnvVar instead');
}

/**
 * @deprecated Use updateModuleEnvVars instead
 */
export async function updateEnvVars(
  _updates: Record<string, string | null>
): Promise<void> {
  // This is a legacy function - it used to update a global .env file
  // Now it's essentially a no-op since we've moved to per-module .env files
  logger.warn('updateEnvVars is deprecated - use updateModuleEnvVars instead');
}

/**
 * @deprecated No longer used with per-module .env files
 */
export async function validateRequiredEnvVars(): Promise<Array<{
  module: string;
  key: string;
  missing: boolean;
}>> {
  // With per-module .env files, validation is simpler - just check for missing keys
  const statuses = await getAllModulesEnvStatus();
  const issues: Array<{ module: string; key: string; missing: boolean }> = [];

  for (const status of statuses) {
    for (const key of status.missingFromExample) {
      issues.push({
        module: status.moduleName,
        key,
        missing: true,
      });
    }
  }

  return issues;
}

/**
 * @deprecated Use readModuleEnvFile instead
 */
export async function readEnvFile(): Promise<Record<string, string>> {
  // Return empty object - the global .env is no longer used
  logger.warn('readEnvFile is deprecated - use readModuleEnvFile instead');
  return {};
}

/**
 * @deprecated This is no longer used
 */
export async function writeEnvFile(_env: Record<string, string>): Promise<void> {
  logger.warn('writeEnvFile is deprecated - use updateModuleEnvVars instead');
}
