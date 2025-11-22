/**
 * Unit tests for CodePlannerAgent
 */

import { CodePlannerAgent } from '../index';

describe('CodePlannerAgent', () => {
  beforeAll(() => {
    // Set required environment variable for tests
    process.env.OPENROUTER_API_KEY = 'test-api-key';
  });

  it('should be defined', () => {
    expect(CodePlannerAgent).toBeDefined();
  });

  it('should create an instance', () => {
    const agent = new CodePlannerAgent();
    expect(agent).toBeInstanceOf(CodePlannerAgent);
  });
});
