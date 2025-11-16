#!/usr/bin/env node

/**
 * Advanced Branch & File Watcher
 * - Watches for git branch changes
 * - Optionally watches for file changes in .git/HEAD and .git/refs
 * - Auto-rebuilds AIDeveloper backend + frontend
 * - Debounces rapid changes
 * - Shows build progress and status
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AIDEVELOPER_DIR = path.dirname(__dirname);
const FRONTEND_DIR = path.join(AIDEVELOPER_DIR, 'frontend');

// Colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️${colors.reset}  ${msg}`),
  error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.cyan}${'═'.repeat(60)}${colors.reset}\n${colors.cyan}${msg}${colors.reset}\n${colors.cyan}${'═'.repeat(60)}${colors.reset}\n`),
};

/**
 * Get current git branch
 */
async function getCurrentBranch() {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: AIDEVELOPER_DIR,
    });
    return stdout.trim();
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Build AIDeveloper backend
 */
async function buildBackend() {
  log.info('Building AIDeveloper backend...');

  try {
    const { stdout, stderr } = await execAsync('npm run build', {
      cwd: AIDEVELOPER_DIR,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    if (stderr && !stderr.includes('warning')) {
      console.log(stderr);
    }

    log.success('Backend build completed');
    return { success: true };
  } catch (error) {
    log.error(`Backend build failed: ${error.message}`);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.log(error.stderr);
    return { success: false, error: error.message };
  }
}

/**
 * Build frontend
 */
async function buildFrontend() {
  // Check if frontend exists
  if (!fs.existsSync(FRONTEND_DIR)) {
    log.warn(`Frontend directory not found at ${FRONTEND_DIR}`);
    return { success: false, skipped: true };
  }

  log.info('Building frontend...');

  try {
    const { stdout, stderr } = await execAsync('npm run build', {
      cwd: FRONTEND_DIR,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    if (stderr && !stderr.includes('warning')) {
      console.log(stderr);
    }

    log.success('Frontend build completed');
    return { success: true };
  } catch (error) {
    log.error(`Frontend build failed: ${error.message}`);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.log(error.stderr);
    return { success: false, error: error.message };
  }
}

/**
 * Rebuild everything
 */
async function rebuildAll(branch, reason = 'Branch changed') {
  log.header(`${reason}: ${colors.green}${branch}${colors.reset}\n   Rebuilding AIDeveloper + Frontend...`);

  const startTime = Date.now();

  // Build both in parallel for speed
  const [backendResult, frontendResult] = await Promise.all([
    buildBackend(),
    buildFrontend(),
  ]);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(); // Empty line
  log.header(`Build Summary (${duration}s)`);

  if (backendResult.success && frontendResult.success) {
    log.success('All builds completed successfully!');
  } else if (backendResult.success && frontendResult.skipped) {
    log.success('Backend build completed (Frontend skipped)');
  } else if (backendResult.success) {
    log.warn('Backend OK, Frontend failed');
  } else if (frontendResult.success) {
    log.warn('Frontend OK, Backend failed');
  } else {
    log.error('Both builds failed');
  }

  console.log(); // Empty line
}

/**
 * Watch for branch changes using .git/HEAD file
 */
function watchGitHead() {
  const gitHeadPath = path.join(AIDEVELOPER_DIR, '.git', 'HEAD');
  let currentBranch = null;
  let debounceTimer = null;

  const checkBranch = async () => {
    const newBranch = await getCurrentBranch();

    if (currentBranch && newBranch !== currentBranch) {
      // Branch changed!
      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(async () => {
        await rebuildAll(newBranch);
        currentBranch = newBranch;
        log.info(`${colors.yellow}Watching for changes...${colors.reset}`);
      }, 500); // Debounce 500ms
    } else if (!currentBranch) {
      currentBranch = newBranch;
    }
  };

  // Initial check
  checkBranch();

  // Watch .git/HEAD for changes
  try {
    fs.watch(gitHeadPath, { persistent: true }, (eventType) => {
      if (eventType === 'change') {
        checkBranch();
      }
    });
    log.success(`Watching ${gitHeadPath}`);
  } catch (error) {
    log.warn('Could not watch .git/HEAD, falling back to polling');
    // Fall back to polling
    setInterval(checkBranch, 2000);
  }
}

/**
 * Main
 */
async function main() {
  console.clear();
  log.header('👀 Advanced Branch Watcher');

  const currentBranch = await getCurrentBranch();
  log.info(`Current branch: ${colors.green}${currentBranch}${colors.reset}`);
  log.info(`Monitoring: ${AIDEVELOPER_DIR}`);
  log.info(`${colors.yellow}Watching for branch changes... (Ctrl+C to stop)${colors.reset}\n`);

  // Start watching
  watchGitHead();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Branch watcher stopped.${colors.reset}`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(`\n${colors.yellow}Branch watcher stopped.${colors.reset}`);
  process.exit(0);
});

// Run
main().catch((error) => {
  log.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
