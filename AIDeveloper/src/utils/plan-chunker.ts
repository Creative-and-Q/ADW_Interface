/**
 * Plan Chunking Utility
 * Automatically splits large implementation plans into smaller chunks
 * to avoid hitting LLM token limits
 */

import * as logger from './logger.js';

/**
 * Configuration for chunking
 */
const CHUNK_CONFIG = {
  // Maximum files per chunk (conservative to avoid token limits)
  MAX_FILES_PER_CHUNK: 4,

  // Warn if plan has more than this many files
  WARN_THRESHOLD: 5,

  // Maximum tokens we expect per file (rough estimate)
  ESTIMATED_TOKENS_PER_FILE: 2000,

  // Token limit for code generation (leave headroom)
  TOKEN_LIMIT: 14000, // 16384 max, but leave 2K buffer
};

/**
 * File operation from a plan
 */
interface PlanFile {
  path: string;
  action: 'create' | 'modify' | 'delete';
  description?: string;
  priority?: number; // Lower number = higher priority
}

/**
 * Plan structure (matching plan agent output)
 */
interface Plan {
  summary: string;
  scope: string;
  complexity: string;
  estimatedFiles: number;
  files: {
    create: string[];
    modify: string[];
    delete: string[];
  };
  steps: Array<{
    step: number;
    action: string;
    files: string[];
    reason: string;
  }>;
  risks?: any[];
  testStrategy?: string;
  dependencies?: string[];
}

/**
 * Chunked plan piece
 */
export interface PlanChunk {
  chunkIndex: number;
  totalChunks: number;
  summary: string;
  scope: string;
  complexity: string;
  estimatedFiles: number;
  files: {
    create: string[];
    modify: string[];
    delete: string[];
  };
  steps: Array<{
    step: number;
    action: string;
    files: string[];
    reason: string;
  }>;
  dependencies?: string[];
  parentPlan: {
    summary: string;
    totalFiles: number;
  };
}

/**
 * Check if a plan needs to be chunked
 */
export function needsChunking(plan: Plan): boolean {
  const totalFiles =
    (plan.files?.create?.length || 0) +
    (plan.files?.modify?.length || 0) +
    (plan.files?.delete?.length || 0);

  if (totalFiles > CHUNK_CONFIG.WARN_THRESHOLD) {
    logger.info('Plan may need chunking', {
      totalFiles,
      threshold: CHUNK_CONFIG.MAX_FILES_PER_CHUNK,
    });
  }

  return totalFiles > CHUNK_CONFIG.MAX_FILES_PER_CHUNK;
}

/**
 * Chunk a plan into smaller executable pieces
 */
