/**
 * Module Creator Utility
 * Creates new modules with GitHub repository and scaffolding
 *
 * FLOW:
 * 1. Create workflow directory under workflows/
 * 2. Scaffold the module there
 * 3. Create GitHub repo
 * 4. Init git, commit, push to remote
 * 5. On success, clone from remote into modules/ directory
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import * as logger from './logger.js';

export interface NewModuleConfig {
  name: string;                    // Module name (e.g., "DataProcessor")
  description: string;             // Module description
  type: 'service' | 'library';     // Service runs standalone, library is imported
  port?: number;                   // Port for service modules
  hasFrontend?: boolean;           // Whether to scaffold frontend
  frontendPort?: number;           // Port for frontend dev server
  relatedModules?: string[];       // Related/connected modules
  repoPrefix?: string;             // GitHub repo name prefix (default: "Ex_Nihilo_")
  workflowId?: number;             // Associated workflow ID
}

export interface ModuleCreationResult {
  success: boolean;
  workflowPath: string;            // Path in workflows/ where module was scaffolded
  modulePath?: string;             // Final path in modules/ after cloning
  repoUrl?: string;
  error?: string;
}

/**
 * Get SSH environment for git operations
 */
function getSSHEnvironment(): NodeJS.ProcessEnv {
  const sshEnvFile = path.join(process.env.HOME || '/root', '.ssh', 'agent-environment');

  try {
    const envContent = require('fs').readFileSync(sshEnvFile, 'utf-8');
    const env: NodeJS.ProcessEnv = { ...process.env };

    const matches = envContent.matchAll(/([A-Z_]+)=([^;]+);/g);
    for (const match of matches) {
      const [, key, value] = match;
      env[key] = value.replace(/^['"]|['"]$/g, '');
    }

    return env;
  } catch {
    return {
      ...process.env,
      GIT_SSH_COMMAND: 'ssh -i /root/.ssh/id_rsa -F /root/.ssh/config',
    };
  }
}

/**
 * Create a new GitHub repository using GitHub REST API
 * Requires GITHUB_TOKEN environment variable or config.github.token
 */
async function createGitHubRepo(
  repoName: string,
  description: string,
  isPrivate: boolean = true
): Promise<string> {
  logger.info('Creating GitHub repository', { repoName, description: description.substring(0, 50) });

  const token = config.github.token || process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error(
      'GitHub token not configured. Set GITHUB_TOKEN environment variable or config.github.token. ' +
      'Create a token at https://github.com/settings/tokens with "repo" scope.'
    );
  }

  try {
    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: repoName,
        description: description.substring(0, 200),
        private: isPrivate,
        auto_init: false,  // We'll push our own initial commit
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { message?: string };
      const errorMessage = errorData.message || response.statusText;

      if (response.status === 401) {
        throw new Error(
          `GitHub authentication failed (401). Your token may be expired or invalid. ` +
          `Create a new token at https://github.com/settings/tokens with "repo" scope.`
        );
      }
      if (response.status === 422 && errorMessage.includes('already exists')) {
        throw new Error(`Repository ${repoName} already exists on GitHub`);
      }

      throw new Error(`GitHub API error (${response.status}): ${errorMessage}`);
    }

    const repoData = await response.json() as { ssh_url?: string; full_name: string; html_url: string };

    // Return SSH URL for git operations
    const repoUrl = repoData.ssh_url || `git@github.com:${repoData.full_name}.git`;
    logger.info('GitHub repository created', { repoName, repoUrl, htmlUrl: repoData.html_url });

    return repoUrl;
  } catch (error: any) {
    logger.error('Failed to create GitHub repository', error);
    throw new Error(`Failed to create GitHub repo: ${error.message}`);
  }
}

/**
 * Generate package.json for new module
 */
