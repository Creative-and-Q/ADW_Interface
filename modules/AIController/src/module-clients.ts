import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { ModuleType, HttpMethod } from './types.js';

export interface ModuleRequest {
  module: ModuleType;
  endpoint: string;
  method: HttpMethod;
  params?: Record<string, any>;
  body?: Record<string, any>;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface ModuleResponse {
  data: any;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export class ModuleClients {
  private clients: Map<ModuleType, AxiosInstance>;

  constructor() {
    this.clients = new Map();
    this.initializeClients();
  }

  private initializeClients(): void {
    const baseURLs: Record<ModuleType, string> = {
      intent: process.env.INTENT_INTERPRETER_URL || 'http://localhost:3032',
      character: process.env.CHARACTER_CONTROLLER_URL || 'http://localhost:3031',
      scene: process.env.SCENE_CONTROLLER_URL || 'http://localhost:3033',
      item: process.env.ITEM_CONTROLLER_URL || 'http://localhost:3034',
      storyteller: process.env.STORYTELLER_URL || 'http://localhost:3037',
    };

    for (const [module, baseURL] of Object.entries(baseURLs)) {
      this.clients.set(module as ModuleType, axios.create({
        baseURL,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      }));
    }

    console.log('🔌 Module clients initialized:', Object.keys(baseURLs).join(', '));
  }

  async executeRequest(request: ModuleRequest): Promise<ModuleResponse> {
    const client = this.clients.get(request.module);
    if (!client) {
      throw new Error(`Unknown module: ${request.module}`);
    }

    // Build URL with path parameters
    let url = this.resolvePath(request.endpoint, request.params || {});

    // Build axios config
    const config: AxiosRequestConfig = {
      method: request.method,
      url,
      timeout: request.timeout || 30000,
    };

    // Add query parameters (for GET requests or additional params)
    if (request.params && Object.keys(request.params).length > 0) {
      // Filter out params that were used in path
      const pathParams = this.extractPathParams(request.endpoint);
      const queryParams: Record<string, any> = {};

      for (const [key, value] of Object.entries(request.params)) {
        if (!pathParams.includes(key)) {
          queryParams[key] = value;
        }
      }

      if (Object.keys(queryParams).length > 0) {
        config.params = queryParams;
      }
    }

    // Add body (for POST/PATCH/PUT)
    if (request.body && ['POST', 'PATCH', 'PUT'].includes(request.method)) {
      config.data = request.body;
    }

    // Add custom headers
    if (request.headers) {
      config.headers = {
        ...config.headers,
        ...request.headers,
      };
    }

    try {
      const response = await client.request(config);
      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as Record<string, string>,
      };
    } catch (error: any) {
      if (error.response) {
        // Server responded with error
        return {
          data: error.response.data,
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
        };
      } else if (error.request) {
        // Request made but no response
        throw new Error(`No response from ${request.module} module: ${error.message}`);
      } else {
        // Error setting up request
        throw new Error(`Request error for ${request.module}: ${error.message}`);
      }
    }
  }

  /**
   * Resolve path parameters in endpoint
   * Example: /character/:userId/:name + { userId: "user1", name: "Thorin" }
   * Result: /character/user1/Thorin
   */
  private resolvePath(endpoint: string, params: Record<string, any>): string {
    let resolved = endpoint;
    const pathParams = this.extractPathParams(endpoint);

    for (const param of pathParams) {
      if (params[param] !== undefined) {
        resolved = resolved.replace(`:${param}`, String(params[param]));
      }
    }

    return resolved;
  }

  /**
   * Extract path parameter names from endpoint
   * Example: /character/:userId/:name -> ["userId", "name"]
   */
  private extractPathParams(endpoint: string): string[] {
    if (!endpoint) return [];
    const matches = endpoint.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g);
    if (!matches) return [];
    return matches.map((match) => match.substring(1));
  }

  /**
   * Health check for all modules
   */
  async healthCheck(): Promise<Record<ModuleType, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [module, client] of this.clients) {
      try {
        const response = await client.get('/health', { timeout: 5000 });
        results[module] = response.status === 200;
      } catch {
        results[module] = false;
      }
    }

    return results as Record<ModuleType, boolean>;
  }

  /**
   * Get base URL for a module
   */
  getModuleURL(module: ModuleType): string {
    const client = this.clients.get(module);
    if (!client) {
      throw new Error(`Unknown module: ${module}`);
    }
    return client.defaults.baseURL || '';
  }
}
