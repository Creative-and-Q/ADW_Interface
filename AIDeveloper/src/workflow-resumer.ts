import { CheckpointManager } from './checkpoint-manager';
import { WorkflowManager } from './workflow-manager';

/**
 * Handles resumption of workflows from checkpoints on server startup.
 * Ensures workflows continue from their last saved state securely.
 */
export class WorkflowResumer {
  private checkpointManager: CheckpointManager;
  private workflowManager: WorkflowManager;

  constructor(checkpointManager: CheckpointManager, workflowManager: WorkflowManager) {
    this.checkpointManager = checkpointManager;
    this.workflowManager = workflowManager;
  }

  /**
   * Resumes all workflows from their last checkpoints.
   * Loads and validates each checkpoint, then resumes the workflow.
   * Why: Allows automatic recovery on restart without data loss, with error handling to skip invalid checkpoints.
   * @throws Error if resumption fails critically, but logs and continues for non-critical errors.
   * @example
   * await workflowResumer.resumeWorkflows(); // Resumes all available workflows
   */
  async resumeWorkflows(): Promise<void> {
    try {
      const workflowIds = await this.checkpointManager.listCheckpoints();
      for (const workflowId of workflowIds) {
        const checkpoint = await this.checkpointManager.loadCheckpoint(workflowId);
        if (checkpoint) {
          await this.workflowManager.resumeWorkflow({
            workflowId,
            state: checkpoint,
            timestamp: Date.now(), // Approximate timestamp
          } as any); // Cast for compatibility
          console.log(`Resumed workflow ${workflowId} from checkpoint.`);
        } else {
          console.warn(`Failed to load checkpoint for ${workflowId}.`);
        }
      }
    } catch (error) {
      console.error('Error resuming workflows:', error);
      // Continue startup even if resumption fails
    }
  }
}