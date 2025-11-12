import { Server } from '../../src/server';
import { CheckpointManager } from '../../src/checkpoint-manager';
import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Server Resume Integration', () => {
  let server: Server;
  let mockCheckpointManager: jest.Mocked<CheckpointManager>;

  beforeEach(() => {
    mockCheckpointManager = {
      loadCheckpoint: jest.fn(),
    } as any;
    server = new Server();
    (server as any).checkpointManager = mockCheckpointManager;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('resumeWorkflows', () => {
    test('should resume workflows from valid checkpoints', async () => {
      const mockFiles = ['workflow1.checkpoint', 'invalid.checkpoint'];
      jest.spyOn(fs.promises, 'readdir').mockResolvedValue(mockFiles);
      mockCheckpointManager.loadCheckpoint.mockResolvedValue({ step: 1 });
      const resumeSpy = jest.spyOn(server as any, 'resumeWorkflow').mockResolvedValue(undefined);

      await (server as any).resumeWorkflows();

      expect(resumeSpy).toHaveBeenCalledWith('workflow1', { step: 1 });
      expect(resumeSpy).toHaveBeenCalledTimes(1); // Only valid one
    });

    test('should skip invalid workflowId', async () => {
      const mockFiles = ['invalid..checkpoint'];
      jest.spyOn(fs.promises, 'readdir').mockResolvedValue(mockFiles);
      // Assume validateWorkflowId throws
      jest.spyOn(require('../../src/utils/workflow-validation'), 'validateWorkflowId').mockImplementation(() => {
        throw new Error('Invalid');
      });

      await (server as any).resumeWorkflows();

      expect(console.warn).toHaveBeenCalled();
    });

    test('should handle readdir error', async () => {
      jest.spyOn(fs.promises, 'readdir').mockRejectedValue(new Error('Readdir error'));

      await (server as any).resumeWorkflows();

      expect(console.error).toHaveBeenCalledWith('Error resuming workflows:', expect.any(Error));
    });
  });
});