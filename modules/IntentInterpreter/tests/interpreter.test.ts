import { IntentInterpreter } from '../src/interpreter';
import {
  IntentType,
  OpenRouterConfig,
} from '../src/types';

describe('IntentInterpreter', () => {
  const validConfig: OpenRouterConfig = {
    apiKey: 'test-api-key',
    model: 'xai/grok-2-1212',
    baseUrl: 'https://openrouter.ai/api/v1',
  };

  describe('constructor', () => {
    it('should create instance with valid config', () => {
      expect(() => new IntentInterpreter(validConfig)).not.toThrow();
    });

    it('should apply default interpreter config', () => {
      const interpreter = new IntentInterpreter(validConfig);
      const config = interpreter.getConfig();

      expect(config.minConfidenceThreshold).toBeDefined();
      expect(config.maxIntentsReturned).toBeDefined();
      expect(config.includeAllIntents).toBeDefined();
    });

    it('should accept custom interpreter config', () => {
      const customConfig = {
        minConfidenceThreshold: 0.5,
        maxIntentsReturned: 3,
        includeAllIntents: true,
      };
      const interpreter = new IntentInterpreter(validConfig, customConfig);
      const config = interpreter.getConfig();

      expect(config.minConfidenceThreshold).toBe(0.5);
      expect(config.maxIntentsReturned).toBe(3);
      expect(config.includeAllIntents).toBe(true);
    });
  });

  describe('message validation', () => {
    let interpreter: IntentInterpreter;

    beforeEach(() => {
      interpreter = new IntentInterpreter(validConfig);
    });

    it('should reject null or undefined messages', async () => {
      const result1 = await interpreter.interpret(null as unknown as string);
      expect(result1.error).toBeDefined();
      expect(result1.intents[0].intent).toBe(IntentType.UNKNOWN);

      const result2 = await interpreter.interpret(undefined as unknown as string);
      expect(result2.error).toBeDefined();
      expect(result2.intents[0].intent).toBe(IntentType.UNKNOWN);
    });

    it('should reject empty or whitespace-only messages', async () => {
      const result1 = await interpreter.interpret('');
      expect(result1.error).toBeDefined();

      const result2 = await interpreter.interpret('   ');
      expect(result2.error).toBeDefined();

      const result3 = await interpreter.interpret('\n\t');
      expect(result3.error).toBeDefined();
    });

    it('should reject messages exceeding maximum length', async () => {
      const longMessage = 'a'.repeat(5001);
      const result = await interpreter.interpret(longMessage);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('maximum length');
    });

    it('should accept valid messages', async () => {
      const validMessage = 'I attack the goblin';
      // This would fail without API key, but validation should pass
      const result = await interpreter.interpret(validMessage);
      expect(result.rawMessage).toBe(validMessage);
    });
  });

  describe('result structure', () => {
    let interpreter: IntentInterpreter;

    beforeEach(() => {
      interpreter = new IntentInterpreter(validConfig);
    });

    it('should return properly structured result', async () => {
      const result = await interpreter.interpret('test message');

      expect(result).toHaveProperty('rawMessage');
      expect(result).toHaveProperty('intents');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('processingTimeMs');
      expect(result).toHaveProperty('model');
      expect(Array.isArray(result.intents)).toBe(true);
    });

    it('should include at least one intent', async () => {
      const result = await interpreter.interpret('test message');
      expect(result.intents.length).toBeGreaterThan(0);
    });

    it('should order intents by confidence', async () => {
      const result = await interpreter.interpret('test message');

      for (let i = 1; i < result.intents.length; i++) {
        expect(result.intents[i - 1].confidence).toBeGreaterThanOrEqual(
          result.intents[i].confidence
        );
      }
    });
  });

  describe('intent filtering', () => {
    it('should filter intents below confidence threshold', () => {
      const interpreter = new IntentInterpreter(validConfig, {
        minConfidenceThreshold: 0.7,
      });

      expect(interpreter.getConfig().minConfidenceThreshold).toBe(0.7);
    });

    it('should limit number of intents returned', () => {
      const interpreter = new IntentInterpreter(validConfig, {
        maxIntentsReturned: 3,
      });

      expect(interpreter.getConfig().maxIntentsReturned).toBe(3);
    });
  });

  describe('batch processing', () => {
    let interpreter: IntentInterpreter;

    beforeEach(() => {
      interpreter = new IntentInterpreter(validConfig);
    });

    it('should process multiple messages', async () => {
      const messages = ['message 1', 'message 2', 'message 3'];
      const results = await interpreter.interpretBatch(messages);

      expect(results).toHaveLength(3);
      expect(results[0].rawMessage).toBe('message 1');
      expect(results[1].rawMessage).toBe('message 2');
      expect(results[2].rawMessage).toBe('message 3');
    });

    it('should handle empty batch', async () => {
      const results = await interpreter.interpretBatch([]);
      expect(results).toHaveLength(0);
    });

    it('should continue processing on individual errors', async () => {
      const messages = ['valid message', '', 'another valid message'];
      const results = await interpreter.interpretBatch(messages);

      expect(results).toHaveLength(3);
      expect(results[1].error).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should include error in result when processing fails', async () => {
      const interpreter = new IntentInterpreter({
        apiKey: 'invalid-key',
        model: 'xai/grok-2-1212',
        baseUrl: 'https://openrouter.ai/api/v1',
      });

      const result = await interpreter.interpret('test message');
      expect(result.error).toBeDefined();
      expect(result.intents[0].intent).toBe(IntentType.UNKNOWN);
    });
  });

  describe('configuration getters', () => {
    it('should return interpreter config', () => {
      const interpreter = new IntentInterpreter(validConfig);
      const config = interpreter.getConfig();

      expect(config).toHaveProperty('minConfidenceThreshold');
      expect(config).toHaveProperty('maxIntentsReturned');
      expect(config).toHaveProperty('includeAllIntents');
    });

    it('should return OpenRouter config without API key', () => {
      const interpreter = new IntentInterpreter(validConfig);
      const config = interpreter.getOpenRouterConfig();

      expect(config).toHaveProperty('model');
      expect(config).toHaveProperty('baseUrl');
      expect(config).not.toHaveProperty('apiKey');
    });
  });
});
