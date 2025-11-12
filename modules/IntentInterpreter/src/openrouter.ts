import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  OpenRouterConfig,
  OpenRouterRequest,
  OpenRouterResponse,
  InterpreterError,
  InterpreterErrorType,
} from './types.js';

/**
 * Client for interacting with the OpenRouter API
 * Handles authentication, request formatting, and error handling
 */
export class OpenRouterClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly config: Required<OpenRouterConfig>;

  /**
   * Default configuration values
   */
  private static readonly DEFAULTS = {
    maxTokens: 2000,
    temperature: 0.7,
    timeout: 30000, // 30 seconds
  };

  /**
   * Creates a new OpenRouter API client
   * @param config - Configuration for the OpenRouter API
   * @throws {InterpreterError} If configuration is invalid
   */
  constructor(config: OpenRouterConfig) {
    this.validateConfig(config);

    this.config = {
      ...config,
      maxTokens: config.maxTokens ?? OpenRouterClient.DEFAULTS.maxTokens,
      temperature: config.temperature ?? OpenRouterClient.DEFAULTS.temperature,
      timeout: config.timeout ?? OpenRouterClient.DEFAULTS.timeout,
    };

    this.axiosInstance = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/intent-interpreter',
        'X-Title': 'Intent Interpreter',
      },
    });
  }

  /**
   * Validates the OpenRouter configuration
   * @param config - Configuration to validate
   * @throws {InterpreterError} If configuration is invalid
   */
  private validateConfig(config: OpenRouterConfig): void {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new InterpreterError(
        InterpreterErrorType.CONFIGURATION_ERROR,
        'OpenRouter API key is required'
      );
    }

    if (!config.model || config.model.trim() === '') {
      throw new InterpreterError(
        InterpreterErrorType.CONFIGURATION_ERROR,
        'OpenRouter model is required'
      );
    }

    if (!config.baseUrl || config.baseUrl.trim() === '') {
      throw new InterpreterError(
        InterpreterErrorType.CONFIGURATION_ERROR,
        'OpenRouter base URL is required'
      );
    }

    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      throw new InterpreterError(
        InterpreterErrorType.CONFIGURATION_ERROR,
        'Temperature must be between 0 and 2'
      );
    }
  }

  /**
   * Sends a chat completion request to OpenRouter
   * @param request - The request payload
   * @returns The API response
   * @throws {InterpreterError} If the request fails
   */
  async chatCompletion(request: OpenRouterRequest): Promise<OpenRouterResponse> {
    try {
      const response = await this.axiosInstance.post<OpenRouterResponse>(
        '/chat/completions',
        request
      );

      if (!response.data || !response.data.choices || response.data.choices.length === 0) {
        throw new InterpreterError(
          InterpreterErrorType.API_ERROR,
          'Invalid response from OpenRouter API: no choices returned'
        );
      }

      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Creates a chat completion request with the given messages
   * @param systemPrompt - The system prompt
   * @param userMessage - The user message
   * @returns OpenRouter request object
   */
  createRequest(systemPrompt: string, userMessage: string): OpenRouterRequest {
    return {
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      response_format: { type: 'json_object' },
    };
  }

  /**
   * Handles errors from the OpenRouter API
   * @param error - The error to handle
   * @throws {InterpreterError} Always throws with appropriate error type
   */
  private handleError(error: unknown): never {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
        throw new InterpreterError(
          InterpreterErrorType.NETWORK_ERROR,
          `Request timeout after ${this.config.timeout}ms`,
          error
        );
      }

      if (axiosError.response) {
        const status = axiosError.response.status;
        const data = axiosError.response.data as { error?: { message?: string } };
        const errorMessage = data?.error?.message || axiosError.message;

        if (status === 401) {
          throw new InterpreterError(
            InterpreterErrorType.API_ERROR,
            'Invalid API key or authentication failed',
            error
          );
        }

        if (status === 429) {
          throw new InterpreterError(
            InterpreterErrorType.API_ERROR,
            'Rate limit exceeded. Please try again later.',
            error
          );
        }

        if (status >= 500) {
          throw new InterpreterError(
            InterpreterErrorType.API_ERROR,
            `OpenRouter server error (${status}): ${errorMessage}`,
            error
          );
        }

        throw new InterpreterError(
          InterpreterErrorType.API_ERROR,
          `OpenRouter API error (${status}): ${errorMessage}`,
          error
        );
      }

      if (axiosError.request) {
        throw new InterpreterError(
          InterpreterErrorType.NETWORK_ERROR,
          'No response received from OpenRouter API. Check your network connection.',
          error
        );
      }
    }

    throw new InterpreterError(
      InterpreterErrorType.API_ERROR,
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }

  /**
   * Gets the current model being used
   * @returns The model identifier
   */
  getModel(): string {
    return this.config.model;
  }

  /**
   * Gets the current configuration (without sensitive data)
   * @returns Safe configuration object
   */
  getConfig(): Omit<Required<OpenRouterConfig>, 'apiKey'> {
    return {
      model: this.config.model,
      baseUrl: this.config.baseUrl,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      timeout: this.config.timeout,
    };
  }
}