function generatePackageJson(moduleConfig: NewModuleConfig): string {
  const scripts: Record<string, string> = {
    build: 'tsc',
    typecheck: 'tsc --noEmit',
  };

  if (moduleConfig.type === 'service') {
    scripts.start = 'node dist/server.js';
    scripts.dev = 'tsx watch src/server.ts';
  }

  if (moduleConfig.hasFrontend) {
    scripts.start = 'cd frontend && npm run dev';
  }

  return JSON.stringify({
    name: moduleConfig.name.toLowerCase().replace(/([A-Z])/g, '-$1').replace(/^-/, ''),
    version: '1.0.0',
    description: moduleConfig.description,
    type: 'module',
    main: moduleConfig.type === 'service' ? 'dist/server.js' : 'index.js',
    scripts,
    keywords: [moduleConfig.name.toLowerCase(), 'ex-nihilo', 'module'],
    author: '',
    license: 'MIT',
    dependencies: {
      'axios': '^1.6.2',
      'dotenv': '^16.3.1',
      ...(moduleConfig.type === 'service' ? {
        'express': '^4.18.2',
        'cors': '^2.8.5',
      } : {}),
    },
    devDependencies: {
      '@types/node': '^20.10.5',
      'typescript': '^5.3.3',
      ...(moduleConfig.type === 'service' ? {
        'tsx': '^4.7.0',
        '@types/express': '^4.17.21',
        '@types/cors': '^2.8.17',
      } : {}),
    },
    engines: {
      node: '>=18.0.0',
    },
  }, null, 2);
}

/**
 * Generate tsconfig.json for new module
 */
function generateTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'node',
      esModuleInterop: true,
      strict: true,
      skipLibCheck: true,
      outDir: './dist',
      rootDir: './src',
      declaration: true,
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  }, null, 2);
}

/**
 * Generate .env template for new module
 */
function generateEnvTemplate(moduleConfig: NewModuleConfig): string {
  let env = `# ${moduleConfig.name} Configuration\n`;
  env += `NODE_ENV=development\n`;

  if (moduleConfig.port) {
    env += `PORT=${moduleConfig.port}\n`;
  }

  if (moduleConfig.frontendPort) {
    env += `FRONTEND_PORT=${moduleConfig.frontendPort}\n`;
  }

  return env;
}

/**
 * Generate main index.ts for library modules
 */
function generateLibraryIndex(moduleConfig: NewModuleConfig): string {
  return `/**
 * ${moduleConfig.name}
 * ${moduleConfig.description}
 */

export class ${moduleConfig.name} {
  constructor() {
    // Initialize module
  }

  /**
   * Execute the main module functionality
   */
  async execute(input: any): Promise<any> {
    // TODO: Implement module logic
    return {
      success: true,
      output: input,
    };
  }
}

export default ${moduleConfig.name};
`;
}

/**
 * Generate server.ts for service modules
 */
function generateServiceServer(moduleConfig: NewModuleConfig): string {
  return `/**
 * ${moduleConfig.name} Service
 * ${moduleConfig.description}
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || ${moduleConfig.port || 3000};

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', module: '${moduleConfig.name}' });
});

// TODO: Add your API routes here

app.listen(PORT, () => {
  console.log(\`${moduleConfig.name} service running on port \${PORT}\`);
});
`;
}

/**
 * Generate module.json for module discovery
 */
function generateModuleJson(moduleConfig: NewModuleConfig): string {
  const moduleJson: any = {
    name: moduleConfig.name,
    description: moduleConfig.description,
    type: moduleConfig.type,
    version: '1.0.0',
  };

  if (moduleConfig.port) {
    moduleJson.port = moduleConfig.port;
  }

  if (moduleConfig.hasFrontend) {
    moduleJson.frontend = {
      port: moduleConfig.frontendPort || 5176,
      pages: [
        {
          path: `/${moduleConfig.name.toLowerCase()}`,
          component: moduleConfig.name,
          label: moduleConfig.name,
          icon: 'Package',
          navOrder: 10,
        },
      ],
    };
  }

  if (moduleConfig.relatedModules && moduleConfig.relatedModules.length > 0) {
    moduleJson.relatedModules = moduleConfig.relatedModules;
  }

  return JSON.stringify(moduleJson, null, 2);
}

/**
 * Generate README.md for new module
 */
