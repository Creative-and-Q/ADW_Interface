import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { ModuleName, ModuleProcessInfo, ProcessStatus } from './types.js';

const execAsync = promisify(exec);

interface ModuleConfig {
  name: ModuleName;
  path: string;
  port: number;
  startCommand: string;
  args: string[];
}

interface ProcessState {
  process?: ChildProcess;
  pid?: number;
  status: ProcessStatus;
  startedAt?: Date;
  restartCount: number;
  lastError?: string;
}

export class ModuleProcessManager {
  private processes: Map<ModuleName, ProcessState> = new Map();
  private moduleConfigs: Map<ModuleName, ModuleConfig> = new Map();

  constructor() {
    this.initializeModuleConfigs();
    this.initializeProcessStates();
  }

  /**
   * Initialize module configurations
   */
  private initializeModuleConfigs(): void {
    const baseDir = path.resolve(process.cwd(), '..');

    const configs: ModuleConfig[] = [
      {
        name: 'CharacterController',
        path: path.join(baseDir, 'CharacterController'),
        port: 3031,
        startCommand: 'npm',
        args: ['start'],
      },
      {
        name: 'ItemController',
        path: path.join(baseDir, 'ItemController'),
        port: 3034,
        startCommand: 'npm',
        args: ['start'],
      },
      {
        name: 'SceneController',
        path: path.join(baseDir, 'SceneController'),
        port: 3033,
        startCommand: 'npm',
        args: ['start'],
      },
      {
        name: 'IntentInterpreter',
        path: path.join(baseDir, 'IntentInterpreter'),
        port: 3032,
        startCommand: 'npm',
        args: ['start'],
      },
      {
        name: 'StoryTeller',
        path: path.join(baseDir, 'StoryTeller'),
        port: 3037,
        startCommand: 'npm',
        args: ['start'],
      },
    ];

    configs.forEach((config) => {
      this.moduleConfigs.set(config.name, config);
    });

    console.log('📦 Module configurations initialized');
  }

  /**
   * Initialize process states
   */
  private initializeProcessStates(): void {
    this.moduleConfigs.forEach((config) => {
      this.processes.set(config.name, {
        status: 'stopped',
        restartCount: 0,
      });
    });
  }

  /**
   * Check if a port is in use and get the PID using it
   */
  private async checkPortInUse(port: number): Promise<{ inUse: boolean; pid?: number }> {
    try {
      // Check if port is actually LISTENING (not just connected to)
      const { stdout: listenStdout } = await execAsync(`lsof -i :${port} -sTCP:LISTEN -t`);
      const listeningPid = parseInt(listenStdout.trim());

      if (!isNaN(listeningPid) && listeningPid > 0) {
        // Double-check that this PID actually exists
        try {
          await execAsync(`kill -0 ${listeningPid}`);
          return { inUse: true, pid: listeningPid };
        } catch (killError) {
          // PID doesn't exist, port might be stale
          console.log(`⚠️  Port ${port} reported as listening by PID ${listeningPid}, but PID doesn't exist`);
          return { inUse: false };
        }
      }

      return { inUse: false };
    } catch (error) {
      // If no listening process found, port is free
      return { inUse: false };
    }
  }

