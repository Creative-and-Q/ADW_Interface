import { config as dotenvConfig } from 'dotenv';
import * as path from 'path';

dotenvConfig(); // Load environment variables

/**
 * Configuration for checkpoint management.
 * Centralizes settings for encryption, directories, and serialization to ensure consistency and security.
 */
export const config = {
  /**
   * Encryption key loaded from environment variable.
   * Must be 32 bytes (256 bits) for AES-256. Validates on load to prevent misconfiguration.
   * Why: Protects against cryptographic failures by ensuring a valid key is present.
   */
  encryptionKey: (() => {
    const key = process.env.CHECKPOINT_ENCRYPTION_KEY;
    if (!key || Buffer.from(key, 'hex').length !== 32) {
      throw new Error('Invalid or missing CHECKPOINT_ENCRYPTION_KEY. Must be a 64-character hex string (32 bytes).');
    }
    return Buffer.from(key, 'hex');
  })(),

  /**
   * Directory path for storing checkpoint files.
   * Uses absolute path for reliability.
   */
  checkpointDir: path.join(process.cwd(), 'checkpoints'),

  /**
   * Options for serialize-javascript.
   * Ensures safe serialization without executing code.
   */
  serializeOptions: {
    space: 2,
    unsafe: false, // Prevents unsafe deserialization
  },
};