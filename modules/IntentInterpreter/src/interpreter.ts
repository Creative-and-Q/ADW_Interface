import { OpenRouterClient } from './openrouter.js';
import { getSystemPrompt, isValidIntentType } from './prompts/system-prompt.js';
import {
  InterpretationResult,
  ClassifiedIntent,
  InterpreterConfig,
  OpenRouterConfig,
  GrokIntentResponse,
  IntentType,
  InterpreterError,
  InterpreterErrorType,
} from './types.js';
import { CacheManager } from './cache/cache-manager.js';

/**
 * Main interpreter class for classifying user message intents
 * Orchestrates the OpenRouter API client and processes responses
 */
export class IntentInterpreter {
  private readonly openRouterClient: OpenRouterClient;
  private readonly config: Required<InterpreterConfig>;
  private readonly systemPrompt: string;
  private readonly cacheManager: CacheManager;

  /**
   * Default interpreter configuration
   */
  private static readonly DEFAULTS: Required<InterpreterConfig> = {
    minConfidenceThreshold: 0.3,
    maxIntentsReturned: 5,
    includeAllIntents: false,
    cacheEnabled: true,
    cacheMemoryEnabled: true,
    cacheMemoryMaxSize: 1000,
    cacheFileEnabled: true,
    cacheFileCacheDir: './.cache',
  };

  /**
   * Creates a new IntentInterpreter instance
   * @param openRouterConfig - Configuration for OpenRouter API
   * @param interpreterConfig - Optional interpreter-specific configuration
   */
  constructor(openRouterConfig: OpenRouterConfig, interpreterConfig?: InterpreterConfig) {
    this.openRouterClient = new OpenRouterClient(openRouterConfig);
    this.config = {
      ...IntentInterpreter.DEFAULTS,
      ...interpreterConfig,
    };
    this.systemPrompt = getSystemPrompt();
    this.cacheManager = new CacheManager({
      enabled: this.config.cacheEnabled,
      memoryEnabled: this.config.cacheMemoryEnabled,
      memoryMaxSize: this.config.cacheMemoryMaxSize,
      fileEnabled: this.config.cacheFileEnabled,
      fileCacheDir: this.config.cacheFileCacheDir,
    });
  }

