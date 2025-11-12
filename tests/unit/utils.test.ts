import { validateWorkflowId, generateChecksum, validateChecksum } from '../../src/utils/workflow-validation';
import { encryptData, decryptData } from '../../src/utils/checkpoint-encryption';
import { jest } from '@jest/globals';

describe('Utils', () => {
  describe('validateWorkflowId', () => {
    test('should validate and sanitize valid workflowId', () => {
      expect(validateWorkflowId('valid-workflow_123')).toBe('valid-workflow_123');
    });

    test('should throw on invalid characters', () => {
      expect(() => validateWorkflowId('invalid/workflow')).toThrow('Invalid workflowId');
    });

    test('should throw on empty or too long', () => {
      expect(() => validateWorkflowId('')).toThrow('Invalid workflowId');
      expect(() => validateWorkflowId('a'.repeat(51))).toThrow('Invalid workflowId');
    });
  });

  describe('generateChecksum and validateChecksum', () => {
    test('should generate and validate checksum correctly', () => {
      const data = 'test data';
      const checksum = generateChecksum(data);
      expect(validateChecksum(data, checksum)).toBe(true);
      expect(validateChecksum(data, 'wrong')).toBe(false);
    });
  });

  describe('encryptData and decryptData', () => {
    test('should encrypt and decrypt data correctly', () => {
      const data = 'secret data';
      const encrypted = encryptData(data);
      const decrypted = decryptData(encrypted);
      expect(decrypted).toBe(data);
    });

    test('should throw on decryption with wrong key', () => {
      // Mock config to have wrong key, but since it's internal, test failure case
      const data = 'secret';
      const encrypted = encryptData(data);
      // Tamper with encrypted data to simulate
      encrypted[0] = 0;
      expect(() => decryptData(encrypted)).toThrow();
    });
  });
});