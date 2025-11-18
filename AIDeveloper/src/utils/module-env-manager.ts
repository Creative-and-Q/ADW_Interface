/**
 * Module Environment Variable Manager
 * Handles detection, reading, and writing of module environment variables
 */

import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import * as logger from './logger.js';
import { getAllModuleEnvVars, readModuleManifest } from './module-manager.js';

/**
 * Environment variable value with metadata
 */
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
 * Get the full env var key with module prefix
 */
function getFullEnvKey(modulePrefix: string | undefined, key: string): string {
  if (modulePrefix) {
    return `${modulePrefix}_${key}`;
  }
  return key;
}

/**
 * Get environment file path
 */
function getEnvFilePath(): string {
  // Use workspace root .env file
  return path.join(config.workspace.root, '.env');
}

/**
 * Read current environment variables from .env file
 */
export async function readEnvFile(): Promise<Record<string, string>> {
  try {
    const envPath = getEnvFilePath();
    const content = await fs.readFile(envPath, 'utf-8');
    
    // Parse .env file manually
    const env: Record<string, string> = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes
        env[key] = value;
      }
    }
    
    return env;
  } catch (error) {
    // File doesn't exist, return empty object
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    logger.error('Failed to read .env file', error as Error);
    return {};
  }
}

/**
 * Write environment variables to .env file
 */
export async function writeEnvFile(env: Record<string, string>): Promise<void> {
  try {
    const envPath = getEnvFilePath();
    
    // Convert to .env format
    const lines: string[] = [];
    for (const [key, value] of Object.entries(env)) {
      // Escape values that contain spaces or special characters
      const escapedValue = value.includes(' ') || value.includes('=') 
        ? `"${value}"` 
        : value;
      lines.push(`${key}=${escapedValue}`);
    }
    
    await fs.writeFile(envPath, lines.join('\n') + '\n', 'utf-8');
    logger.info('Updated .env file', { variableCount: Object.keys(env).length });
  } catch (error) {
    logger.error('Failed to write .env file', error as Error);
    throw error;
  }
}

/**
 * Get all module environment variables with current values
 */
export async function getAllModuleEnvVarValues(): Promise<EnvVarValue[]> {
  const envVars = await getAllModuleEnvVars();
  const currentEnv = await readEnvFile();
  
  return envVars.map(({ module, envVar }) => {
    const fullKey = getFullEnvKey(envVar.modulePrefix, envVar.key);
    const value = currentEnv[fullKey] ?? envVar.defaultValue ?? null;
    
    return {
      key: fullKey,
      value,
      module,
      definition: {
        description: envVar.description,
        required: envVar.required,
        defaultValue: envVar.defaultValue,
        type: envVar.type,
        secret: envVar.secret,
        modulePrefix: envVar.modulePrefix,
      },
    };
  });
}

/**
 * Get environment variables for a specific module
 */
export async function getModuleEnvVars(moduleName: string): Promise<EnvVarValue[]> {
  const manifest = await readModuleManifest(moduleName);
  if (!manifest || !manifest.envVars) {
    return [];
  }
  
  const currentEnv = await readEnvFile();
  
  return manifest.envVars.map((envVar) => {
    const fullKey = getFullEnvKey(envVar.modulePrefix, envVar.key);
    const value = currentEnv[fullKey] ?? envVar.defaultValue ?? null;
    
    return {
      key: fullKey,
      value,
      module: moduleName,
      definition: {
        description: envVar.description,
        required: envVar.required,
        defaultValue: envVar.defaultValue,
        type: envVar.type,
        secret: envVar.secret,
        modulePrefix: envVar.modulePrefix,
      },
    };
  });
}

/**
 * Update environment variable value
 */
export async function updateEnvVar(
  key: string,
  value: string | null
): Promise<void> {
  const currentEnv = await readEnvFile();
  
  if (value === null || value === '') {
    // Remove variable
    delete currentEnv[key];
  } else {
    // Update or add variable
    currentEnv[key] = value;
  }
  
  await writeEnvFile(currentEnv);
}

/**
 * Update multiple environment variables
 */
export async function updateEnvVars(
  updates: Record<string, string | null>
): Promise<void> {
  const currentEnv = await readEnvFile();
  
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === '') {
      delete currentEnv[key];
    } else {
      currentEnv[key] = value;
    }
  }
  
  await writeEnvFile(currentEnv);
}

/**
 * Validate required environment variables
 */
export async function validateRequiredEnvVars(): Promise<Array<{
  module: string;
  key: string;
  missing: boolean;
}>> {
  const envVars = await getAllModuleEnvVarValues();
  const issues: Array<{ module: string; key: string; missing: boolean }> = [];
  
  for (const envVar of envVars) {
    if (envVar.definition.required && !envVar.value) {
      issues.push({
        module: envVar.module,
        key: envVar.key,
        missing: true,
      });
    }
  }
  
  return issues;
}


