import * as crypto from 'crypto';

/**
 * Normalizes a message for consistent cache key generation
 * Converts to lowercase, trims whitespace, and normalizes internal whitespace
 * @param message - The message to normalize
 * @returns Normalized message
 */
export function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' '); // Normalize multiple spaces to single space
}

/**
 * Generates a hash for a message to use as cache key
 * Uses SHA-256 for consistent, collision-resistant hashing
 * @param message - The message to hash
 * @returns Hexadecimal hash string
 */
export function hashMessage(message: string): string {
  const normalized = normalizeMessage(message);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Estimates tokens saved by a cache hit
 * Rough estimate: ~1 token per 4 characters for English text
 * @param message - The cached message
 * @returns Estimated tokens saved
 */
export function estimateTokensSaved(message: string): number {
  // Rough approximation: 1 token ~= 4 characters
  // Plus system prompt overhead (~500 tokens) and response (~200 tokens)
  const messageTokens = Math.ceil(message.length / 4);
  const systemPromptTokens = 500;
  const responseTokens = 200;
  return messageTokens + systemPromptTokens + responseTokens;
}
