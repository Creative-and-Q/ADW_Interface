import axios from 'axios';
import type {
  ChainConfiguration,
  CreateChainRequest,
  UpdateChainRequest,
  ExecuteAdHocChainRequest,
  ExecutionResult,
  Statistics,
  ModuleMetadata,
  ModuleProcessInfo,
  AIMessage,
  AIChatResponse,
} from '../types/aicontroller';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// AIController API client (proxied through AIDeveloper server)
const aiControllerAPI = axios.create({
  baseURL: '/api/aicontroller',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

export const workflowsAPI = {
  list: (params?: { limit?: number; offset?: number; status?: string }) =>
    api.get('/workflows', { params }),
  get: (id: number) => api.get(`/workflows/${id}`),
  create: (data: { workflowType: string; targetModule: string; taskDescription: string }) =>
    api.post('/workflows/manual', data),
  cancel: (id: number) => api.delete(`/workflows/${id}`),
  getLogs: (id: number, agentExecutionId?: number) =>
    api.get(`/workflows/${id}/logs`, { params: { agentExecutionId } }),
  getResumeState: (id: number) => api.get(`/workflows/${id}/resume-state`),
  resumeWorkflow: (id: number, fromAgentIndex?: number) =>
    api.post(`/workflows/${id}/resume`, { fromAgentIndex }),
};

export const statsAPI = {
  get: () => api.get('/stats'),
};

export const promptsAPI = {
  list: () => api.get('/prompts'),
  get: (name: string) => api.get(`/prompts/${name}`),
  update: (name: string, content: string) =>
    api.put(`/prompts/${name}`, { content }),
};

export const errorsAPI = {
  list: (limit?: number) => api.get('/errors', { params: { limit } }),
};

export const modulesAPI = {
  list: () => api.get('/modules'),
  import: (options: {
    url: string;
    category?: string;
    project?: string;
    tags?: string[];
    autoInstall?: boolean;
  }) => api.post('/modules/import', options),
  get: (name: string) => api.get(`/modules/${name}`),
  getStats: (name: string) => api.get(`/modules/${name}/stats`),
  getCommits: (name: string, limit?: number) =>
    api.get(`/modules/${name}/commits`, { params: { limit } }),
  getPrompts: (name: string) => api.get(`/modules/${name}/prompts`),
  getPromptContent: (name: string, promptName: string) =>
    api.get(`/modules/${name}/prompts/${promptName}`),
  updatePrompt: (name: string, promptName: string, content: string) =>
    api.put(`/modules/${name}/prompts/${promptName}`, { content }),
  install: (name: string) => api.post(`/modules/${name}/install`),
  build: (name: string) => api.post(`/modules/${name}/build`),
  test: (name: string) => api.post(`/modules/${name}/test`),
  start: (name: string) => api.post(`/modules/${name}/start`),
  stop: (name: string) => api.post(`/modules/${name}/stop`),
  getStatus: (name: string) => api.get(`/modules/${name}/status`),
  getLogs: (name: string, lines?: number) =>
    api.get(`/modules/${name}/logs`, { params: { lines } }),
  getDeployments: (name: string) => api.get(`/modules/${name}/deployments`),
  getAutoLoad: (name: string) => api.get(`/modules/${name}/auto-load`),
  setAutoLoad: (name: string, autoLoad: boolean) =>
    api.put(`/modules/${name}/auto-load`, { autoLoad }),
};

export const deploymentsAPI = {
  list: () => api.get('/deployments'),
  get: (operationId: string) => api.get(`/deployments/${operationId}`),
};

export interface BranchInfo {
  name: string;
  isLocal: boolean;
  isRemote: boolean;
  isCurrent: boolean;
}

export const systemAPI = {
  rebuildRestart: () => api.post('/system/rebuild-restart'),
  listBranches: () => api.get<{ success: boolean; branches: BranchInfo[]; currentBranch: string }>('/system/branches'),
  switchBranch: (branch: string) => api.post<{
    success: boolean;
    message: string;
    previousBranch?: string;
    newBranch?: string;
    buildLogs?: string;
    error?: string;
  }>('/system/switch-branch', { branch }),
};

// ============================================================================
// Module Plugin API
// ============================================================================

export interface ModulePage {
  module: string;
  page: {
    path: string;
    component: string;
    label: string;
    icon?: string;
    navOrder?: number;
  };
}

export interface DashboardWidget {
  module: string;
  widget: {
    id: string;
    component: string;
    position: 'top' | 'middle' | 'bottom';
    width: 'full' | 'half' | 'third';
    order?: number;
    title?: string;
  };
}

export const modulePluginsAPI = {
  getManifests: () => api.get<{ success: boolean; data: Record<string, any> }>('/modules/manifests'),
  getManifest: (name: string) => api.get<{ success: boolean; data: any }>(`/modules/${name}/manifest`),
  getPages: () => api.get<{ success: boolean; data: ModulePage[] }>('/modules/pages'),
  getDashboardWidgets: () => api.get<{ success: boolean; data: DashboardWidget[] }>('/modules/dashboard-widgets'),
  getEnvVars: () => api.get<{ success: boolean; data: Array<{ key: string; value: string | null; module: string; definition: any }> }>('/modules/env'),
  getModuleEnvVars: (name: string) => api.get<{ success: boolean; data: Array<any> }>(`/modules/${name}/env`),
  updateEnvVars: (updates: Record<string, string | null>) => api.put<{ success: boolean; message: string }>('/modules/env', updates),
  validateEnvVars: () => api.get<{ success: boolean; data: Array<{ module: string; key: string; missing: boolean }>; valid: boolean }>('/modules/env/validate'),
  getApiRoutes: () => api.get<{ success: boolean; data: Array<{ module: string; route: any }> }>('/modules/api-routes'),
};

// ============================================================================
// AIController Chain Management API
// ============================================================================

export const chainsAPI = {
  // Chain CRUD
  list: () => aiControllerAPI.get<{ success: boolean; data: ChainConfiguration[] }>('/chains'),
  get: (id: number) =>
    aiControllerAPI.get<{ success: boolean; data: ChainConfiguration }>(`/chain/${id}`),
  getUserChains: (userId: string) =>
    aiControllerAPI.get<{ success: boolean; data: ChainConfiguration[] }>(`/chains/${userId}`),
  create: (chain: CreateChainRequest) =>
    aiControllerAPI.post<{ success: boolean; data: ChainConfiguration }>('/chain', chain),
  update: (id: number, updates: UpdateChainRequest) =>
    aiControllerAPI.patch<{ success: boolean; data: ChainConfiguration }>(
      `/chain/${id}`,
      updates
    ),
  delete: (id: number) =>
    aiControllerAPI.delete<{ success: boolean; message: string }>(`/chain/${id}`),

  // Execution
  execute: (chainId: number, input: Record<string, any>, userId: string) =>
    aiControllerAPI.post<{ success: boolean; data: ExecutionResult }>(
      `/execute/${chainId}?userId=${userId}`,
      { input }
    ),
  executeAdHoc: (request: ExecuteAdHocChainRequest) =>
    aiControllerAPI.post<{ success: boolean; data: ExecutionResult }>('/execute', request),
  getExecution: (id: number) =>
    aiControllerAPI.get<{ success: boolean; data: ExecutionResult }>(`/execution/${id}`),
  getUserExecutions: (userId: string, limit?: number) =>
    aiControllerAPI.get<{ success: boolean; data: ExecutionResult[] }>(
      `/executions/${userId}`,
      { params: { limit } }
    ),
  getChainExecutions: (chainId: number, limit?: number) =>
    aiControllerAPI.get<{ success: boolean; data: ExecutionResult[] }>(
      `/chain/${chainId}/executions`,
      { params: { limit } }
    ),

  // Module metadata
  getModules: () =>
    aiControllerAPI.get<{ success: boolean; data: ModuleMetadata[] }>('/modules'),
  getModule: (type: string) =>
    aiControllerAPI.get<{ success: boolean; data: ModuleMetadata }>(`/modules/${type}`),

  // Statistics
  getStats: () => aiControllerAPI.get<{ success: boolean; data: Statistics }>('/stats'),

  // Health check - Returns true if AIController is responding (even if some modules are down)
  health: () =>
    aiControllerAPI
      .get<{ success: boolean; data: any }>('/health', { timeout: 2000, validateStatus: (status) => status < 600 })
      .then((response) => {
        // AIController is running if we get a response (200 or 503) with expected structure
        // 503 means some sub-modules are down but AIController itself is operational
        return (response.status === 200 || response.status === 503) &&
               response.data &&
               typeof response.data.data === 'object';
      })
      .catch(() => false),

  // AI Agent
  chat: (messages: AIMessage[]) =>
    aiControllerAPI.post<{ success: boolean; data: AIChatResponse }>('/ai/chat', { messages }),
};

// ============================================================================
// AIController Module Process Management API
// ============================================================================

export const moduleProcessesAPI = {
  list: () =>
    aiControllerAPI.get<{ success: boolean; data: ModuleProcessInfo[] }>('/module-processes'),
  get: (name: string) =>
    aiControllerAPI.get<{ success: boolean; data: ModuleProcessInfo }>(
      `/module-processes/${name}`
    ),
  start: (name: string, forceKillPort?: boolean) =>
    aiControllerAPI.post<{ success: boolean; data: ModuleProcessInfo; message: string }>(
      `/module-processes/${name}/start`,
      { forceKillPort }
    ),
  stop: (name: string) =>
    aiControllerAPI.post<{ success: boolean; data: ModuleProcessInfo; message: string }>(
      `/module-processes/${name}/stop`
    ),
  restart: (name: string) =>
    aiControllerAPI.post<{ success: boolean; data: ModuleProcessInfo; message: string }>(
      `/module-processes/${name}/restart`
    ),
  startAll: (forceKillPorts?: boolean) =>
    aiControllerAPI.post<{
      success: boolean;
      data: {
        results: Array<{ name: string; success: boolean; data?: any; error?: string }>;
        summary: { successful: number; failed: number; total: number };
      };
      message: string;
    }>('/module-processes/start-all', { forceKillPorts }),
};

export default api;
