#!/usr/bin/env tsx
/**
 * Module Installation Script
 *
 * This script manages the installation and updating of AIDeveloper workflow modules.
 * It reads the module configuration from config/modules.json and ensures all required
 * modules are cloned and up-to-date.
 *
 * Usage:
 *   npx tsx scripts/install-modules.ts [options]
 *
 * Options:
 *   --all       Install all modules (including optional ones)
 *   --update    Update existing modules instead of skipping
 *   --module=X  Install only a specific module by name
 *   --list      List all available modules and their status
 *   --help      Show this help message
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ModuleConfig {
  name: string;
  repo: string;
  description: string;
  required: boolean;
}

interface ModulesConfig {
  organization: string;
  modulesDirectory: string;
  defaultBranch: string;
  modules: ModuleConfig[];
}

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message: string): void {
  log(`✓ ${message}`, colors.green);
}

function logError(message: string): void {
  log(`✗ ${message}`, colors.red);
}

function logInfo(message: string): void {
  log(`ℹ ${message}`, colors.cyan);
}

function logWarning(message: string): void {
  log(`⚠ ${message}`, colors.yellow);
}

function loadConfig(): ModulesConfig {
  const configPath = path.join(__dirname, '..', 'config', 'modules.json');
  if (!fs.existsSync(configPath)) {
    logError(`Configuration file not found: ${configPath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function getModulesDirectory(config: ModulesConfig): string {
  const aiDevDir = path.join(__dirname, '..');
  return path.resolve(aiDevDir, config.modulesDirectory);
}

function isModuleInstalled(modulesDir: string, moduleName: string): boolean {
  const modulePath = path.join(modulesDir, moduleName);
  return fs.existsSync(modulePath) && fs.existsSync(path.join(modulePath, '.git'));
}

function getModuleStatus(modulesDir: string, moduleName: string): string {
  const modulePath = path.join(modulesDir, moduleName);
  if (!fs.existsSync(modulePath)) {
    return 'not installed';
  }
  if (!fs.existsSync(path.join(modulePath, '.git'))) {
    return 'exists (no git)';
  }

  try {
    const status = execSync('git status --porcelain', {
      cwd: modulePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (status.trim()) {
      return 'installed (uncommitted changes)';
    }

    // Check if behind remote
    try {
      execSync('git fetch --dry-run 2>&1', {
        cwd: modulePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      // Ignore fetch errors
    }

    return 'installed';
  } catch {
    return 'installed (status unknown)';
  }
}

function cloneModule(config: ModulesConfig, module: ModuleConfig, modulesDir: string): boolean {
  const modulePath = path.join(modulesDir, module.name);
  const repoUrl = `git@github.com:${config.organization}/${module.repo}.git`;

  log(`\nCloning ${module.name}...`, colors.blue);
  logInfo(`Repository: ${repoUrl}`);

  try {
    execSync(`git clone ${repoUrl} "${modulePath}"`, {
      stdio: 'inherit',
    });
    logSuccess(`${module.name} cloned successfully`);
    return true;
  } catch (error) {
    logError(`Failed to clone ${module.name}`);
    return false;
  }
}

function updateModule(module: ModuleConfig, modulesDir: string, branch: string): boolean {
  const modulePath = path.join(modulesDir, module.name);

  log(`\nUpdating ${module.name}...`, colors.blue);

  try {
    // Check for uncommitted changes
    const status = execSync('git status --porcelain', {
      cwd: modulePath,
      encoding: 'utf-8',
    });

    if (status.trim()) {
      logWarning(`${module.name} has uncommitted changes, skipping update`);
      return false;
    }

    // Fetch and pull
    execSync(`git fetch origin && git pull origin ${branch}`, {
      cwd: modulePath,
      stdio: 'inherit',
    });

    logSuccess(`${module.name} updated successfully`);
    return true;
  } catch (error) {
    logError(`Failed to update ${module.name}`);
    return false;
  }
}

function installDependencies(module: ModuleConfig, modulesDir: string): boolean {
  const modulePath = path.join(modulesDir, module.name);
  const packageJsonPath = path.join(modulePath, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return true; // No package.json, nothing to install
  }

  log(`Installing dependencies for ${module.name}...`, colors.cyan);

  try {
    execSync('npm install', {
      cwd: modulePath,
      stdio: 'inherit',
    });
    logSuccess(`Dependencies installed for ${module.name}`);
    return true;
  } catch (error) {
    logError(`Failed to install dependencies for ${module.name}`);
    return false;
  }
}

function showHelp(): void {
  console.log(`
${colors.bright}AIDeveloper Module Installation Tool${colors.reset}

${colors.cyan}Usage:${colors.reset}
  npx tsx scripts/install-modules.ts [options]

${colors.cyan}Options:${colors.reset}
  --all         Install all modules (including optional ones)
  --update      Update existing modules instead of skipping
  --module=X    Install only a specific module by name
  --list        List all available modules and their status
  --no-deps     Skip npm install for dependencies
  --help        Show this help message

${colors.cyan}Examples:${colors.reset}
  # Install all required modules
  npx tsx scripts/install-modules.ts

  # Install all modules including optional
  npx tsx scripts/install-modules.ts --all

  # Update all installed modules
  npx tsx scripts/install-modules.ts --update

  # Install a specific module
  npx tsx scripts/install-modules.ts --module=CodingAgent

  # List module status
  npx tsx scripts/install-modules.ts --list
`);
}

function listModules(config: ModulesConfig, modulesDir: string): void {
  console.log(`\n${colors.bright}Available Modules:${colors.reset}\n`);

  const maxNameLen = Math.max(...config.modules.map(m => m.name.length));

  for (const module of config.modules) {
    const status = getModuleStatus(modulesDir, module.name);
    const required = module.required ? colors.red + '[required]' + colors.reset : colors.yellow + '[optional]' + colors.reset;
    const statusColor = status === 'installed' ? colors.green :
                       status === 'not installed' ? colors.red :
                       colors.yellow;

    console.log(
      `  ${module.name.padEnd(maxNameLen)}  ${required}  ${statusColor}${status}${colors.reset}`
    );
    console.log(`    ${colors.cyan}${module.description}${colors.reset}`);
    console.log();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  const installAll = args.includes('--all');
  const shouldUpdate = args.includes('--update');
  const showList = args.includes('--list');
  const skipDeps = args.includes('--no-deps');
  const showHelpFlag = args.includes('--help') || args.includes('-h');

  const moduleArg = args.find(a => a.startsWith('--module='));
  const specificModule = moduleArg ? moduleArg.split('=')[1] : null;

  if (showHelpFlag) {
    showHelp();
    return;
  }

  const config = loadConfig();
  const modulesDir = getModulesDirectory(config);

  // Ensure modules directory exists
  if (!fs.existsSync(modulesDir)) {
    log(`Creating modules directory: ${modulesDir}`, colors.cyan);
    fs.mkdirSync(modulesDir, { recursive: true });
  }

  if (showList) {
    listModules(config, modulesDir);
    return;
  }

  console.log(`\n${colors.bright}AIDeveloper Module Installation${colors.reset}`);
  console.log(`${colors.cyan}Organization: ${config.organization}${colors.reset}`);
  console.log(`${colors.cyan}Modules directory: ${modulesDir}${colors.reset}\n`);

  // Filter modules to install
  let modulesToProcess = config.modules;

  if (specificModule) {
    modulesToProcess = config.modules.filter(m => m.name === specificModule);
    if (modulesToProcess.length === 0) {
      logError(`Module not found: ${specificModule}`);
      console.log(`\nAvailable modules:`);
      config.modules.forEach(m => console.log(`  - ${m.name}`));
      process.exit(1);
    }
  } else if (!installAll) {
    modulesToProcess = config.modules.filter(m => m.required);
    logInfo(`Installing required modules only. Use --all for all modules.`);
  }

  let installed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const module of modulesToProcess) {
    const isInstalled = isModuleInstalled(modulesDir, module.name);

    if (isInstalled) {
      if (shouldUpdate) {
        if (updateModule(module, modulesDir, config.defaultBranch)) {
          updated++;
        } else {
          skipped++;
        }
      } else {
        logInfo(`${module.name} already installed, skipping (use --update to update)`);
        skipped++;
      }
    } else {
      if (cloneModule(config, module, modulesDir)) {
        installed++;
        if (!skipDeps) {
          installDependencies(module, modulesDir);
        }
      } else {
        failed++;
      }
    }
  }

  // Summary
  console.log(`\n${colors.bright}Summary:${colors.reset}`);
  if (installed > 0) logSuccess(`Installed: ${installed}`);
  if (updated > 0) logSuccess(`Updated: ${updated}`);
  if (skipped > 0) logInfo(`Skipped: ${skipped}`);
  if (failed > 0) logError(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  logError(`Unexpected error: ${error.message}`);
  process.exit(1);
});