function generateReadme(moduleConfig: NewModuleConfig): string {
  return `# ${moduleConfig.name}

${moduleConfig.description}

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

${moduleConfig.type === 'service' ? `
### Starting the Service

\`\`\`bash
npm start
\`\`\`

The service will run on port ${moduleConfig.port || 3000}.
` : `
### Importing the Module

\`\`\`typescript
import { ${moduleConfig.name} } from './${moduleConfig.name}';

const module = new ${moduleConfig.name}();
const result = await module.execute(input);
\`\`\`
`}

## Development

\`\`\`bash
npm run build    # Build TypeScript
npm run typecheck  # Type check without building
\`\`\`

${moduleConfig.hasFrontend ? `
## Frontend

The frontend runs on port ${moduleConfig.frontendPort || 5176}.

\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`
` : ''}

## Related Modules

${moduleConfig.relatedModules?.map(m => `- ${m}`).join('\n') || 'None specified'}

---
Generated by AIDeveloper
`;
}

/**
 * Generate .gitignore for new module
 */
function generateGitignore(): string {
  return `# Dependencies
node_modules/

# Build output
dist/

# Environment
.env
.env.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# Logs
*.log
logs/

# OS
.DS_Store
Thumbs.db
`;
}

/**
 * Create frontend scaffold for a module
 */
async function createFrontendScaffold(
  modulePath: string,
  moduleConfig: NewModuleConfig
): Promise<void> {
  const frontendPath = path.join(modulePath, 'frontend');

  await fs.mkdir(frontendPath, { recursive: true });
  await fs.mkdir(path.join(frontendPath, 'src'), { recursive: true });
  await fs.mkdir(path.join(frontendPath, 'src', 'pages'), { recursive: true });
  await fs.mkdir(path.join(frontendPath, 'src', 'components'), { recursive: true });

  // Frontend package.json
  const frontendPackage = {
    name: `${moduleConfig.name.toLowerCase()}-frontend`,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: `vite --port ${moduleConfig.frontendPort || 5176}`,
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      'react': '^18.2.0',
      'react-dom': '^18.2.0',
      'react-router-dom': '^6.20.0',
      'react-hot-toast': '^2.4.1',
      'lucide-react': '^0.294.0',
      'axios': '^1.6.2',
    },
    devDependencies: {
      '@types/react': '^18.2.42',
      '@types/react-dom': '^18.2.17',
      '@vitejs/plugin-react': '^4.2.1',
      'autoprefixer': '^10.4.16',
      'postcss': '^8.4.32',
      'tailwindcss': '^3.3.6',
      'typescript': '^5.3.3',
      'vite': '^5.0.7',
    },
  };

  await fs.writeFile(
    path.join(frontendPath, 'package.json'),
    JSON.stringify(frontendPackage, null, 2)
  );

  // Basic App.tsx
  const appTsx = `import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ${moduleConfig.name}Page from './pages/${moduleConfig.name}';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/${moduleConfig.name.toLowerCase()}" element={<${moduleConfig.name}Page />} />
      </Routes>
    </BrowserRouter>
  );
}
`;

  await fs.writeFile(path.join(frontendPath, 'src', 'App.tsx'), appTsx);

  // Basic page component
  const pageTsx = `export default function ${moduleConfig.name}() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">${moduleConfig.name}</h1>
      <p className="text-gray-600 mt-2">${moduleConfig.description}</p>
    </div>
  );
}
`;

  await fs.writeFile(
    path.join(frontendPath, 'src', 'pages', `${moduleConfig.name}.tsx`),
    pageTsx
  );

  // index.html
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${moduleConfig.name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

  await fs.writeFile(path.join(frontendPath, 'index.html'), indexHtml);

  // main.tsx
  const mainTsx = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;

  await fs.writeFile(path.join(frontendPath, 'src', 'main.tsx'), mainTsx);

  // Basic CSS
  const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

  await fs.writeFile(path.join(frontendPath, 'src', 'index.css'), indexCss);

  // Vite config
  const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: ${moduleConfig.frontendPort || 5176},
  },
});
`;

  await fs.writeFile(path.join(frontendPath, 'vite.config.ts'), viteConfig);

  // Tailwind config
  const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
