import { InterpretationResult } from '../types.js';
import { ICache, CacheStats } from './cache-interface.js';
import { MemoryCache } from './memory-cache.js';
import { FileCache } from './file-cache.js';

/**
 * Configuration for the cache manager
 */
export interface CacheConfig {
  /** Enable/disable caching entirely */
  enabled?: boolean;

  /** Enable in-memory cache */
  memoryEnabled?: boolean;

  /** Maximum size of memory cache */
  memoryMaxSize?: number;

  /** Enable persistent file cache */
  fileEnabled?: boolean;

  /** Directory for file cache */
  fileCacheDir?: string;
}

/**
 * Unified cache manager that coordinates memory and file caches
 * Implements a two-tier caching strategy:
 * 1. Check memory cache first (fast)
 * 2. Check file cache second (permanent)
 * 3. Store in both caches on miss
 */
export class CacheManager implements ICache {
  private readonly config: Required<CacheConfig>;
  private readonly memoryCache: MemoryCache | null;
  private readonly fileCache: FileCache | null;

  /**
   * Default cache configuration
   */
  private static readonly DEFAULTS: Required<CacheConfig> = {
    enabled: true,
    memoryEnabled: true,
    memoryMaxSize: 1000,
    fileEnabled: true,
    fileCacheDir: './.cache',
  };

  /**
   * Creates a new cache manager
   * @param config - Cache configuration
   */
  constructor(config?: CacheConfig) {
    this.config = {
      ...CacheManager.DEFAULTS,
      ...config,
    };

    // Initialize caches based on configuration
    this.memoryCache = this.config.memoryEnabled
      ? new MemoryCache(this.config.memoryMaxSize)
      : null;

    this.fileCache = this.config.fileEnabled
      ? new FileCache(this.config.fileCacheDir)
      : null;
  }

  /**
   * Gets a cached result for a message
   * Checks memory cache first, then file cache
   */
  async get(message: string): Promise<InterpretationResult | null> {
    if (!this.config.enabled) {
      return null;
    }

    // Try memory cache first (fastest)
    if (this.memoryCache) {
      const result = await this.memoryCache.get(message);
      if (result) {
        return result;
      }
    }

    // Try file cache (permanent)
    if (this.fileCache) {
      const result = await this.fileCache.get(message);
      if (result) {
        // Populate memory cache for next time
        if (this.memoryCache) {
          await this.memoryCache.set(message, result);
        }
        return result;
      }
    }

    return null;
  }

  /**
   * Stores a result in both caches
   */
  async set(message: string, result: InterpretationResult): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Store in both caches concurrently
    const promises: Promise<void>[] = [];

    if (this.memoryCache) {
      promises.push(this.memoryCache.set(message, result));
    }

    if (this.fileCache) {
      promises.push(this.fileCache.set(message, result));
    }

    await Promise.all(promises);
  }

  /**
   * Checks if a message exists in either cache
   */
  async has(message: string): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    if (this.memoryCache && (await this.memoryCache.has(message))) {
      return true;
    }

    if (this.fileCache && (await this.fileCache.has(message))) {
      return true;
    }

    return false;
  }

  /**
   * Removes a specific entry from both caches
   */
  async delete(message: string): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.memoryCache) {
      promises.push(this.memoryCache.delete(message));
    }

    if (this.fileCache) {
      promises.push(this.fileCache.delete(message));
    }

    await Promise.all(promises);
  }

  /**
   * Clears all entries from both caches
   */
  async clear(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.memoryCache) {
      promises.push(this.memoryCache.clear());
    }

    if (this.fileCache) {
      promises.push(this.fileCache.clear());
    }

    await Promise.all(promises);
  }

  /**
   * Gets combined cache statistics
   */
  getStats(): CacheStats {
    const memoryStats = this.memoryCache?.getStats();
    const fileStats = this.fileCache?.getStats();

    if (!memoryStats && !fileStats) {
      return {
        hits: 0,
        misses: 0,
        size: 0,
        hitRate: 0,
        tokensSaved: 0,
      };
    }

    const hits = (memoryStats?.hits || 0) + (fileStats?.hits || 0);
    const misses = (memoryStats?.misses || 0) + (fileStats?.misses || 0);
    const total = hits + misses;
    const hitRate = total > 0 ? (hits / total) * 100 : 0;

    return {
      hits,
      misses,
      size: this.size(),
      hitRate: Math.round(hitRate * 100) / 100,
      tokensSaved: (memoryStats?.tokensSaved || 0) + (fileStats?.tokensSaved || 0),
    };
  }

  /**
   * Gets the total size across both caches
   * Note: File cache size is counted, memory cache entries may overlap
   */
  size(): number {
    const memorySize = this.memoryCache?.size() || 0;
    const fileSize = this.fileCache?.size() || 0;

    // Return file size as it's the source of truth for unique entries
    return fileSize > 0 ? fileSize : memorySize;
  }

  /**
   * Gets separate stats for each cache layer
   */
  getDetailedStats(): {
    memory: CacheStats | null;
    file: CacheStats | null;
    combined: CacheStats;
  } {
    return {
      memory: this.memoryCache?.getStats() || null,
      file: this.fileCache?.getStats() || null,
      combined: this.getStats(),
    };
  }

  /**
   * Cleans corrupted entries from file cache
   */
  async cleanCorrupted(): Promise<number> {
    if (!this.fileCache) {
      return 0;
    }

    return await this.fileCache.cleanCorruptedEntries();
  }

  /**
   * Checks if caching is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Gets the current configuration
   */
  getConfig(): Required<CacheConfig> {
    return { ...this.config };
  }
}
