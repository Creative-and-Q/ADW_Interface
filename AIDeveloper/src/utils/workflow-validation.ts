import { createHash } from 'crypto';

/**
 * Sanitizes and validates the workflowId to prevent path traversal attacks.
 * Restricts input to alphanumeric characters, hyphens, and underscores; enforces length limits.
 * This mitigates OWASP A05:2021-Security Misconfiguration by ensuring safe file paths.
 * @param workflowId - The input workflowId string to validate and sanitize.
 * @returns The sanitized workflowId if valid.
 * @throws Error if the workflowId is invalid (e.g., contains forbidden characters or exceeds length).
 * @example
 * const validId = validateWorkflowId('my-workflow_123');
 * // validId is 'my-workflow_123'
 * @example
 * validateWorkflowId('../malicious'); // Throws Error
 */
export function validateWorkflowId(workflowId: string): string {
  const sanitized = workflowId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (sanitized.length === 0 || sanitized.length > 50) {
    throw new Error('Invalid workflowId: must be 1-50 alphanumeric characters, hyphens, or underscores.');
  }
  return sanitized;
}

/**
 * Generates a SHA-256 checksum for the given data to ensure integrity.
 * Used to detect tampering in checkpoint files.
 * @param data - The data string to hash.
 * @returns The hexadecimal SHA-256 checksum.
 * @example
 * const checksum = generateChecksum('data');
 * // checksum is a hex string like 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3'
 */
export function generateChecksum(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Validates the checksum of the data against the provided checksum.
 * Ensures data integrity before deserialization.
 * @param data - The data string to verify.
 * @param checksum - The expected SHA-256 checksum.
 * @returns True if the checksum matches, false otherwise.
 * @example
 * const isValid = validateChecksum('data', 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3');
 * // isValid is true
 */
export function validateChecksum(data: string, checksum: string): boolean {
  return generateChecksum(data) === checksum;
}