import { serialize, deserialize } from 'serialize-javascript';
import { promises as fs } from 'fs';
import * as path from 'path';
import { encryptData, decryptData } from './utils/checkpoint-encryption';
import { validateWorkflowId, generateChecksum, validateChecksum } from './utils/workflow-validation';
import { config } from './config/checkpoint-config';
import * as fse from 'fs-extra'; // For enhanced file operations

/**
 * Interface for a workflow checkpoint.
 */
export interface WorkflowCheckpoint {
  workflowId: string;
  state: any; // Serialized workflow state
  timestamp: number;
}

/**
 * Manages saving and loading workflow checkpoints to/from disk securely.
 * Handles serialization, encryption, validation, and access controls to prevent security vulnerabilities.
 * Why: Addresses previous issues with eval() and lack of encryption by using safe alternatives and cryptographic protections.
 */
export class CheckpointManager {
  private checkpointDir: string;

  constructor(checkpointDir: string = config.checkpointDir) {
    this.checkpointDir = checkpointDir;
    // Ensure directory exists with restricted permissions (handled in save/load)
  }

  /**
   * Saves the workflow state to an encrypted checkpoint file with integrity checks.
   * Serializes safely, encrypts, generates checksum, and sets file permissions.
   * @param workflowId - The ID of the workflow.
   * @param state - The state object to save.
   * @throws Error if saving fails (e.g., validation, encryption, or I/O error).
   * @example
   * await checkpointManager.saveCheckpoint('workflow-1', { step: 1, data: 'value' });
   */
  async saveCheckpoint(workflowId: string, state: any): Promise<void> {
    try {
      const sanitizedId = validateWorkflowId(workflowId);
      const filePath = path.join(config.checkpointDir, `${sanitizedId}.checkpoint`);
      const checksumPath = `${filePath}.checksum`;

      // Serialize state safely
      const serializedState = serialize(state, config.serializeOptions);
      const checksum = generateChecksum(serializedState);

      // Encrypt the serialized data
      const encryptedData = encryptData(serializedState);

      // Ensure directory exists and set permissions
      await fse.ensureDir(config.checkpointDir);
      await fs.writeFile(filePath, encryptedData);
      await fs.writeFile(checksumPath, checksum);

      // Set file permissions to owner-only
      await fs.chmod(filePath, 0o600);
      await fs.chmod(checksumPath, 0o600);
    } catch (error) {
      console.error('Error saving checkpoint:', error);
      throw error;
    }
  }

  /**
   * Loads the workflow state from an encrypted checkpoint file with validation.
   * Decrypts, validates checksum, and deserializes safely.
   * @param workflowId - The ID of the workflow.
   * @returns The loaded state object.
   * @throws Error if loading fails (e.g., validation, decryption, or integrity check).
   * @example
   * const state = await checkpointManager.loadCheckpoint('workflow-1');
   * // state is { step: 1, data: 'value' }
   */
  async loadCheckpoint(workflowId: string): Promise<any> {
    try {
      const sanitizedId = validateWorkflowId(workflowId);
      const filePath = path.join(config.checkpointDir, `${sanitizedId}.checkpoint`);
      const checksumPath = `${filePath}.checksum`;

      // Read encrypted data and checksum
      const encryptedData = await fs.readFile(filePath);
      const storedChecksum = (await fs.readFile(checksumPath, 'utf8')).trim();

      // Decrypt data
      const decryptedData = decryptData(encryptedData);

      // Validate checksum
      if (!validateChecksum(decryptedData, storedChecksum)) {
        throw new Error('Checkpoint checksum validation failed: file may be tampered with.');
      }

      // Deserialize safely
      const state = deserialize(decryptedData);
      return state;
    } catch (error) {
      console.error('Error loading checkpoint:', error);
      throw error;
    }
  }

  /**
   * Lists all saved checkpoint files (workflow IDs).
   * @returns Array of workflow IDs with checkpoints.
   * @example
   * const ids = await checkpointManager.listCheckpoints();
   * // ids is ['workflow-1', 'workflow-2']
   */
  async listCheckpoints(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.checkpointDir);
      return files.filter(file => file.endsWith('.checkpoint')).map(file => file.replace('.checkpoint', ''));
    } catch (error) {
      console.error('Failed to list checkpoints:', error);
      return [];
    }
  }

  /**
   * Deletes a checkpoint file and its checksum.
   * @param workflowId - The ID of the workflow.
   * @example
   * await checkpointManager.deleteCheckpoint('workflow-1');
   */
  async deleteCheckpoint(workflowId: string): Promise<void> {
    try {
      const sanitizedId = validateWorkflowId(workflowId);
      const filePath = path.join(this.checkpointDir, `${sanitizedId}.checkpoint`);
      const checksumPath = `${filePath}.checksum`;
      if (await fse.pathExists(filePath)) {
        await fs.unlink(filePath);
      }
      if (await fse.pathExists(checksumPath)) {
        await fs.unlink(checksumPath);
      }
    } catch (error) {
      console.error(`Failed to delete checkpoint for ${workflowId}:`, error);
    }
  }
}