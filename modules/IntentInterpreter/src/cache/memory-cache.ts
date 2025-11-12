import { InterpretationResult } from '../types.js';
import { ICache, CacheEntry, CacheStats } from './cache-interface.js';
import { hashMessage, estimateTokensSaved } from './cache-utils.js';

/**
 * In-memory LRU (Least Recently Used) cache implementation
 * Provides fast access to recently used interpretations
 */
export class MemoryCache implements ICache {
  private cache: Map<string, CacheEntry>;
  private readonly maxSize: number;
  private hits: number;
  private misses: number;
  private tokensSaved: number;

  /**
   * Creates a new in-memory cache
   * @param maxSize - Maximum number of entries (default: 1000)
   */
  constructor(maxSize = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.hits = 0;
    this.misses = 0;
    this.tokensSaved = 0;
  }

  /**
   * Gets a cached result for a message
   * Updates access time and moves entry to end (most recent)
   */
  async get(message: string): Promise<InterpretationResult | null> {
    const hash = hashMessage(message);
    const entry = this.cache.get(hash);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Update access metadata
    entry.lastAccessedAt = new Date().toISOString();
    entry.accessCount++;

    // Move to end (most recently used) for LRU
    this.cache.delete(hash);
    this.cache.set(hash, entry);

    this.hits++;
    this.tokensSaved += estimateTokensSaved(message);

    return entry.result;
  }

  /**
   * Stores a result in the cache
   * Evicts least recently used entry if cache is full
   */
  async set(message: string, result: InterpretationResult): Promise<void> {
    const hash = hashMessage(message);

    // Evict LRU entry if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(hash)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const entry: CacheEntry = {
      result,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      accessCount: 0,
      messageHash: hash,
    };

    this.cache.set(hash, entry);
  }

  /**
   * Checks if a message exists in cache
   */
  async has(message: string): Promise<boolean> {
    return this.cache.has(hashMessage(message));
  }

  /**
   * Removes a specific entry from cache
   */
  async delete(message: string): Promise<void> {
    this.cache.delete(hashMessage(message));
  }

  /**
   * Clears all entries from cache
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.tokensSaved = 0;
  }

  /**
   * Gets cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate: Math.round(hitRate * 100) / 100,
      tokensSaved: this.tokensSaved,
    };
  }

  /**
   * Gets the current size of the cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Gets all cache entries (for debugging/testing)
   */
  getAllEntries(): CacheEntry[] {
    return Array.from(this.cache.values());
  }
}
