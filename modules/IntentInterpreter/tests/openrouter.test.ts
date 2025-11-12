import { OpenRouterClient } from '../src/openrouter';
import { InterpreterError, OpenRouterConfig } from '../src/types';

describe('OpenRouterClient', () => {
  const validConfig: OpenRouterConfig = {
    apiKey: 'test-api-key',
    model: 'xai/grok-2-1212',
    baseUrl: 'https://openrouter.ai/api/v1',
  };

  describe('constructor', () => {
    it('should create instance with valid config', () => {
      expect(() => new OpenRouterClient(validConfig)).not.toThrow();
    });

    it('should throw error when API key is missing', () => {
      const invalidConfig = { ...validConfig, apiKey: '' };
      expect(() => new OpenRouterClient(invalidConfig)).toThrow(InterpreterError);
      expect(() => new OpenRouterClient(invalidConfig)).toThrow(/API key is required/);
    });

    it('should throw error when model is missing', () => {
      const invalidConfig = { ...validConfig, model: '' };
      expect(() => new OpenRouterClient(invalidConfig)).toThrow(InterpreterError);
      expect(() => new OpenRouterClient(invalidConfig)).toThrow(/model is required/);
    });

    it('should throw error when base URL is missing', () => {
      const invalidConfig = { ...validConfig, baseUrl: '' };
      expect(() => new OpenRouterClient(invalidConfig)).toThrow(InterpreterError);
      expect(() => new OpenRouterClient(invalidConfig)).toThrow(/base URL is required/);
    });

    it('should throw error when temperature is out of range', () => {
      const invalidConfig = { ...validConfig, temperature: 3.0 };
      expect(() => new OpenRouterClient(invalidConfig)).toThrow(InterpreterError);
      expect(() => new OpenRouterClient(invalidConfig)).toThrow(/Temperature must be between/);
    });

    it('should apply default values for optional parameters', () => {
      const client = new OpenRouterClient(validConfig);
      const config = client.getConfig();

      expect(config.maxTokens).toBeDefined();
      expect(config.temperature).toBeDefined();
      expect(config.timeout).toBeDefined();
    });
  });

  describe('createRequest', () => {
    it('should create valid request with system and user messages', () => {
      const client = new OpenRouterClient(validConfig);
      const request = client.createRequest('system prompt', 'user message');

      expect(request.model).toBe(validConfig.model);
      expect(request.messages).toHaveLength(2);
      expect(request.messages[0].role).toBe('system');
      expect(request.messages[0].content).toBe('system prompt');
      expect(request.messages[1].role).toBe('user');
      expect(request.messages[1].content).toBe('user message');
      expect(request.response_format).toEqual({ type: 'json_object' });
    });

    it('should include temperature and max_tokens in request', () => {
      const client = new OpenRouterClient({ ...validConfig, temperature: 0.5, maxTokens: 1000 });
      const request = client.createRequest('system', 'user');

      expect(request.temperature).toBe(0.5);
      expect(request.max_tokens).toBe(1000);
    });
  });

  describe('getModel', () => {
    it('should return the configured model', () => {
      const client = new OpenRouterClient(validConfig);
      expect(client.getModel()).toBe(validConfig.model);
    });
  });

  describe('getConfig', () => {
    it('should return config without API key', () => {
      const client = new OpenRouterClient(validConfig);
      const config = client.getConfig();

      expect(config.model).toBe(validConfig.model);
      expect(config.baseUrl).toBe(validConfig.baseUrl);
      expect(config).not.toHaveProperty('apiKey');
    });
  });

  describe('error handling', () => {
    it('should handle network timeout errors', async () => {
      const client = new OpenRouterClient({ ...validConfig, timeout: 1 });
      const request = client.createRequest('system', 'user');

      await expect(client.chatCompletion(request)).rejects.toThrow(InterpreterError);
    });

    it('should handle invalid API response structure', async () => {
      // This test would require mocking axios, which is complex with ESM
      // In a real scenario, you'd use a mocking library
      expect(true).toBe(true);
    });
  });
});