export function chunkPlan(plan: Plan): PlanChunk[] {
  const totalFiles =
    (plan.files?.create?.length || 0) +
    (plan.files?.modify?.length || 0) +
    (plan.files?.delete?.length || 0);

  if (!needsChunking(plan)) {
    logger.info('Plan does not need chunking', { totalFiles });
    return [];
  }

  logger.info('Chunking plan into smaller pieces', {
    totalFiles,
    maxPerChunk: CHUNK_CONFIG.MAX_FILES_PER_CHUNK,
  });

  // Collect all files with their operations
  const allFiles: PlanFile[] = [
    ...(plan.files?.create || []).map((path) => ({
      path,
      action: 'create' as const,
      priority: getFilePriority(path, plan),
    })),
    ...(plan.files?.modify || []).map((path) => ({
      path,
      action: 'modify' as const,
      priority: getFilePriority(path, plan),
    })),
    ...(plan.files?.delete || []).map((path) => ({
      path,
      action: 'delete' as const,
      priority: getFilePriority(path, plan),
    })),
  ];

  // Sort by priority (lower number = higher priority)
  allFiles.sort((a, b) => (a.priority || 999) - (b.priority || 999));

  // Group files into chunks
  const chunks: PlanChunk[] = [];
  const filesPerChunk = CHUNK_CONFIG.MAX_FILES_PER_CHUNK;

  for (let i = 0; i < allFiles.length; i += filesPerChunk) {
    const chunkFiles = allFiles.slice(i, i + filesPerChunk);
    const chunkIndex = Math.floor(i / filesPerChunk);

    // Separate by action type
    const create = chunkFiles
      .filter((f) => f.action === 'create')
      .map((f) => f.path);
    const modify = chunkFiles
      .filter((f) => f.action === 'modify')
      .map((f) => f.path);
    const deleteFiles = chunkFiles
      .filter((f) => f.action === 'delete')
      .map((f) => f.path);

    // Find relevant steps for this chunk
    const relevantSteps = plan.steps.filter((step) =>
      step.files.some((file) => chunkFiles.some((cf) => cf.path === file))
    );

    // Re-number steps to be sequential
    const renumberedSteps = relevantSteps.map((step, idx) => ({
      ...step,
      step: idx + 1,
    }));

    const chunk: PlanChunk = {
      chunkIndex,
      totalChunks: Math.ceil(allFiles.length / filesPerChunk),
      summary: `${plan.summary} (Part ${chunkIndex + 1}/${Math.ceil(allFiles.length / filesPerChunk)})`,
      scope: createChunkScope(chunkFiles, plan),
      complexity: plan.complexity,
      estimatedFiles: chunkFiles.length,
      files: {
        create,
        modify,
        delete: deleteFiles,
      },
      steps: renumberedSteps,
      dependencies: getChunkDependencies(chunkFiles, plan),
      parentPlan: {
        summary: plan.summary,
        totalFiles: allFiles.length,
      },
    };

    chunks.push(chunk);
  }

  logger.info('Plan chunked successfully', {
    totalFiles: allFiles.length,
    chunksCreated: chunks.length,
    filesPerChunk: chunks.map((c) => c.estimatedFiles),
  });

  return chunks;
}

/**
 * Get priority for a file based on its position in the plan steps
 * Lower number = higher priority (should be implemented first)
 */
function getFilePriority(filePath: string, plan: Plan): number {
  // Find the earliest step that mentions this file
  const step = plan.steps.find((s) => s.files.includes(filePath));
  return step ? step.step : 999;
}

/**
 * Create a scope description for a chunk
 */
function createChunkScope(files: PlanFile[], plan: Plan): string {
  const fileDescriptions = files.map((f) => {
    const action = f.action === 'create' ? 'Creating' : f.action === 'modify' ? 'Modifying' : 'Deleting';
    return `${action} ${f.path}`;
  });

  return `Chunk of ${plan.summary}: ${fileDescriptions.slice(0, 3).join(', ')}${files.length > 3 ? ` and ${files.length - 3} more` : ''}`;
}

/**
 * Get dependencies for a chunk
 */
function getChunkDependencies(_files: PlanFile[], plan: Plan): string[] {
  // Extract unique dependencies from the original plan that might be relevant
  const deps = plan.dependencies || [];

  // Handle both array and object formats for dependencies
  let depsArray: string[] = [];
  if (Array.isArray(deps)) {
    depsArray = deps;
  } else if (typeof deps === 'object') {
    // Extract all dependency strings from object structure
    // Handle plan structure like: { internal: [...], external: [...], order: [...] }
    const depsObj = deps as any;
    depsArray = [
      ...(depsObj.internal || []),
      ...(depsObj.external || []),
      ...(depsObj.order || []),
    ];
  }

  // Add a note that this is a chunked implementation
  return [
    ...depsArray,
    'Previous chunks of this implementation (if any)',
  ];
}

/**
 * Detect if an error was caused by token limits
 */
export function isTokenLimitError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('token') ||
    message.includes('truncat') ||
    message.includes('unterminated string') ||
    message.includes('parse') && message.includes('json')
  );
}
