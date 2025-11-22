import axios from 'axios';

const API_BASE = '/api';

export const workflowsAPI = {
  list: async (params: any = {}) => {
    const response = await axios.get(`${API_BASE}/workflows`, { params });
    return { data: response.data };
  },

  get: async (id: number) => {
    const response = await axios.get(`${API_BASE}/workflows/${id}`);
    return { data: response.data };
  },

  create: async (workflow: any) => {
    const response = await axios.post(`${API_BASE}/workflows/manual`, workflow);
    return { data: response.data };
  },

  update: async (id: number, workflow: any) => {
    const response = await axios.put(`${API_BASE}/workflows/${id}`, workflow);
    return { data: response.data };
  },

  delete: async (id: number) => {
    const response = await axios.delete(`${API_BASE}/workflows/${id}`);
    return { data: response.data };
  },

  getResumeState: async (id: number) => {
    const response = await axios.get(`${API_BASE}/workflows/${id}/resume-state`);
    return { data: response.data };
  },

  resumeWorkflow: async (id: number) => {
    const response = await axios.post(`${API_BASE}/workflows/${id}/resume`);
    return { data: response.data };
  },

  getLogs: async (id: number, params: any = {}) => {
    const response = await axios.get(`${API_BASE}/workflows/${id}/logs`, { params });
    return { data: response.data };
  },

  createNewModule: async (moduleConfig: {
    moduleName: string;
    description: string;
    moduleType?: 'service' | 'library';
    port?: number;
    hasFrontend?: boolean;
    frontendPort?: number;
    relatedModules?: string[];
    taskDescription?: string;
  }) => {
    const response = await axios.post(`${API_BASE}/workflows/new-module`, moduleConfig);
    return { data: response.data };
  }
};

export const modulesAPI = {
  list: async () => {
    const response = await axios.get(`${API_BASE}/modules`);
    return { data: response.data };
  },

  get: async (name: string) => {
    const response = await axios.get(`${API_BASE}/modules/${name}`);
    return { data: response.data };
  }
};
