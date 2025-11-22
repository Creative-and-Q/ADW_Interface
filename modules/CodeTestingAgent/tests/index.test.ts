/**
 * Unit tests for CodeTestingAgent
 */

import { CodeTestingAgent } from '../index';

describe('CodeTestingAgent', () => {
  beforeAll(() => {
    // Set required environment variable for tests
    process.env.OPENROUTER_API_KEY = 'test-api-key';
  });

  it('should be defined', () => {
    expect(CodeTestingAgent).toBeDefined();
  });

  it('should create an instance', () => {
    const agent = new CodeTestingAgent();
    expect(agent).toBeInstanceOf(CodeTestingAgent);
  });
});
