import { createCipherGCM, createDecipherGCM, randomBytes } from 'crypto';
import { config } from '../config/checkpoint-config';

/**
 * Encrypts the given data using AES-256-GCM.
 * This ensures confidentiality and integrity of checkpoint data by using authenticated encryption.
 * The IV is randomly generated per encryption to prevent reuse attacks.
 * @param data - The plaintext data to encrypt as a string.
 * @returns The encrypted data as a Buffer containing the IV, auth tag, and ciphertext.
 * @throws Error if encryption fails (e.g., invalid key).
 * @example
 * const encrypted = encryptData('{"state": "example"}');
 * // encrypted is a Buffer ready for storage
 */
export function encryptData(data: string): Buffer {
  const key = config.encryptionKey;
  const iv = randomBytes(16); // 128-bit IV for GCM
  const cipher = createCipherGCM('aes-256-gcm', key);
  cipher.setIV(iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Combine IV, auth tag, and encrypted data for storage
  return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]);
}

/**
 * Decrypts the given encrypted data using AES-256-GCM.
 * Verifies authenticity using the auth tag to detect tampering.
 * @param encryptedData - The encrypted data Buffer (containing IV, auth tag, and ciphertext).
 * @returns The decrypted plaintext data as a string.
 * @throws Error if decryption fails (e.g., invalid key, tampered data, or incorrect IV/tag).
 * @example
 * const decrypted = decryptData(encryptedBuffer);
 * // decrypted is '{"state": "example"}'
 */
export function decryptData(encryptedData: Buffer): string {
  const key = config.encryptionKey;
  const iv = encryptedData.subarray(0, 16);
  const authTag = encryptedData.subarray(16, 32);
  const ciphertext = encryptedData.subarray(32);

  const decipher = createDecipherGCM('aes-256-gcm', key);
  decipher.setIV(iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted += decipher.final('utf8');

  return decrypted;
}