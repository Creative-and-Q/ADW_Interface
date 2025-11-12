import {
  normalizeMessage,
  hashMessage,
  estimateTokensSaved,
} from '../../src/cache/cache-utils';

describe('Cache Utils', () => {
  describe('normalizeMessage', () => {
    it('should convert to lowercase', () => {
      expect(normalizeMessage('HELLO WORLD')).toBe('hello world');
      expect(normalizeMessage('HeLLo WoRLd')).toBe('hello world');
    });

    it('should trim whitespace', () => {
      expect(normalizeMessage('  hello world  ')).toBe('hello world');
      expect(normalizeMessage('\n\thello world\t\n')).toBe('hello world');
    });

    it('should normalize internal whitespace', () => {
      expect(normalizeMessage('hello    world')).toBe('hello world');
      expect(normalizeMessage('hello\t\tworld')).toBe('hello world');
      expect(normalizeMessage('hello\n\nworld')).toBe('hello world');
    });

    it('should handle combined normalization', () => {
      expect(normalizeMessage('  HELLO    WORLD  ')).toBe('hello world');
    });
  });

  describe('hashMessage', () => {
    it('should return consistent hashes for same message', () => {
      const hash1 = hashMessage('hello world');
      const hash2 = hashMessage('hello world');
      expect(hash1).toBe(hash2);
    });

    it('should return same hash for normalized variants', () => {
      const hash1 = hashMessage('hello world');
      const hash2 = hashMessage('HELLO WORLD');
      const hash3 = hashMessage('  hello    world  ');
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should return different hashes for different messages', () => {
      const hash1 = hashMessage('hello world');
      const hash2 = hashMessage('goodbye world');
      expect(hash1).not.toBe(hash2);
    });

    it('should return hexadecimal string', () => {
      const hash = hashMessage('test');
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('should return consistent length (SHA-256 = 64 hex chars)', () => {
      const hash1 = hashMessage('short');
      const hash2 = hashMessage('a much longer message');
      expect(hash1.length).toBe(64);
      expect(hash2.length).toBe(64);
    });
  });

  describe('estimateTokensSaved', () => {
    it('should estimate tokens for short messages', () => {
      const tokens = estimateTokensSaved('hello');
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeGreaterThan(700); // At least system prompt + response
    });

    it('should estimate more tokens for longer messages', () => {
      const shortTokens = estimateTokensSaved('hi');
      const longTokens = estimateTokensSaved('this is a much longer message');
      expect(longTokens).toBeGreaterThan(shortTokens);
    });

    it('should include base overhead for API call', () => {
      const tokens = estimateTokensSaved('a');
      // Should include system prompt (~500) + response (~200)
      expect(tokens).toBeGreaterThanOrEqual(700);
    });
  });
});