  /**
   * Interprets a user message and returns classified intents
   * Checks cache first, then calls API if not cached
   * @param message - The user message to interpret
   * @returns Interpretation result with classified intents
   * @throws {InterpreterError} If interpretation fails
   */
  async interpret(message: string): Promise<InterpretationResult> {
    const startTime = Date.now();

    try {
      // Validate input
      this.validateMessage(message);

      // Check cache first
      const cachedResult = await this.cacheManager.get(message);
      if (cachedResult) {
        // Return cached result with updated metadata
        return {
          ...cachedResult,
          fromCache: true,
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Cache miss - call API
      const request = this.openRouterClient.createRequest(this.systemPrompt, message);
      const response = await this.openRouterClient.chatCompletion(request);

      // Parse and validate response
      const grokResponse = this.parseGrokResponse(response.choices[0].message.content);
      const classifiedIntents = this.processIntents(grokResponse.intents);

      // Build result
      const processingTimeMs = Date.now() - startTime;
      const result = this.buildResult(message, classifiedIntents, processingTimeMs);

      // Store in cache (fire and forget - don't wait)
      void this.cacheManager.set(message, result).catch((error) => {
        console.warn('Failed to cache result:', error);
      });

      return result;
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      return this.buildErrorResult(message, error, processingTimeMs);
    }
  }

  /**
   * Interprets multiple messages in batch
   * @param messages - Array of messages to interpret
   * @returns Array of interpretation results
   */
  async interpretBatch(messages: string[]): Promise<InterpretationResult[]> {
    const results: InterpretationResult[] = [];

    for (const message of messages) {
      try {
        const result = await this.interpret(message);
        results.push(result);
      } catch (error) {
        results.push(
          this.buildErrorResult(
            message,
            error,
            0,
            'Batch processing error'
          )
        );
      }
    }

    return results;
  }

  /**
   * Validates a user message
   * @param message - Message to validate
   * @throws {InterpreterError} If message is invalid
   */
  private validateMessage(message: string): void {
    if (!message || typeof message !== 'string') {
      throw new InterpreterError(
        InterpreterErrorType.VALIDATION_ERROR,
        'Message must be a non-empty string'
      );
    }

    const trimmed = message.trim();
    if (trimmed.length === 0) {
      throw new InterpreterError(
        InterpreterErrorType.VALIDATION_ERROR,
        'Message cannot be empty or whitespace only'
      );
    }

    if (trimmed.length > 5000) {
      throw new InterpreterError(
        InterpreterErrorType.VALIDATION_ERROR,
        'Message exceeds maximum length of 5000 characters'
      );
    }
  }

  /**
   * Parses the JSON response from Grok
   * @param content - Raw response content
   * @returns Parsed Grok response
   * @throws {InterpreterError} If parsing fails
   */
  private parseGrokResponse(content: string): GrokIntentResponse {
    try {
      const parsed = JSON.parse(content) as GrokIntentResponse;

      if (!parsed.intents || !Array.isArray(parsed.intents)) {
        throw new Error('Response missing "intents" array');
      }

      if (parsed.intents.length === 0) {
        throw new Error('Response contains empty intents array');
      }

      return parsed;
    } catch (error) {
      throw new InterpreterError(
        InterpreterErrorType.PARSING_ERROR,
        `Failed to parse Grok response: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Processes and validates raw intents from Grok response
   * @param rawIntents - Raw intents from Grok
   * @returns Validated and filtered classified intents
   */
  private processIntents(
    rawIntents: GrokIntentResponse['intents']
  ): ClassifiedIntent[] {
    const classified: ClassifiedIntent[] = [];

    for (const rawIntent of rawIntents) {
      try {
        const intent = this.validateAndNormalizeIntent(rawIntent);

        // Apply confidence threshold filter
        if (
          this.config.includeAllIntents ||
          intent.confidence >= this.config.minConfidenceThreshold
        ) {
          classified.push(intent);
        }
      } catch (error) {
        // Log validation error but continue processing other intents
        console.warn(
          `Skipping invalid intent: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Sort by confidence (highest first)
    classified.sort((a, b) => b.confidence - a.confidence);

    // Limit number of intents returned
    const limited = classified.slice(0, this.config.maxIntentsReturned);

    // Ensure at least one intent exists
    if (limited.length === 0) {
      limited.push({
        intent: IntentType.UNKNOWN,
        confidence: 0.1,
        reasoning: 'No valid intents could be identified',
      });
    }

    return limited;
  }

  /**
   * Validates and normalizes a single intent
   * @param rawIntent - Raw intent from Grok
   * @returns Validated classified intent
   * @throws {Error} If intent is invalid
   */
  private validateAndNormalizeIntent(
    rawIntent: GrokIntentResponse['intents'][0]
  ): ClassifiedIntent {
    // Validate intent type
    if (!rawIntent.intent || typeof rawIntent.intent !== 'string') {
      throw new Error('Intent type is missing or invalid');
    }

    const normalizedIntentType = rawIntent.intent.toLowerCase().trim();
    if (!isValidIntentType(normalizedIntentType)) {
      throw new Error(`Unknown intent type: ${rawIntent.intent}`);
    }

    // Validate confidence
    if (typeof rawIntent.confidence !== 'number') {
      throw new Error('Confidence must be a number');
    }

    const confidence = Math.max(0, Math.min(1, rawIntent.confidence));

    // Validate reasoning
    if (!rawIntent.reasoning || typeof rawIntent.reasoning !== 'string') {
      throw new Error('Reasoning is missing or invalid');
    }

    return {
      intent: normalizedIntentType as IntentType,
      confidence,
      reasoning: rawIntent.reasoning.trim(),
      metadata: rawIntent.metadata,
    };
  }

  /**
   * Builds a successful interpretation result
   * @param message - Original message
   * @param intents - Classified intents
   * @param processingTimeMs - Processing time
   * @returns Interpretation result
   */
  private buildResult(
    message: string,
    intents: ClassifiedIntent[],
    processingTimeMs: number
  ): InterpretationResult {
    return {
      rawMessage: message,
      intents,
      timestamp: new Date().toISOString(),
      processingTimeMs,
      model: this.openRouterClient.getModel(),
    };
  }

  /**
   * Builds an error interpretation result
   * @param message - Original message
   * @param error - Error that occurred
   * @param processingTimeMs - Processing time
   * @param customMessage - Optional custom error message
   * @returns Interpretation result with error
   */
  private buildErrorResult(
    message: string,
    error: unknown,
    processingTimeMs: number,
    customMessage?: string
  ): InterpretationResult {
    const errorMessage =
      customMessage ||
      (error instanceof InterpreterError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error));

    return {
      rawMessage: message,
      intents: [
        {
          intent: IntentType.UNKNOWN,
          confidence: 0.0,
          reasoning: 'Error occurred during interpretation',
        },
      ],
      timestamp: new Date().toISOString(),
      processingTimeMs,
      model: this.openRouterClient.getModel(),
      error: errorMessage,
    };
  }

  /**
   * Gets the current interpreter configuration
   * @returns Current configuration (excluding sensitive data)
   */
  getConfig(): Required<InterpreterConfig> {
    return { ...this.config };
  }

  /**
   * Gets the OpenRouter client configuration
   * @returns OpenRouter configuration (excluding API key)
   */
  getOpenRouterConfig(): Omit<Required<OpenRouterConfig>, 'apiKey'> {
    return this.openRouterClient.getConfig();
  }

  /**
   * Gets cache statistics
   * @returns Cache statistics including hits, misses, and tokens saved
   */
  getCacheStats() {
    return this.cacheManager.getStats();
  }

  /**
   * Gets detailed cache statistics for both memory and file caches
   * @returns Detailed statistics for each cache layer
   */
  getDetailedCacheStats() {
    return this.cacheManager.getDetailedStats();
  }

  /**
   * Clears all cached entries
   */
  async clearCache(): Promise<void> {
    await this.cacheManager.clear();
  }

  /**
   * Removes a specific message from cache
   * @param message - The message to remove from cache
   */
  async removeCachedMessage(message: string): Promise<void> {
    await this.cacheManager.delete(message);
  }

  /**
   * Checks if a message is cached
   * @param message - The message to check
   * @returns True if the message is cached
   */
  async isCached(message: string): Promise<boolean> {
    return await this.cacheManager.has(message);
  }

  /**
   * Cleans corrupted cache entries
   * @returns Number of corrupted entries removed
   */
  async cleanCorruptedCache(): Promise<number> {
    return await this.cacheManager.cleanCorrupted();
  }
}
