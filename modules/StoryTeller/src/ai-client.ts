/**
 * AI Client for OpenRouter Integration
 *
 * Handles communication with OpenRouter API for narrative generation.
 */

import axios, { AxiosError } from 'axios';
import { AIGenerateParams, AIGenerateResult } from './types.js';

export class AIClient {
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    this.baseURL = 'https://openrouter.ai/api/v1';
    this.model = process.env.STORYTELLER_MODEL || 'anthropic/claude-3.5-sonnet';
    this.defaultTemperature = parseFloat(process.env.STORYTELLER_TEMPERATURE || '0.7');
    this.defaultMaxTokens = parseInt(process.env.STORYTELLER_MAX_TOKENS || '500');

    if (!this.apiKey) {
      console.warn(
        '⚠️  No OpenRouter API key found. AI narrative generation will not function. Set OPENROUTER_API_KEY environment variable.'
      );
    }
  }

  /**
   * Check if AI client is properly configured
   */
  public isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Generate narrative content using AI
   */
  public async generateResponse(params: AIGenerateParams): Promise<AIGenerateResult> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const { systemPrompt, userPrompt, temperature, maxTokens } = params;

    try {
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
          temperature: temperature ?? this.defaultTemperature,
          max_tokens: maxTokens ?? this.defaultMaxTokens,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3036', // Optional: for rankings
            'X-Title': 'Ex Nihilo StoryTeller', // Optional: for rankings
          },
          timeout: 30000, // 30 second timeout
        }
      );

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content in AI response');
      }

      const tokensUsed = response.data.usage?.total_tokens || 0;

      return {
        content: content.trim(),
        tokens_used: tokensUsed,
        model: this.model,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response) {
          // API error response
          const status = axiosError.response.status;
          const data = axiosError.response.data as any;

          if (status === 401) {
            throw new Error('OpenRouter API authentication failed. Check your API key.');
          } else if (status === 429) {
            throw new Error('OpenRouter API rate limit exceeded. Try again later.');
          } else if (status === 400) {
            throw new Error(
              `OpenRouter API bad request: ${data.error?.message || 'Invalid parameters'}`
            );
          } else {
            throw new Error(
              `OpenRouter API error (${status}): ${data.error?.message || 'Unknown error'}`
            );
          }
        } else if (axiosError.request) {
          // Network error
          throw new Error('Network error: Could not reach OpenRouter API');
        }
      }

      // Unknown error
      throw new Error(`AI generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate narrative with retry logic
   */
  public async generateWithRetry(
    params: AIGenerateParams,
    maxRetries: number = 2
  ): Promise<AIGenerateResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.generateResponse(params);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Don't retry on authentication or bad request errors
        if (
          lastError.message.includes('authentication') ||
          lastError.message.includes('bad request')
        ) {
          throw lastError;
        }

        // If not the last attempt, wait before retrying
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.warn(`AI generation attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('AI generation failed after retries');
  }

  /**
   * Get current model name
   */
  public getModel(): string {
    return this.model;
  }

  /**
   * Estimate token count (rough approximation)
   * Actual token count may vary by model
   */
  public estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}
