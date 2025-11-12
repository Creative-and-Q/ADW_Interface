/**
 * Application configuration management
 * Loads and validates environment variables
 */

import dotenv from 'dotenv';
import { AppConfig } from './types.js';

// Load environment variables from .env file
dotenv.config();

/**
 * Get required environment variable or throw error
 */
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Get optional environment variable with default value
 */
function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Get optional numeric environment variable with default
 */
function getOptionalNumericEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

/**
 * Validate configuration
 */
function validateConfig(config: AppConfig): void {
  // Validate port
  if (config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid port number: ${config.port}`);
  }

  // Validate OpenRouter API key format
  if (!config.openrouter.apiKey.startsWith('sk-or-')) {
    throw new Error('Invalid OpenRouter API key format (should start with sk-or-)');
  }

  // Validate database port
  if (config.database.port < 1 || config.database.port > 65535) {
    throw new Error(`Invalid database port: ${config.database.port}`);
  }

  // Validate Redis port
  if (config.redis.port < 1 || config.redis.port > 65535) {
    throw new Error(`Invalid Redis port: ${config.redis.port}`);
  }

  // Validate agent configuration
  if (config.agents.maxConcurrent < 1) {
    throw new Error('MAX_CONCURRENT_AGENTS must be at least 1');
  }

  if (config.agents.timeoutMs < 1000) {
    throw new Error('AGENT_TIMEOUT_MS must be at least 1000ms');
  }

  if (config.agents.maxRetryAttempts < 0) {
    throw new Error('MAX_RETRY_ATTEMPTS must be non-negative');
  }

  // Validate workspace root exists (will be checked at runtime)
  if (!config.workspace.root) {
    throw new Error('WORKSPACE_ROOT must be specified');
  }
}

/**
 * Load and export application configuration
 */
export const config: AppConfig = {
  nodeEnv: getOptionalEnv('NODE_ENV', 'development'),
  port: getOptionalNumericEnv('PORT', 3000),

  openrouter: {
    apiKey: getRequiredEnv('OPENROUTER_API_KEY'),
    models: {
      planning: getOptionalEnv('OPENROUTER_MODEL_PLANNING', 'anthropic/claude-3.5-sonnet'),
      coding: getOptionalEnv('OPENROUTER_MODEL_CODING', 'anthropic/claude-3.5-sonnet'),
      testing: getOptionalEnv('OPENROUTER_MODEL_TESTING', 'anthropic/claude-3.5-haiku'),
      review: getOptionalEnv('OPENROUTER_MODEL_REVIEW', 'anthropic/claude-3.5-sonnet'),
      docs: getOptionalEnv('OPENROUTER_MODEL_DOCS', 'anthropic/claude-3.5-haiku'),
    },
  },

  database: {
    host: getOptionalEnv('DB_HOST', 'localhost'),
    port: getOptionalNumericEnv('DB_PORT', 3306),
    user: getOptionalEnv('DB_USER', 'root'),
    password: getOptionalEnv('DB_PASSWORD', ''),
    name: getOptionalEnv('DB_NAME', 'aideveloper'),
  },

  redis: {
    host: getOptionalEnv('REDIS_HOST', 'localhost'),
    port: getOptionalNumericEnv('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD,
  },

  webhooks: {
    secrets: {
      github: getOptionalEnv('WEBHOOK_SECRET_GITHUB', 'development-secret'),
      gitlab: getOptionalEnv('WEBHOOK_SECRET_GITLAB', 'development-secret'),
      custom: getOptionalEnv('WEBHOOK_SECRET_CUSTOM', 'development-secret'),
    },
  },

  git: {
    userName: getOptionalEnv('GIT_USER_NAME', 'AIDeveloper Bot'),
    userEmail: getOptionalEnv('GIT_USER_EMAIL', 'aideveloper@bot.local'),
    defaultBranch: getOptionalEnv('GIT_DEFAULT_BRANCH', 'main'),
  },

  agents: {
    maxConcurrent: getOptionalNumericEnv('MAX_CONCURRENT_AGENTS', 5),
    timeoutMs: getOptionalNumericEnv('AGENT_TIMEOUT_MS', 300000),
    maxRetryAttempts: getOptionalNumericEnv('MAX_RETRY_ATTEMPTS', 3),
  },

  workspace: {
    root: getRequiredEnv('WORKSPACE_ROOT'),
  },

  logging: {
    level: getOptionalEnv('LOG_LEVEL', 'info'),
    dir: getOptionalEnv('LOG_DIR', './logs'),
  },
};

// Validate configuration on load
validateConfig(config);

// Log configuration (excluding sensitive values)
if (config.nodeEnv === 'development') {
  console.log('Configuration loaded:', {
    ...config,
    openrouter: {
      ...config.openrouter,
      apiKey: '[REDACTED]',
    },
    database: {
      ...config.database,
      password: '[REDACTED]',
    },
    webhooks: {
      secrets: {
        github: '[REDACTED]',
        gitlab: '[REDACTED]',
        custom: '[REDACTED]',
      },
    },
  });
}

export default config;
