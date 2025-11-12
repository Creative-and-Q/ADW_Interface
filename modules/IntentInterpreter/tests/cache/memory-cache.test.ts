import { MemoryCache } from '../../src/cache/memory-cache';
import { InterpretationResult, IntentType } from '../../src/types';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  const mockResult: InterpretationResult = {
    rawMessage: 'test message',
    intents: [
      {
        intent: IntentType.ATTACK,
        confidence: 0.9,
        reasoning: 'Test reasoning',
      },
    ],
    timestamp: new Date().toISOString(),
    processingTimeMs: 100,
    model: 'test-model',
  };

  beforeEach(() => {
    cache = new MemoryCache(3); // Small size for testing
  });

  describe('set and get', () => {
    it('should store and retrieve results', async () => {
      await cache.set('test message', mockResult);
      const result = await cache.get('test message');

      expect(result).toBeDefined();
      expect(result?.rawMessage).toBe(mockResult.rawMessage);
    });

    it('should return null for non-existent entries', async () => {
      const result = await cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should normalize messages for cache keys', async () => {
      await cache.set('test message', mockResult);

      const result1 = await cache.get('TEST MESSAGE');
      const result2 = await cache.get('  test    message  ');

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entry when full', async () => {
      await cache.set('message1', { ...mockResult, rawMessage: 'message1' });
      await cache.set('message2', { ...mockResult, rawMessage: 'message2' });
      await cache.set('message3', { ...mockResult, rawMessage: 'message3' });

      // Cache is now full (size=3)
      expect(cache.size()).toBe(3);

      // Add a 4th item - should evict message1
      await cache.set('message4', { ...mockResult, rawMessage: 'message4' });

      expect(cache.size()).toBe(3);
      expect(await cache.get('message1')).toBeNull();
      expect(await cache.get('message4')).toBeDefined();
    });

    it('should not evict when updating existing entry', async () => {
      await cache.set('message1', mockResult);
      await cache.set('message2', mockResult);

      // Update message1
      await cache.set('message1', { ...mockResult, processingTimeMs: 200 });

      expect(cache.size()).toBe(2);
    });

    it('should move accessed entries to end (most recent)', async () => {
      await cache.set('message1', { ...mockResult, rawMessage: 'message1' });
      await cache.set('message2', { ...mockResult, rawMessage: 'message2' });
      await cache.set('message3', { ...mockResult, rawMessage: 'message3' });

      // Access message1 to make it most recent
      await cache.get('message1');

      // Add message4 - should evict message2 (not message1)
      await cache.set('message4', { ...mockResult, rawMessage: 'message4' });

      expect(await cache.get('message1')).toBeDefined();
      expect(await cache.get('message2')).toBeNull();
      expect(await cache.get('message4')).toBeDefined();
    });
  });

  describe('has', () => {
    it('should return true for existing entries', async () => {
      await cache.set('test', mockResult);
      expect(await cache.has('test')).toBe(true);
    });

    it('should return false for non-existent entries', async () => {
      expect(await cache.has('nonexistent')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove specific entries', async () => {
      await cache.set('test', mockResult);
      expect(await cache.has('test')).toBe(true);

      await cache.delete('test');
      expect(await cache.has('test')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', async () => {
      await cache.set('test1', mockResult);
      await cache.set('test2', mockResult);
      expect(cache.size()).toBe(2);

      await cache.clear();
      expect(cache.size()).toBe(0);
    });

    it('should reset statistics', async () => {
      await cache.set('test', mockResult);
      await cache.get('test');
      await cache.get('nonexistent');

      await cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should track cache hits', async () => {
      await cache.set('test', mockResult);

      await cache.get('test');
      await cache.get('test');

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
    });

    it('should track cache misses', async () => {
      await cache.get('nonexistent1');
      await cache.get('nonexistent2');

      const stats = cache.getStats();
      expect(stats.misses).toBe(2);
    });

    it('should calculate hit rate', async () => {
      await cache.set('test', mockResult);

      await cache.get('test'); // hit
      await cache.get('nonexistent'); // miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(50);
    });

    it('should track cache size', async () => {
      expect(cache.size()).toBe(0);

      await cache.set('test1', mockResult);
      expect(cache.size()).toBe(1);

      await cache.set('test2', mockResult);
      expect(cache.size()).toBe(2);
    });

    it('should estimate tokens saved', async () => {
      await cache.set('test message', mockResult);
      await cache.get('test message');

      const stats = cache.getStats();
      expect(stats.tokensSaved).toBeGreaterThan(0);
    });
  });

  describe('access tracking', () => {
    it('should update access count', async () => {
      await cache.set('test', mockResult);

      await cache.get('test');
      await cache.get('test');

      const entries = cache.getAllEntries();
      const entry = entries.find((e) => e.result.rawMessage === mockResult.rawMessage);

      expect(entry?.accessCount).toBe(2);
    });

    it('should update last accessed time', async () => {
      await cache.set('test', mockResult);

      const before = new Date().toISOString();
      await new Promise((resolve) => setTimeout(resolve, 10));
      await cache.get('test');

      const entries = cache.getAllEntries();
      const entry = entries.find((e) => e.result.rawMessage === mockResult.rawMessage);

      expect(entry).toBeDefined();
      if (entry) {
        expect(entry.lastAccessedAt >= before).toBe(true);
      }
    });
  });
});
