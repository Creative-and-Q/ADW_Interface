import axios, { AxiosInstance } from 'axios';

/**
 * OpenRouter API configuration
 */
export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Message for OpenRouter API
 */
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * OpenRouter API response
 */
export interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
}

/**
 * Client for OpenRouter API
 */
export class OpenRouterClient {
  private readonly axios: AxiosInstance;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxTokens: number;

  constructor(config: OpenRouterConfig) {
    if (!config.apiKey) {
      throw new Error('OpenRouter API key is required');
    }

    this.model = config.model;
    this.temperature = config.temperature ?? 0.3;
    this.maxTokens = config.maxTokens ?? 2000;

    this.axios = axios.create({
      baseURL: config.baseUrl ?? 'https://openrouter.ai/api/v1',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/character-controller',
        'X-Title': 'Character Controller',
      },
      timeout: 30000,
    });
  }

  /**
   * Send chat completion request
   */
  async chat(messages: Message[]): Promise<string> {
    try {
      const response = await this.axios.post<OpenRouterResponse>('/chat/completions', {
        model: this.model,
        messages,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      });

      if (!response.data.choices || response.data.choices.length === 0) {
        throw new Error('No response from OpenRouter API');
      }

      const content = response.data.choices[0].message.content;
      console.log('Raw OpenRouter response content:', JSON.stringify(content));
      return content;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Invalid OpenRouter API key');
        }
        if (error.response?.status === 429) {
          throw new Error('OpenRouter rate limit exceeded');
        }
        throw new Error(
          `OpenRouter API error: ${error.response?.data?.error?.message || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Simple completion helper
   */
  async complete(systemPrompt: string, userMessage: string): Promise<string> {
    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]);
  }
}
