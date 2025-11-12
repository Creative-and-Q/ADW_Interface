import { InterpretationResult } from '../types.js';

/**
 * Cache entry with metadata
 */
export interface CacheEntry {
  /** The cached interpretation result */
  result: InterpretationResult;

  /** When the entry was created (ISO 8601) */
  createdAt: string;

  /** When the entry was last accessed (ISO 8601) */
  lastAccessedAt: string;

  /** Number of times this entry has been accessed */
  accessCount: number;

  /** Original message hash for verification */
  messageHash: string;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total number of cache hits */
  hits: number;

  /** Total number of cache misses */
  misses: number;

  /** Current number of entries in cache */
  size: number;

  /** Hit rate percentage (0-100) */
  hitRate: number;

  /** Total tokens saved by caching */
  tokensSaved?: number;
}

/**
 * Abstract interface for cache implementations
 */
export interface ICache {
  /**
   * Gets a cached result for a message
   * @param message - The user message
   * @returns Cached result or null if not found
   */
  get(message: string): Promise<InterpretationResult | null>;

  /**
   * Stores a result in the cache
   * @param message - The user message
   * @param result - The interpretation result to cache
   */
  set(message: string, result: InterpretationResult): Promise<void>;

  /**
   * Checks if a message exists in cache
   * @param message - The user message
   * @returns True if cached
   */
  has(message: string): Promise<boolean>;

  /**
   * Removes a specific entry from cache
   * @param message - The user message
   */
  delete(message: string): Promise<void>;

  /**
   * Clears all entries from cache
   */
  clear(): Promise<void>;

  /**
   * Gets cache statistics
   * @returns Cache statistics
   */
  getStats(): CacheStats;

  /**
   * Gets the size of the cache
   * @returns Number of entries
   */
  size(): number;
}