  /**
   * Force kill a process by PID
   */
  async forceKillByPid(pid: number): Promise<void> {
    try {
      console.log(`🔪 Force killing process ${pid}...`);

      // First try SIGTERM
      try {
        await execAsync(`kill -15 ${pid}`);
        // Wait a bit for graceful shutdown
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (sigtermError) {
        // SIGTERM failed, process might already be dead or not responding
        console.log(`⚠️  SIGTERM failed for ${pid}, using SIGKILL...`);
      }

      // Then use SIGKILL if needed
      await execAsync(`kill -9 ${pid}`);
      console.log(`✅ Process ${pid} killed`);

      // Give it a moment to fully terminate
      await new Promise((resolve) => setTimeout(resolve, 500));

    } catch (error: any) {
      // Check if process is actually dead
      try {
        await execAsync(`kill -0 ${pid}`);
        // If we get here, process is still alive
        throw new Error(`Failed to kill process ${pid}: ${error.message}`);
      } catch (checkError) {
        // Process is dead, which is what we wanted
        console.log(`✅ Process ${pid} was already dead or killed successfully`);
      }
    }
  }

  /**
   * Start a module process
   */
  async startModule(name: ModuleName, forceKillPort: boolean = false): Promise<ModuleProcessInfo> {
    const config = this.moduleConfigs.get(name);
    const state = this.processes.get(name);

    if (!config || !state) {
      throw new Error(`Module ${name} not found`);
    }

    // Check if already running
    if (state.status === 'running' && state.process) {
      throw new Error(`Module ${name} is already running`);
    }

    // Check if port is in use
    const portCheck = await this.checkPortInUse(config.port);
    if (portCheck.inUse) {
      if (!forceKillPort) {
        // Return error with port conflict info
        const error: any = new Error(
          `Port ${config.port} is already in use${portCheck.pid ? ` by process ${portCheck.pid}` : ''}`
        );
        error.portConflict = {
          inUse: true,
          pid: portCheck.pid,
          port: config.port,
        };
        throw error;
      } else if (portCheck.pid) {
        // Safety check: don't kill our own process or system processes
        const currentPid = process.pid;
        if (portCheck.pid === currentPid) {
          throw new Error(`Cannot kill own process (PID: ${currentPid})`);
        }
        if (portCheck.pid < 1000) {
          throw new Error(`Refusing to kill system process (PID: ${portCheck.pid})`);
        }

        // Force kill the process on that port
        console.log(`⚠️  Port ${config.port} is in use by PID ${portCheck.pid}, force killing...`);
        try {
          await this.forceKillByPid(portCheck.pid);
          // Wait longer for port to free up
          console.log(`⏳ Waiting for port ${config.port} to free up...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Double-check that port is actually free now
          const portCheckAfter = await this.checkPortInUse(config.port);
          if (portCheckAfter.inUse) {
            throw new Error(`Port ${config.port} is still in use after force kill (PID: ${portCheckAfter.pid})`);
          }
        } catch (killError: any) {
          console.error(`❌ Failed to force kill process on port ${config.port}:`, killError.message);
          throw new Error(`Cannot free port ${config.port}: ${killError.message}`);
        }
      }
    }

    // Update status to starting
    state.status = 'starting';
    state.lastError = undefined;

    try {
      console.log(`🚀 Starting ${name}...`);
      console.log(`   Path: ${config.path}`);
      console.log(`   Command: ${config.startCommand} ${config.args.join(' ')}`);

      // Create a clean environment that doesn't inherit conflicting vars
      // Keep essential system variables but remove module-specific ones
      const cleanEnv: Record<string, string> = {};

      // Copy essential system variables
      const essentialVars = ['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'NODE_ENV'];
      essentialVars.forEach((key) => {
        if (process.env[key]) {
          cleanEnv[key] = process.env[key]!;
        }
      });

      // Spawn the process with clean environment
      // Each module will load its own .env file via dotenv.config()
      const childProcess = spawn(config.startCommand, config.args, {
        cwd: config.path,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        shell: true,
        env: cleanEnv, // Use clean environment instead of inheriting all
      });

      // Handle stdout
      childProcess.stdout?.on('data', (data) => {
        console.log(`[${name}] ${data.toString().trim()}`);
      });

      // Handle stderr
      childProcess.stderr?.on('data', (data) => {
        console.error(`[${name}] ERROR: ${data.toString().trim()}`);
      });

      // Handle process exit
      childProcess.on('exit', (code, signal) => {
        console.log(`[${name}] Process exited with code ${code}, signal ${signal}`);
        const currentState = this.processes.get(name);
        if (currentState) {
          currentState.status = 'stopped';
          currentState.process = undefined;
          currentState.pid = undefined;
          if (code !== 0 && code !== null) {
            currentState.lastError = `Process exited with code ${code}`;
          }
        }
      });

      // Handle errors
      childProcess.on('error', (error) => {
        console.error(`[${name}] Process error:`, error);
        const currentState = this.processes.get(name);
        if (currentState) {
          currentState.status = 'error';
          currentState.lastError = error.message;
        }
      });

      // Update state
      state.process = childProcess;
      state.pid = childProcess.pid;
      state.status = 'running';
      state.startedAt = new Date();

      console.log(`✅ ${name} started with PID ${childProcess.pid}`);

      return this.getModuleInfo(name);
    } catch (error: any) {
      console.error(`❌ Failed to start ${name}:`, error);
      state.status = 'error';
      state.lastError = error.message;
      throw new Error(`Failed to start ${name}: ${error.message}`);
    }
  }

  /**
   * Stop a module process
   */
  async stopModule(name: ModuleName): Promise<ModuleProcessInfo> {
    const state = this.processes.get(name);

    if (!state) {
      throw new Error(`Module ${name} not found`);
    }

    if (state.status !== 'running' || !state.process) {
      throw new Error(`Module ${name} is not running`);
    }

    try {
      console.log(`🛑 Stopping ${name}...`);
      state.status = 'stopping';

      // Kill the process
      const killed = state.process.kill('SIGTERM');

      if (!killed) {
        throw new Error('Failed to send kill signal');
      }

      // Wait for process to exit (with timeout)
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // Force kill if still running
          if (state.process) {
            console.log(`⚠️  Force killing ${name}...`);
            state.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        state.process?.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Update state
      state.status = 'stopped';
      state.process = undefined;
      state.pid = undefined;

      console.log(`✅ ${name} stopped`);

      return this.getModuleInfo(name);
    } catch (error: any) {
      console.error(`❌ Failed to stop ${name}:`, error);
      state.status = 'error';
      state.lastError = error.message;
      throw new Error(`Failed to stop ${name}: ${error.message}`);
    }
  }

  /**
   * Restart a module process
   */
  async restartModule(name: ModuleName): Promise<ModuleProcessInfo> {
    console.log(`🔄 Restarting ${name}...`);

    const state = this.processes.get(name);
    if (!state) {
      throw new Error(`Module ${name} not found`);
    }

    // Stop if running
    if (state.status === 'running') {
      await this.stopModule(name);
      // Wait a bit before starting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Start the module
    const result = await this.startModule(name);

    // Increment restart count
    state.restartCount++;

    return result;
  }

  /**
   * Get module process info
   */
  async getModuleInfo(name: ModuleName): Promise<ModuleProcessInfo> {
    const config = this.moduleConfigs.get(name);
    const state = this.processes.get(name);

    if (!config || !state) {
      throw new Error(`Module ${name} not found`);
    }

    const uptime = state.startedAt
      ? Math.floor((Date.now() - state.startedAt.getTime()) / 1000)
      : undefined;

    // Check for port conflicts if not running
    let portConflict;
    if (state.status !== 'running') {
      const portCheck = await this.checkPortInUse(config.port);
      if (portCheck.inUse) {
        portConflict = {
          inUse: true,
          pid: portCheck.pid,
          canForceKill: portCheck.pid !== undefined,
        };
      }
    }

    return {
      name,
      status: state.status,
      pid: state.pid,
      port: config.port,
      startedAt: state.startedAt?.toISOString(),
      uptime,
      restartCount: state.restartCount,
      lastError: state.lastError,
      portConflict,
    };
  }

  /**
   * Get all modules info
   */
  async getAllModulesInfo(): Promise<ModuleProcessInfo[]> {
    const modules: ModuleProcessInfo[] = [];

    for (const config of this.moduleConfigs.values()) {
      modules.push(await this.getModuleInfo(config.name));
    }

    return modules;
  }

  /**
   * Cleanup all processes on shutdown
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up module processes...');

    const stopPromises: Promise<void>[] = [];

    this.processes.forEach((state, name) => {
      if (state.status === 'running' && state.process) {
        stopPromises.push(
          this.stopModule(name)
            .then(() => undefined)
            .catch((error) => {
              console.error(`Failed to stop ${name} during cleanup:`, error);
            })
        );
      }
    });

    await Promise.all(stopPromises);
    console.log('✅ Cleanup complete');
  }
}
