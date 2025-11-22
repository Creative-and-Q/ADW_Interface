/**
 * Unit tests for CodeReviewAgent
 */

import { CodeReviewAgent } from '../index';

describe('CodeReviewAgent', () => {
  beforeAll(() => {
    // Set required environment variable for tests
    process.env.OPENROUTER_API_KEY = 'test-api-key';
  });

  it('should be defined', () => {
    expect(CodeReviewAgent).toBeDefined();
  });

  it('should create an instance', () => {
    const agent = new CodeReviewAgent();
    expect(agent).toBeInstanceOf(CodeReviewAgent);
  });
});
