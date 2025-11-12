import axios, { type AxiosInstance } from 'axios';
import type {
  ApiResponse,
  ChainConfiguration,
  ExecutionResult,
  ModuleMetadata,
  Statistics,
  ModuleProcessInfo,
  ModuleName,
} from '../types';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // ==========================================================================
  // Chain Configuration
  // ==========================================================================

  async createChain(chain: Partial<ChainConfiguration>): Promise<ChainConfiguration> {
    const response = await this.client.post<ApiResponse<ChainConfiguration>>('/chain', chain);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to create chain');
    }
    return response.data.data!;
  }

  async getChain(id: number, userId?: string): Promise<ChainConfiguration> {
    const response = await this.client.get<ApiResponse<ChainConfiguration>>(
      `/chain/${id}`,
      { params: { userId } }
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get chain');
    }
    return response.data.data!;
  }

  async getUserChains(userId: string): Promise<ChainConfiguration[]> {
    const response = await this.client.get<ApiResponse<ChainConfiguration[]>>(
      `/chains/${userId}`
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get chains');
    }
    return response.data.data!;
  }

  async getAllChains(): Promise<ChainConfiguration[]> {
    const response = await this.client.get<ApiResponse<ChainConfiguration[]>>('/chains');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get chains');
    }
    return response.data.data!;
  }

  async updateChain(
    id: number,
    updates: Partial<ChainConfiguration>,
    userId?: string
  ): Promise<ChainConfiguration> {
    const response = await this.client.patch<ApiResponse<ChainConfiguration>>(
      `/chain/${id}`,
      updates,
      { params: { userId } }
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update chain');
    }
    return response.data.data!;
  }

  async deleteChain(id: number, userId?: string): Promise<void> {
    const response = await this.client.delete<ApiResponse>(`/chain/${id}`, {
      params: { userId },
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to delete chain');
    }
  }

  // ==========================================================================
  // Chain Execution
  // ==========================================================================

  async executeChain(
    chainId: number,
    input: Record<string, any>,
    userId: string,
    env?: Record<string, string>
  ): Promise<ExecutionResult> {
    const response = await this.client.post<ApiResponse<ExecutionResult>>(
      `/execute/${chainId}`,
      { input, env },
      { params: { userId } }
    );
    return response.data.data!;
  }

  async executeAdHocChain(
    userId: string,
    name: string,
    steps: any[],
    input: Record<string, any>,
    outputTemplate?: Record<string, any>,
    env?: Record<string, string>
  ): Promise<ExecutionResult> {
    const response = await this.client.post<ApiResponse<ExecutionResult>>('/execute', {
      user_id: userId,
      name,
      steps,
      input,
      output_template: outputTemplate,
      env,
    });
    return response.data.data!;
  }

  async getExecution(id: number, userId?: string): Promise<ExecutionResult> {
    const response = await this.client.get<ApiResponse<ExecutionResult>>(
      `/execution/${id}`,
      { params: { userId } }
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get execution');
    }
    return response.data.data!;
  }

  async getUserExecutions(userId: string, limit: number = 100): Promise<ExecutionResult[]> {
    const response = await this.client.get<ApiResponse<ExecutionResult[]>>(
      `/executions/${userId}`,
      { params: { limit } }
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get executions');
    }
    return response.data.data!;
  }

  async getChainExecutions(chainId: number, limit: number = 100): Promise<ExecutionResult[]> {
    const response = await this.client.get<ApiResponse<ExecutionResult[]>>(
      `/chain/${chainId}/executions`,
      { params: { limit } }
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get chain executions');
    }
    return response.data.data!;
  }

  // ==========================================================================
  // Modules
  // ==========================================================================

  async getModules(): Promise<ModuleMetadata[]> {
    const response = await this.client.get<ApiResponse<ModuleMetadata[]>>('/modules');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get modules');
    }
    return response.data.data!;
  }

  async getModule(type: string): Promise<ModuleMetadata> {
    const response = await this.client.get<ApiResponse<ModuleMetadata>>(`/modules/${type}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get module');
    }
    return response.data.data!;
  }

  // ==========================================================================
  // Health & Statistics
  // ==========================================================================

  async getHealth(): Promise<any> {
    const response = await this.client.get<ApiResponse>('/health');
    return response.data;
  }

  async getStatistics(): Promise<Statistics> {
    const response = await this.client.get<ApiResponse<Statistics>>('/stats');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get statistics');
    }
    return response.data.data!;
  }

  // ==========================================================================
  // Module Process Control
  // ==========================================================================

  async getModuleProcesses(): Promise<ModuleProcessInfo[]> {
    const response = await this.client.get<ApiResponse<ModuleProcessInfo[]>>('/module-processes');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get module processes');
    }
    return response.data.data!;
  }

  async getModuleProcess(name: ModuleName): Promise<ModuleProcessInfo> {
    const response = await this.client.get<ApiResponse<ModuleProcessInfo>>(
      `/module-processes/${name}`
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get module process');
    }
    return response.data.data!;
  }

  async startModule(name: ModuleName, forceKillPort: boolean = false): Promise<ModuleProcessInfo> {
    try {
      const response = await this.client.post<ApiResponse<ModuleProcessInfo>>(
        `/module-processes/${name}/start`,
        { forceKillPort }
      );
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to start module');
      }
      return response.data.data!;
    } catch (error: any) {
      // If it's a 409 (port conflict), attach the conflict data to the error
      if (error.response?.status === 409) {
        const portConflictError: any = new Error(
          error.response.data.error || 'Port conflict'
        );
        portConflictError.portConflict = error.response.data.data;
        throw portConflictError;
      }
      throw error;
    }
  }

  async stopModule(name: ModuleName): Promise<ModuleProcessInfo> {
    const response = await this.client.post<ApiResponse<ModuleProcessInfo>>(
      `/module-processes/${name}/stop`
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to stop module');
    }
    return response.data.data!;
  }

  async restartModule(name: ModuleName): Promise<ModuleProcessInfo> {
    const response = await this.client.post<ApiResponse<ModuleProcessInfo>>(
      `/module-processes/${name}/restart`
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to restart module');
    }
    return response.data.data!;
  }
}

export const api = new ApiService();
