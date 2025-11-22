/**
 * Unit tests for ModuleImportAgent
 */

import ModuleImportAgent from '../index';

describe('ModuleImportAgent', () => {
  beforeAll(() => {
    // Set required environment variable for tests
    process.env.OPENROUTER_API_KEY = 'test-api-key';
  });

  it('should be defined', () => {
    expect(ModuleImportAgent).toBeDefined();
  });

  it('should create an instance', () => {
    const agent = new ModuleImportAgent();
    expect(agent).toBeInstanceOf(ModuleImportAgent);
  });
});
