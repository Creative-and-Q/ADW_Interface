/**
 * Intent types supported by the interpreter
 * Each represents a distinct category of user action or communication
 */
export enum IntentType {
  /** Physical combat or aggressive actions (e.g., "I attack the goblin") */
  ATTACK = 'attack',

  /** Defensive or protective actions (e.g., "I block with my shield") */
  DEFEND = 'defend',

  /** Movement or navigation actions (e.g., "I walk north") */
  MOVEMENT = 'movement',

  /** Examining or searching actions (e.g., "I inspect the chest") */
  INVESTIGATION = 'investigation',

  /** Emotional expressions or gestures (e.g., "I smile at the merchant") */
  EMOTE = 'emote',

  /** Communication with NPCs or other players (e.g., "I ask about the quest") */
  DIALOGUE = 'dialogue',

  /** Creating, crafting, or building items/structures (e.g., "I craft a sword") */
  CREATION = 'creation',

  /** Using, consuming, or equipping items (e.g., "I drink the potion") */
  ITEM_USE = 'item_use',

  /** Trading or economic transactions (e.g., "I buy the armor") */
  TRADE = 'trade',

  /** Magic casting or supernatural abilities (e.g., "I cast fireball") */
  MAGIC = 'magic',

  /** Stealth or sneaking actions (e.g., "I hide in the shadows") */
  STEALTH = 'stealth',

  /** Resting, healing, or recovery actions (e.g., "I rest at the campfire") */
  REST = 'rest',

  /** Interacting with objects or environment (e.g., "I pull the lever") */
  INTERACTION = 'interaction',

  /** Social or relationship-building actions (e.g., "I befriend the villager") */
  SOCIAL = 'social',

  /** Acquiring or gathering resources (e.g., "I mine the ore") */
  GATHER = 'gather',

  /** Learning or skill development (e.g., "I study the spellbook") */
  LEARN = 'learn',

  /** Meta-game or system commands (e.g., "show inventory") */
  SYSTEM_COMMAND = 'system_command',

  /** General user actions not fitting other categories */
  USER_ACTION = 'user_action',

  /** Unclear or ambiguous intent */
  UNKNOWN = 'unknown',
}

/**
 * Configuration for the OpenRouter API
 */
export interface OpenRouterConfig {
  /** OpenRouter API key */
  apiKey: string;

  /** Model identifier (e.g., "xai/grok-2-1212") */
  model: string;

  /** Base URL for OpenRouter API */
  baseUrl: string;

  /** Maximum tokens in response */
  maxTokens?: number;

  /** Temperature for response randomness (0.0 - 2.0) */
  temperature?: number;

  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Single classified intent with confidence score
 */
export interface ClassifiedIntent {
  /** The intent type */
  intent: IntentType;

  /** Confidence score (0.0 - 1.0) */
  confidence: number;

  /** Brief explanation of why this intent was identified */
  reasoning: string;

  /** Additional context or metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Complete interpretation result for a user message
 */
export interface InterpretationResult {
  /** The original user message */
  rawMessage: string;

  /** Array of identified intents, ordered by confidence (highest first) */
  intents: ClassifiedIntent[];

  /** ISO 8601 timestamp of when interpretation was performed */
  timestamp: string;

  /** Processing time in milliseconds */
  processingTimeMs: number;

  /** Model used for interpretation */
  model: string;

  /** Whether this result was served from cache */
  fromCache?: boolean;

  /** Any errors that occurred during processing */
  error?: string;
}

/**
 * OpenRouter API request message
 */
export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * OpenRouter API request payload
 */
export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
}

/**
 * OpenRouter API response structure
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
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Expected JSON structure from Grok's response
 */
export interface GrokIntentResponse {
  intents: Array<{
    intent: string;
    confidence: number;
    reasoning: string;
    metadata?: Record<string, unknown>;
  }>;
}

/**
 * Configuration options for the interpreter
 */
export interface InterpreterConfig {
  /** Minimum confidence threshold to include an intent (0.0 - 1.0) */
  minConfidenceThreshold?: number;

  /** Maximum number of intents to return */
  maxIntentsReturned?: number;

  /** Whether to include low-confidence intents in results */
  includeAllIntents?: boolean;

  /** Enable caching of interpretation results */
  cacheEnabled?: boolean;

  /** Enable in-memory cache */
  cacheMemoryEnabled?: boolean;

  /** Maximum size of memory cache */
  cacheMemoryMaxSize?: number;

  /** Enable persistent file cache */
  cacheFileEnabled?: boolean;

  /** Directory for file cache */
  cacheFileCacheDir?: string;
}

/**
 * Error types specific to the interpreter
 */
export enum InterpreterErrorType {
  API_ERROR = 'api_error',
  VALIDATION_ERROR = 'validation_error',
  PARSING_ERROR = 'parsing_error',
  CONFIGURATION_ERROR = 'configuration_error',
  NETWORK_ERROR = 'network_error',
}

/**
 * Custom error class for interpreter errors
 */
export class InterpreterError extends Error {
  constructor(
    public type: InterpreterErrorType,
    message: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'InterpreterError';
    Object.setPrototypeOf(this, InterpreterError.prototype);
  }
}
