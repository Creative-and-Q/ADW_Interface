/**
 * Unit tests for CodingAgent
 */

import { CodingAgent } from '../index';

describe('CodingAgent', () => {
  beforeAll(() => {
    // Set required environment variable for tests
    process.env.OPENROUTER_API_KEY = 'test-api-key';
  });

  it('should be defined', () => {
    expect(CodingAgent).toBeDefined();
  });

  it('should create an instance', () => {
    const agent = new CodingAgent();
    expect(agent).toBeInstanceOf(CodingAgent);
  });
});