`;

  await fs.writeFile(path.join(frontendPath, 'tailwind.config.js'), tailwindConfig);

  // PostCSS config
  const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;

  await fs.writeFile(path.join(frontendPath, 'postcss.config.js'), postcssConfig);

  // tsconfig for frontend
  const frontendTsConfig = {
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: 'react-jsx',
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
    },
    include: ['src'],
    references: [{ path: './tsconfig.node.json' }],
  };

  await fs.writeFile(
    path.join(frontendPath, 'tsconfig.json'),
    JSON.stringify(frontendTsConfig, null, 2)
  );

  // tsconfig.node.json for vite config
  const tsconfigNode = {
    compilerOptions: {
      composite: true,
      skipLibCheck: true,
      module: 'ESNext',
      moduleResolution: 'bundler',
      allowSyntheticDefaultImports: true,
    },
    include: ['vite.config.ts'],
  };

  await fs.writeFile(
    path.join(frontendPath, 'tsconfig.node.json'),
    JSON.stringify(tsconfigNode, null, 2)
  );

  logger.info('Frontend scaffold created', { moduleName: moduleConfig.name });
}

/**
 * Scaffold module files in a given directory
 */
async function scaffoldModuleFiles(
  targetPath: string,
  moduleConfig: NewModuleConfig
): Promise<void> {
  // Create directory structure
  await fs.mkdir(targetPath, { recursive: true });
  await fs.mkdir(path.join(targetPath, 'src'), { recursive: true });

  if (moduleConfig.type === 'service') {
    await fs.mkdir(path.join(targetPath, 'src', 'routes'), { recursive: true });
    await fs.mkdir(path.join(targetPath, 'src', 'utils'), { recursive: true });
  }

  // Write core files
  await fs.writeFile(
    path.join(targetPath, 'package.json'),
    generatePackageJson(moduleConfig)
  );

  await fs.writeFile(
    path.join(targetPath, 'tsconfig.json'),
    generateTsConfig()
  );

  await fs.writeFile(
    path.join(targetPath, '.env.example'),
    generateEnvTemplate(moduleConfig)
  );

  await fs.writeFile(
    path.join(targetPath, '.gitignore'),
    generateGitignore()
  );

  await fs.writeFile(
    path.join(targetPath, 'module.json'),
    generateModuleJson(moduleConfig)
  );

  await fs.writeFile(
    path.join(targetPath, 'README.md'),
    generateReadme(moduleConfig)
  );

  // Write main source file
  if (moduleConfig.type === 'library') {
    await fs.writeFile(
      path.join(targetPath, 'index.ts'),
      generateLibraryIndex(moduleConfig)
    );
  } else {
    await fs.writeFile(
      path.join(targetPath, 'src', 'server.ts'),
      generateServiceServer(moduleConfig)
    );
  }

  // Create frontend scaffold if requested
  if (moduleConfig.hasFrontend) {
    await createFrontendScaffold(targetPath, moduleConfig);
  }
}

/**
 * Create a new module with full scaffolding and GitHub repo
 *
 * CORRECT FLOW:
 * 1. Create workflow directory under workflows/
 * 2. Scaffold the module there
 * 3. Create GitHub repo
 * 4. Init git, commit, push to remote
 * 5. On success, clone from remote into modules/ directory
 */
export async function createNewModule(
  moduleConfig: NewModuleConfig
): Promise<ModuleCreationResult> {
  const workflowsPath = path.join(config.workspace.root, 'workflows');
  const modulesPath = path.join(config.workspace.root, 'modules');
  const workflowDirName = `new-module-${moduleConfig.name}-${Date.now()}`;
  const workflowPath = path.join(workflowsPath, workflowDirName);
  const finalModulePath = path.join(modulesPath, moduleConfig.name);
  const repoPrefix = moduleConfig.repoPrefix || 'Ex_Nihilo_';
  const repoName = `${repoPrefix}${moduleConfig.name}`;

  try {
    logger.info('Creating new module in workflow directory', {
      moduleName: moduleConfig.name,
      workflowPath,
    });

    // Check if module already exists in modules/
    try {
      await fs.access(finalModulePath);
      throw new Error(`Module ${moduleConfig.name} already exists at ${finalModulePath}`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }

    // Step 1: Create workflow directory
    await fs.mkdir(workflowPath, { recursive: true });
    logger.info('Workflow directory created', { workflowPath });

    // Step 2: Scaffold module files in workflow directory
    await scaffoldModuleFiles(workflowPath, moduleConfig);
    logger.info('Module scaffolded in workflow directory', { moduleName: moduleConfig.name });

    // Step 3: Initialize git
    execSync('git init', { cwd: workflowPath, encoding: 'utf-8' });
    execSync('git add .', { cwd: workflowPath, encoding: 'utf-8' });
    execSync(`git commit -m "Initial commit: ${moduleConfig.name} module scaffold"`, {
      cwd: workflowPath,
      encoding: 'utf-8',
    });
    logger.info('Git initialized and initial commit made', { moduleName: moduleConfig.name });

    // Step 4: Create GitHub repo
    let repoUrl: string;
    try {
      repoUrl = await createGitHubRepo(repoName, moduleConfig.description);
    } catch (error: any) {
      // If GitHub fails, still keep the local scaffold but report the error
      logger.error('GitHub repo creation failed', error);
      return {
        success: false,
        workflowPath,
        error: `GitHub repo creation failed: ${error.message}. Module scaffolded locally at ${workflowPath}`,
      };
    }

    // Step 5: Add remote and push
    try {
      execSync(`git remote add origin ${repoUrl}`, {
        cwd: workflowPath,
        encoding: 'utf-8',
        env: getSSHEnvironment(),
      });

      execSync('git push -u origin master', {
        cwd: workflowPath,
        encoding: 'utf-8',
        env: getSSHEnvironment(),
      });
      logger.info('Pushed to GitHub', { repoUrl });
    } catch (pushError: any) {
      logger.error('Failed to push to GitHub', pushError);
      return {
        success: false,
        workflowPath,
        repoUrl,
        error: `Failed to push to GitHub: ${pushError.message}`,
      };
    }

    // Step 6: Clone from remote into modules/ directory
    try {
      execSync(`git clone ${repoUrl} ${moduleConfig.name}`, {
        cwd: modulesPath,
        encoding: 'utf-8',
        env: getSSHEnvironment(),
      });

      // Explicitly checkout master branch (fixes "remote HEAD refers to nonexistent ref" issue)
      execSync('git checkout master', {
        cwd: finalModulePath,
        encoding: 'utf-8',
        env: getSSHEnvironment(),
      });

      logger.info('Cloned to modules directory', { finalModulePath });
    } catch (cloneError: any) {
      logger.error('Failed to clone to modules directory', cloneError);
      return {
        success: false,
        workflowPath,
        repoUrl,
        error: `Failed to clone to modules/: ${cloneError.message}. Repo exists at ${repoUrl}`,
      };
    }

    // Step 7: Install dependencies in the final location
    try {
      execSync('npm install', { cwd: finalModulePath, encoding: 'utf-8' });
      logger.info('Dependencies installed', { moduleName: moduleConfig.name });

      // Install frontend dependencies if applicable
      if (moduleConfig.hasFrontend) {
        const frontendPath = path.join(finalModulePath, 'frontend');
        execSync('npm install', { cwd: frontendPath, encoding: 'utf-8' });
        logger.info('Frontend dependencies installed', { moduleName: moduleConfig.name });
      }
    } catch (npmError: any) {
      logger.warn('Failed to install dependencies', { error: npmError.message });
      // Don't fail the whole operation for npm install issues
    }

    // Step 8: Clean up workflow directory (optional - keep for audit trail)
    // await fs.rm(workflowPath, { recursive: true, force: true });

    logger.info('Module created successfully', {
      moduleName: moduleConfig.name,
      finalModulePath,
      repoUrl,
    });

    // Note: Implementation workflows are now created by ModuleScaffoldAgent
    // which returns a structured_plan artifact that triggers sub-workflow creation

    return {
      success: true,
      workflowPath,
      modulePath: finalModulePath,
      repoUrl,
    };
  } catch (error: any) {
    logger.error('Failed to create module', error);
    return {
      success: false,
      workflowPath,
      error: error.message,
    };
  }
}

export default { createNewModule };
