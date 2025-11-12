/**
 * Code analyzer utility
 * Analyzes codebase structure and extracts useful information
 */

import path from 'path';
import {
  listDirectories,
  listFilesRecursive,
  readFile,
  getFileStats,
} from './file-system.js';
import {
  CodebaseContext,
  ProjectStructure,
  FileInfo,
  CodePatterns,
  CodebaseStatistics,
} from '../types.js';
import * as logger from './logger.js';
import { config } from '../config.js';

/**
 * Detect programming language from file extension
 */
export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const languageMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.rs': 'rust',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.rb': 'ruby',
    '.php': 'php',
    '.cs': 'csharp',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.sql': 'sql',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
  };

  return languageMap[ext] || 'unknown';
}

/**
 * Extract imports from a file (TypeScript/JavaScript)
 */
export async function extractImports(filePath: string): Promise<string[]> {
  try {
    const content = await readFile(filePath);
    const imports: string[] = [];

    // Match ES6 imports
    const es6ImportRegex = /import\s+.*?from\s+['"](.+?)['"]/g;
    let match;
    while ((match = es6ImportRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // Match require statements
    const requireRegex = /require\(['"](.+?)['"]\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  } catch (error) {
    logger.error(`Failed to extract imports from ${filePath}`, error as Error);
    return [];
  }
}

/**
 * Extract exports from a file (TypeScript/JavaScript)
 */
export async function extractExports(filePath: string): Promise<string[]> {
  try {
    const content = await readFile(filePath);
    const exports: string[] = [];

    // Match export statements
    const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g;
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    return exports;
  } catch (error) {
    logger.error(`Failed to extract exports from ${filePath}`, error as Error);
    return [];
  }
}

/**
 * Get file information
 */
export async function getFileMetadata(filePath: string): Promise<FileInfo> {
  const stats = await getFileStats(filePath);
  const language = detectLanguage(filePath);

  const fileInfo: FileInfo = {
    path: filePath,
    relativePath: path.relative(config.workspace.root, filePath),
    language,
    size: stats.size,
    lastModified: stats.modified,
  };

  // Extract imports/exports for TypeScript/JavaScript files
  if (language === 'typescript' || language === 'javascript') {
    fileInfo.imports = await extractImports(filePath);
    fileInfo.exports = await extractExports(filePath);
  }

  return fileInfo;
}

/**
 * Get project structure
 */
export async function getProjectStructure(
  rootDir?: string
): Promise<ProjectStructure> {
  const root = rootDir || config.workspace.root;

  logger.info(`Analyzing project structure: ${root}`);

  try {
    // Get all directories
    const directories = await listDirectories(root);

    // Get all files
    const allFiles = await listFilesRecursive(root);

    // Group files by type
    const filesByType: Record<string, string[]> = {};
    for (const file of allFiles) {
      const language = detectLanguage(file);
      if (!filesByType[language]) {
        filesByType[language] = [];
      }
      filesByType[language].push(file);
    }

    // Identify entry points (common entry files)
    const entryPoints = allFiles.filter(file => {
      const basename = path.basename(file);
      return (
        basename === 'index.ts' ||
        basename === 'index.js' ||
        basename === 'main.ts' ||
        basename === 'main.js' ||
        basename === 'server.ts' ||
        basename === 'server.js' ||
        basename === 'app.ts' ||
        basename === 'app.js'
      );
    });

    return {
      directories,
      filesByType,
      entryPoints,
    };
  } catch (error) {
    logger.error('Failed to get project structure', error as Error);
    throw error;
  }
}

/**
 * Detect code patterns in the codebase
 */
export async function detectCodePatterns(
  files: string[]
): Promise<CodePatterns> {
  logger.info('Detecting code patterns');

  const patterns: CodePatterns = {
    namingConventions: {
      files: 'unknown',
      variables: 'unknown',
      functions: 'unknown',
      classes: 'unknown',
    },
  };

  try {
    // Detect naming conventions
    const fileNames = files.map(f => path.basename(f, path.extname(f)));

    // Check file naming convention
    const kebabCase = fileNames.filter(name => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name));
    const camelCase = fileNames.filter(name => /^[a-z][a-zA-Z0-9]*$/.test(name));
    const pascalCase = fileNames.filter(name => /^[A-Z][a-zA-Z0-9]*$/.test(name));

    if (kebabCase.length > camelCase.length && kebabCase.length > pascalCase.length) {
      patterns.namingConventions.files = 'kebab-case';
    } else if (pascalCase.length > camelCase.length) {
      patterns.namingConventions.files = 'PascalCase';
    } else {
      patterns.namingConventions.files = 'camelCase';
    }

    // Detect test framework
    const hasJest = files.some(f => f.includes('jest.config') || f.includes('.test.') || f.includes('.spec.'));
    const hasMocha = files.some(f => f.includes('mocha') || f.includes('.test.'));

    if (hasJest) {
      patterns.testFramework = 'jest';
    } else if (hasMocha) {
      patterns.testFramework = 'mocha';
    }

    // Detect build tool
    if (files.some(f => f.includes('webpack.config'))) {
      patterns.buildTool = 'webpack';
    } else if (files.some(f => f.includes('vite.config'))) {
      patterns.buildTool = 'vite';
    } else if (files.some(f => f.includes('rollup.config'))) {
      patterns.buildTool = 'rollup';
    }

    // Detect package manager
    if (files.some(f => f.includes('package-lock.json'))) {
      patterns.packageManager = 'npm';
    } else if (files.some(f => f.includes('yarn.lock'))) {
      patterns.packageManager = 'yarn';
    } else if (files.some(f => f.includes('pnpm-lock.yaml'))) {
      patterns.packageManager = 'pnpm';
    }

    return patterns;
  } catch (error) {
    logger.error('Failed to detect code patterns', error as Error);
    return patterns;
  }
}

/**
 * Get codebase statistics
 */
export async function getCodebaseStatistics(
  files: string[]
): Promise<CodebaseStatistics> {
  logger.info('Calculating codebase statistics');

  const statistics: CodebaseStatistics = {
    totalFiles: files.length,
    totalLines: 0,
    filesByLanguage: {},
    averageFileSize: 0,
  };

  try {
    let totalSize = 0;

    for (const file of files) {
      const language = detectLanguage(file);

      // Count files by language
      if (!statistics.filesByLanguage[language]) {
        statistics.filesByLanguage[language] = 0;
      }
      statistics.filesByLanguage[language]++;

      // Get file stats
      try {
        const stats = await getFileStats(file);
        totalSize += stats.size;

        // Count lines for text files
        if (language !== 'unknown') {
          const content = await readFile(file);
          statistics.totalLines += content.split('\n').length;
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    statistics.averageFileSize = files.length > 0 ? totalSize / files.length : 0;

    return statistics;
  } catch (error) {
    logger.error('Failed to calculate codebase statistics', error as Error);
    return statistics;
  }
}

/**
 * Find relevant files based on a pattern or keywords
 */
export async function findRelevantFiles(
  pattern: string | RegExp,
  rootDir?: string
): Promise<string[]> {
  const root = rootDir || config.workspace.root;
  const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;

  try {
    const allFiles = await listFilesRecursive(root);
    return allFiles.filter(file => regex.test(file));
  } catch (error) {
    logger.error('Failed to find relevant files', error as Error);
    return [];
  }
}

/**
 * Get complete codebase context
 */
export async function getCodebaseContext(
  relevantFilesPattern?: string | RegExp
): Promise<CodebaseContext> {
  logger.info('Gathering codebase context');

  try {
    // Get project structure
    const projectStructure = await getProjectStructure();

    // Get all files
    const allFiles = await listFilesRecursive(config.workspace.root);

    // Get relevant files if pattern provided
    let relevantFilesList = allFiles;
    if (relevantFilesPattern) {
      relevantFilesList = await findRelevantFiles(relevantFilesPattern);
    }

    // Limit to most relevant files (e.g., 50 files) to avoid overwhelming the AI
    const limitedFiles = relevantFilesList.slice(0, 50);

    // Get file metadata for relevant files
    const relevantFiles: FileInfo[] = [];
    for (const file of limitedFiles) {
      try {
        const metadata = await getFileMetadata(file);
        relevantFiles.push(metadata);
      } catch (error) {
        // Skip files that can't be analyzed
      }
    }

    // Detect patterns
    const patterns = await detectCodePatterns(allFiles);

    // Get statistics
    const statistics = await getCodebaseStatistics(allFiles);

    // Extract dependencies from package.json if it exists
    let dependencies: Record<string, string> = {};
    try {
      const packageJsonPath = path.join(config.workspace.root, 'package.json');
      const packageJson = JSON.parse(await readFile(packageJsonPath));
      dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };
    } catch {
      // No package.json or error reading it
    }

    return {
      projectRoot: config.workspace.root,
      projectStructure,
      relevantFiles,
      dependencies,
      patterns,
      statistics,
    };
  } catch (error) {
    logger.error('Failed to get codebase context', error as Error);
    throw error;
  }
}
