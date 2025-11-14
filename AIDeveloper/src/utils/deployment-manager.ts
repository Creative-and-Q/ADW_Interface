import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream, WriteStream } from 'fs';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

export interface DeploymentOperation {
  id: string;
  moduleName: string;
  operation: 'install' | 'build' | 'test' | 'start' | 'stop';
  status: 'pending' | 'running' | 'success' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  output: string[];
  error?: string;
}

class DeploymentManager extends EventEmitter {
  private operations: Map<string, DeploymentOperation> = new Map();
  private moduleProcesses: Map<string, ChildProcess> = new Map();
  private moduleLogs: Map<string, string[]> = new Map(); // Rolling log buffer per module
  private logStreams: Map<string, WriteStream> = new Map(); // File streams for persistent logging
  private readonly MAX_LOG_LINES = 500; // Keep last 500 lines per module in memory
  private readonly LOG_DIR = path.join(process.cwd(), 'logs', 'modules');

  /**
   * Install dependencies for a module
   */
  async installModule(moduleName: string): Promise<string> {
    const operationId = this.createOperation(moduleName, 'install');
    const modulePath = this.getModulePath(moduleName);

    try {
      this.updateOperationStatus(operationId, 'running');

      const { stdout, stderr } = await execAsync('npm install', {
        cwd: modulePath,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      this.addOperationOutput(operationId, stdout);
      if (stderr) {
        this.addOperationOutput(operationId, stderr);
      }

      this.updateOperationStatus(operationId, 'success');
      return operationId;
    } catch (error: any) {
      this.updateOperationStatus(operationId, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Build a module
   */
  async buildModule(moduleName: string): Promise<string> {
    const operationId = this.createOperation(moduleName, 'build');
    const modulePath = this.getModulePath(moduleName);

    try {
      this.updateOperationStatus(operationId, 'running');

      // Check if package.json has a build script
      const packageJsonPath = path.join(modulePath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

      if (!packageJson.scripts?.build) {
        throw new Error('No build script found in package.json');
      }

      const { stdout, stderr } = await execAsync('npm run build', {
        cwd: modulePath,
        maxBuffer: 10 * 1024 * 1024,
      });

      this.addOperationOutput(operationId, stdout);
      if (stderr) {
        this.addOperationOutput(operationId, stderr);
      }

      this.updateOperationStatus(operationId, 'success');
      return operationId;
    } catch (error: any) {
      this.updateOperationStatus(operationId, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Run tests for a module
   */
  async testModule(moduleName: string): Promise<string> {
    const operationId = this.createOperation(moduleName, 'test');
    const modulePath = this.getModulePath(moduleName);

    try {
      this.updateOperationStatus(operationId, 'running');

      // Check if package.json has a test script
      const packageJsonPath = path.join(modulePath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

      if (!packageJson.scripts?.test) {
        throw new Error('No test script found in package.json');
      }

      const { stdout, stderr } = await execAsync('npm test', {
        cwd: modulePath,
        maxBuffer: 10 * 1024 * 1024,
      });

      this.addOperationOutput(operationId, stdout);
      if (stderr) {
        this.addOperationOutput(operationId, stderr);
      }

      this.updateOperationStatus(operationId, 'success');
      return operationId;
    } catch (error: any) {
      this.updateOperationStatus(operationId, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Kill any process using a specific port
   */
  private async killPortProcess(port: number): Promise<void> {
    try {
      // Use lsof to find the process using the port
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      const pid = stdout.trim();

      if (pid) {
        console.log(`[DeploymentManager] Killing process ${pid} on port ${port}`);
        await execAsync(`kill -9 ${pid}`);
        // Wait a moment for the port to be released
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      // No process found on port or error - that's fine
      console.log(`[DeploymentManager] No process found on port ${port} (this is OK)`);
    }
  }

  /**
   * Get the port number from a module's .env file
   */
  private async getModulePort(modulePath: string): Promise<number | null> {
    try {
      const envPath = path.join(modulePath, '.env');
      const envContent = await fs.readFile(envPath, 'utf-8');

      // Parse PORT= line from .env
      const portMatch = envContent.match(/^PORT=(\d+)/m);
      if (portMatch) {
        return parseInt(portMatch[1], 10);
      }
    } catch (error) {
      // .env file doesn't exist or can't be read
    }
    return null;
  }

  /**
   * Start a module server
   */
  async startModule(moduleName: string): Promise<string> {
    const operationId = this.createOperation(moduleName, 'start');
    const modulePath = this.getModulePath(moduleName);

    try {
      this.updateOperationStatus(operationId, 'running');

      // Check if module is already running
      if (this.moduleProcesses.has(moduleName)) {
        throw new Error('Module is already running');
      }

      // Check if package.json has a start script
      const packageJsonPath = path.join(modulePath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

      if (!packageJson.scripts?.start) {
        throw new Error('No start script found in package.json');
      }

      // Get the module's port and kill any existing process on it
      const port = await this.getModulePort(modulePath);
      if (port) {
        console.log(`[DeploymentManager] Module ${moduleName} uses port ${port}`);
        await this.killPortProcess(port);
      }

      // Start the process in background using spawn (better for long-running processes)
      console.log(`[DeploymentManager] Starting module ${moduleName} with spawn...`);

      // Initialize log stream for persistent logging
      await this.initLogStream(moduleName);

      // Create a clean environment that doesn't inherit conflicting variables
      const cleanEnv = { ...process.env };
      // Remove variables that might conflict with module configuration
      delete cleanEnv.PORT;

      const child = spawn('npm', ['start'], {
        cwd: modulePath,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        env: cleanEnv,
      });

      console.log(`[DeploymentManager] Spawned process PID: ${child.pid}`);

      // Store the process
      this.moduleProcesses.set(moduleName, child);

      // Capture output
      child.stdout?.on('data', (data) => {
        const logLine = data.toString();
        console.log(`[DeploymentManager] ${moduleName} stdout:`, logLine.substring(0, 200));
        this.addOperationOutput(operationId, logLine);
        this.addModuleLog(moduleName, logLine);
        this.emit('moduleOutput', { moduleName, data: logLine });
      });

      child.stderr?.on('data', (data) => {
        const logLine = data.toString();
        console.log(`[DeploymentManager] ${moduleName} stderr:`, logLine.substring(0, 200));
        this.addOperationOutput(operationId, logLine);
        this.addModuleLog(moduleName, logLine);
        this.emit('moduleOutput', { moduleName, data: logLine });
      });

      // Track if process exits
      let hasExited = false;
      child.on('exit', (code) => {
        console.log(`[DeploymentManager] ${moduleName} process exited with code: ${code}`);
        hasExited = true;
        this.moduleProcesses.delete(moduleName);
        this.closeLogStream(moduleName, code || undefined);
        if (code === 0) {
          this.updateOperationStatus(operationId, 'success');
        } else {
          this.updateOperationStatus(operationId, 'failed', `Process exited with code ${code}`);
        }
      });

      child.on('error', (err) => {
        console.error(`[DeploymentManager] ${moduleName} spawn error:`, err);
        hasExited = true;
        this.moduleProcesses.delete(moduleName);
        this.closeLogStream(moduleName);
        this.updateOperationStatus(operationId, 'failed', err.message);
      });

      // Wait a bit to see if it starts successfully
      console.log(`[DeploymentManager] Waiting 2 seconds to verify startup...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      console.log(`[DeploymentManager] After wait: hasExited=${hasExited}, isInMap=${this.moduleProcesses.has(moduleName)}`);
      if (hasExited || !this.moduleProcesses.has(moduleName)) {
        throw new Error('Module failed to start');
      }

      console.log(`[DeploymentManager] Module ${moduleName} started successfully!`);

      this.updateOperationStatus(operationId, 'success');
      return operationId;
    } catch (error: any) {
      this.updateOperationStatus(operationId, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Stop a running module
   */
  async stopModule(moduleName: string): Promise<string> {
    const operationId = this.createOperation(moduleName, 'stop');

    try {
      this.updateOperationStatus(operationId, 'running');

      const child = this.moduleProcesses.get(moduleName);
      if (!child) {
        throw new Error('Module is not running');
      }

      child.kill('SIGTERM');
      this.moduleProcesses.delete(moduleName);
      await this.closeLogStream(moduleName);

      this.addOperationOutput(operationId, 'Module stopped successfully');
      this.updateOperationStatus(operationId, 'success');
      return operationId;
    } catch (error: any) {
      this.updateOperationStatus(operationId, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Get operation details
   */
  getOperation(operationId: string): DeploymentOperation | undefined {
    return this.operations.get(operationId);
  }

  /**
   * Get all operations
   */
  getAllOperations(): DeploymentOperation[] {
    return Array.from(this.operations.values());
  }

  /**
   * Get operations for a specific module
   */
  getModuleOperations(moduleName: string): DeploymentOperation[] {
    return Array.from(this.operations.values()).filter(
      (op) => op.moduleName === moduleName
    );
  }

  /**
   * Check if module is currently running
   */
  isModuleRunning(moduleName: string): boolean {
    return this.moduleProcesses.has(moduleName);
  }

  /**
   * Get running modules
   */
  getRunningModules(): string[] {
    return Array.from(this.moduleProcesses.keys());
  }

  /**
   * Get recent logs for a module (from memory if running, or from disk if stopped)
   */
  async getModuleLogs(moduleName: string, lines: number = 100): Promise<string[]> {
    // If module is running, return from memory
    if (this.moduleLogs.has(moduleName)) {
      const logs = this.moduleLogs.get(moduleName)!;
      return logs.slice(-lines);
    }

    // Otherwise, try to read from disk
    try {
      const logFilePath = path.join(this.LOG_DIR, `${moduleName}.log`);
      const content = await fs.readFile(logFilePath, 'utf-8');
      const allLines = content.split('\n').filter(line => line.trim());
      return allLines.slice(-lines);
    } catch (error) {
      // Log file doesn't exist or can't be read
      return [];
    }
  }

  /**
   * Clear logs for a module
   */
  clearModuleLogs(moduleName: string): void {
    this.moduleLogs.delete(moduleName);
  }

  // Private helper methods

  private createOperation(
    moduleName: string,
    operation: DeploymentOperation['operation']
  ): string {
    const id = `${moduleName}-${operation}-${Date.now()}`;
    const deploymentOp: DeploymentOperation = {
      id,
      moduleName,
      operation,
      status: 'pending',
      output: [],
    };

    this.operations.set(id, deploymentOp);
    this.emit('operationCreated', deploymentOp);
    return id;
  }

  private updateOperationStatus(
    operationId: string,
    status: DeploymentOperation['status'],
    error?: string
  ): void {
    const operation = this.operations.get(operationId);
    if (!operation) return;

    operation.status = status;
    if (status === 'running') {
      operation.startedAt = new Date();
    } else if (status === 'success' || status === 'failed') {
      operation.completedAt = new Date();
    }
    if (error) {
      operation.error = error;
    }

    this.emit('operationUpdated', operation);
  }

  private addOperationOutput(operationId: string, output: string): void {
    const operation = this.operations.get(operationId);
    if (!operation) return;

    operation.output.push(output);
    this.emit('operationOutput', { operationId, output });
  }

  private async addModuleLog(moduleName: string, logLine: string): Promise<void> {
    if (!this.moduleLogs.has(moduleName)) {
      this.moduleLogs.set(moduleName, []);
    }

    const logs = this.moduleLogs.get(moduleName)!;
    // Split by newlines and add each line
    const lines = logLine.split('\n').filter(line => line.trim());
    logs.push(...lines);

    // Keep only last MAX_LOG_LINES in memory
    if (logs.length > this.MAX_LOG_LINES) {
      logs.splice(0, logs.length - this.MAX_LOG_LINES);
    }

    // Also write to disk for persistence
    await this.writeLogsToDisk(moduleName, lines);
  }

  /**
   * Initialize log stream for a module
   */
  private async initLogStream(moduleName: string): Promise<void> {
    try {
      // Ensure log directory exists
      await fs.mkdir(this.LOG_DIR, { recursive: true });

      const logFilePath = path.join(this.LOG_DIR, `${moduleName}.log`);

      // Create write stream in append mode
      const stream = createWriteStream(logFilePath, { flags: 'a' });
      this.logStreams.set(moduleName, stream);

      // Add timestamp separator when starting a new session
      const timestamp = new Date().toISOString();
      stream.write(`\n========== Module Started: ${timestamp} ==========\n`);
    } catch (error) {
      console.error(`Failed to initialize log stream for ${moduleName}:`, error);
    }
  }

  /**
   * Close log stream for a module
   */
  private async closeLogStream(moduleName: string, exitCode?: number): Promise<void> {
    const stream = this.logStreams.get(moduleName);
    if (stream) {
      // Add exit marker
      const timestamp = new Date().toISOString();
      const exitMsg = exitCode !== undefined
        ? `\n========== Module Exited (code: ${exitCode}): ${timestamp} ==========\n\n`
        : `\n========== Module Stopped: ${timestamp} ==========\n\n`;

      stream.write(exitMsg);
      stream.end();
      this.logStreams.delete(moduleName);
    }
  }

  /**
   * Write logs to disk
   */
  private async writeLogsToDisk(moduleName: string, lines: string[]): Promise<void> {
    const stream = this.logStreams.get(moduleName);
    if (stream) {
      for (const line of lines) {
        stream.write(line + '\n');
      }
    }
  }

  private getModulePath(moduleName: string): string {
    return path.join(process.cwd(), '..', 'modules', moduleName);
  }
}

// Export singleton instance
export const deploymentManager = new DeploymentManager();
