import {
  getSystemPrompt,
  getAllIntentTypes,
  isValidIntentType,
} from '../src/prompts/system-prompt';
import { IntentType } from '../src/types';

describe('System Prompt', () => {
  describe('getSystemPrompt', () => {
    it('should return a non-empty string', () => {
      const prompt = getSystemPrompt();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should include all intent types', () => {
      const prompt = getSystemPrompt();
      const intentTypes = Object.values(IntentType);

      intentTypes.forEach((intent) => {
        expect(prompt).toContain(intent);
      });
    });

    it('should include JSON response format instructions', () => {
      const prompt = getSystemPrompt();
      expect(prompt).toContain('JSON');
      expect(prompt).toContain('intents');
      expect(prompt).toContain('confidence');
      expect(prompt).toContain('reasoning');
    });

    it('should include examples', () => {
      const prompt = getSystemPrompt();
      expect(prompt).toContain('Example');
    });

    it('should include confidence score guidelines', () => {
      const prompt = getSystemPrompt();
      expect(prompt).toContain('0.9');
      expect(prompt).toContain('0.7');
      expect(prompt).toContain('0.5');
    });
  });

  describe('getAllIntentTypes', () => {
    it('should return all intent types', () => {
      const intents = getAllIntentTypes();
      expect(Array.isArray(intents)).toBe(true);
      expect(intents.length).toBeGreaterThan(0);
    });

    it('should include all IntentType enum values', () => {
      const intents = getAllIntentTypes();
      const enumValues = Object.values(IntentType);
      expect(intents).toEqual(expect.arrayContaining(enumValues));
    });
  });

  describe('isValidIntentType', () => {
    it('should return true for valid intent types', () => {
      expect(isValidIntentType('attack')).toBe(true);
      expect(isValidIntentType('movement')).toBe(true);
      expect(isValidIntentType('dialogue')).toBe(true);
    });

    it('should return false for invalid intent types', () => {
      expect(isValidIntentType('invalid')).toBe(false);
      expect(isValidIntentType('foobar')).toBe(false);
      expect(isValidIntentType('')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isValidIntentType('ATTACK')).toBe(false);
      expect(isValidIntentType('Attack')).toBe(false);
      expect(isValidIntentType('attack')).toBe(true);
    });
  });
});
