import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { InterpretationResult } from '../types.js';
import { ICache, CacheEntry, CacheStats } from './cache-interface.js';
import { hashMessage, estimateTokensSaved } from './cache-utils.js';

/**
 * Permanent file-based cache implementation
 * Stores cache entries as JSON files on disk with no expiration
 * Each entry is stored in a separate file for atomic operations
 */
export class FileCache implements ICache {
  private readonly cacheDir: string;
  private hits: number;
  private misses: number;
  private tokensSaved: number;
  private initialized: boolean;

  /**
   * Creates a new file-based cache
   * @param cacheDir - Directory to store cache files (default: ./.cache)
   */
  constructor(cacheDir = './.cache') {
    this.cacheDir = cacheDir;
    this.hits = 0;
    this.misses = 0;
    this.tokensSaved = 0;
    this.initialized = false;
  }

  /**
   * Ensures cache directory exists
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      this.initialized = true;
    } catch (error) {
      throw new Error(
        `Failed to create cache directory: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Gets the file path for a cache entry
   */
  private getCacheFilePath(hash: string): string {
    return path.join(this.cacheDir, `${hash}.json`);
  }

  /**
   * Gets a cached result for a message
   */
  async get(message: string): Promise<InterpretationResult | null> {
    await this.ensureInitialized();
    const hash = hashMessage(message);
    const filePath = this.getCacheFilePath(hash);

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const entry: CacheEntry = JSON.parse(data);

      // Update access metadata
      entry.lastAccessedAt = new Date().toISOString();
      entry.accessCount++;

      // Write back updated metadata (fire and forget)
      void fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8').catch(() => {
        // Ignore write errors for metadata updates
      });

      this.hits++;
      this.tokensSaved += estimateTokensSaved(message);

      return entry.result;
    } catch (error) {
      // File doesn't exist or is corrupted
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.misses++;
        return null;
      }

      // Log corrupted cache entry and return null
      console.warn(`Corrupted cache entry for hash ${hash}:`, error);
      this.misses++;
      return null;
    }
  }

  /**
   * Stores a result in the cache permanently
   */
  async set(message: string, result: InterpretationResult): Promise<void> {
    await this.ensureInitialized();
    const hash = hashMessage(message);
    const filePath = this.getCacheFilePath(hash);

    const entry: CacheEntry = {
      result,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      accessCount: 0,
      messageHash: hash,
    };

    try {
      await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to write cache entry: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Checks if a message exists in cache
   */
  async has(message: string): Promise<boolean> {
    await this.ensureInitialized();
    const hash = hashMessage(message);
    const filePath = this.getCacheFilePath(hash);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Removes a specific entry from cache
   */
  async delete(message: string): Promise<void> {
    await this.ensureInitialized();
    const hash = hashMessage(message);
    const filePath = this.getCacheFilePath(hash);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(
          `Failed to delete cache entry: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * Clears all entries from cache
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();

    try {
      const files = await fs.readdir(this.cacheDir);

      await Promise.all(
        files
          .filter((file) => file.endsWith('.json'))
          .map((file) => fs.unlink(path.join(this.cacheDir, file)))
      );

      this.hits = 0;
      this.misses = 0;
      this.tokensSaved = 0;
    } catch (error) {
      throw new Error(
        `Failed to clear cache: ${error instanceof Error ? error.message : String(error)}`
      );
    }
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
      size: this.size(),
      hitRate: Math.round(hitRate * 100) / 100,
      tokensSaved: this.tokensSaved,
    };
  }

  /**
   * Gets the current size of the cache (synchronous)
   * Note: This is a blocking operation for consistency
   */
  size(): number {
    try {
      const files = fsSync.readdirSync(this.cacheDir);
      return files.filter((file: string) => file.endsWith('.json')).length;
    } catch {
      return 0;
    }
  }

  /**
   * Gets all cache entries (for debugging/admin)
   * Warning: This can be slow for large caches
   */
  async getAllEntries(): Promise<CacheEntry[]> {
    await this.ensureInitialized();
    const entries: CacheEntry[] = [];

    try {
      const files = await fs.readdir(this.cacheDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const data = await fs.readFile(path.join(this.cacheDir, file), 'utf-8');
          const entry: CacheEntry = JSON.parse(data);
          entries.push(entry);
        } catch {
          // Skip corrupted entries
          continue;
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return entries;
  }

  /**
   * Removes corrupted cache entries
   * @returns Number of corrupted entries removed
   */
  async cleanCorruptedEntries(): Promise<number> {
    await this.ensureInitialized();
    let removed = 0;

    try {
      const files = await fs.readdir(this.cacheDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.cacheDir, file);

        try {
          const data = await fs.readFile(filePath, 'utf-8');
          JSON.parse(data); // Validate JSON
        } catch {
          // Corrupted entry - remove it
          await fs.unlink(filePath);
          removed++;
        }
      }
    } catch {
      // Ignore errors
    }

    return removed;
  }
}
