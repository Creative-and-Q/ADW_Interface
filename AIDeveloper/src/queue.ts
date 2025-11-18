/**
 * Job queue setup using Bull
 * Manages workflow job queue with Redis
 */

import Bull, { Queue, Job } from 'bull';
import { config } from './config.js';
import * as logger from './utils/logger.js';
import { AgentInput } from './types.js';
import { updateWorkflowStatus } from './workflow-state.js';
import { WorkflowStatus } from './types.js';

// Create workflow queue
const workflowQueue: Queue = new Bull('workflow-queue', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
  },
  defaultJobOptions: {
    attempts: config.agents.maxRetryAttempts,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    timeout: config.agents.timeoutMs,
    removeOnComplete: false,
    removeOnFail: false,
  },
});

/**
 * Process workflow jobs
 */
workflowQueue.process(async (job: Job<AgentInput>) => {
  const { workflowId, workflowType } = job.data;

  logger.info(`Processing workflow job ${job.id}`, {
    workflowId,
    workflowType,
  });

  try {
    // Update workflow status to planning
    await updateWorkflowStatus(workflowId, WorkflowStatus.PLANNING);

    // Import orchestrator dynamically to avoid circular dependencies
    const { Orchestrator } = await import('./orchestrator.js');

    // Create orchestrator instance
    const orchestrator = new Orchestrator();

    // Execute workflow
    const result = await orchestrator.execute(job.data);

    logger.info(`Workflow ${workflowId} completed successfully`, {
      workflowId,
      success: result.success,
    });

    return result;
  } catch (error) {
    logger.error(`Workflow ${workflowId} failed`, error as Error, {
      workflowId,
    });

    // Update workflow status to failed
    await updateWorkflowStatus(workflowId, WorkflowStatus.FAILED);

    throw error;
  }
});

/**
 * Job progress handler
 */
workflowQueue.on('progress', (job: Job, progress: number) => {
  logger.debug(`Job ${job.id} progress: ${progress}%`, {
    jobId: job.id,
    progress,
  });
});

/**
 * Job completed handler
 */
workflowQueue.on('completed', (job: Job) => {
  logger.info(`Job ${job.id} completed`, {
    jobId: job.id,
    workflowId: job.data.workflowId,
  });
});

/**
 * Job failed handler
 */
workflowQueue.on('failed', (job: Job, error: Error) => {
  logger.error(`Job ${job.id} failed`, error, {
    jobId: job.id,
    workflowId: job.data?.workflowId,
    attempts: job.attemptsMade,
  });
});

/**
 * Job stalled handler
 */
workflowQueue.on('stalled', (job: Job) => {
  logger.warn(`Job ${job.id} stalled`, {
    jobId: job.id,
    workflowId: job.data?.workflowId,
  });
});

/**
 * Queue error handler
 */
workflowQueue.on('error', (error: Error) => {
  logger.error('Queue error', error);
});

/**
 * Enqueue a workflow for processing
 */
export async function enqueueWorkflow(
  workflowId: number,
  data: AgentInput
): Promise<Job<AgentInput>> {
  try {
    const job = await workflowQueue.add(data, {
      jobId: `workflow-${workflowId}`,
    });

    logger.info(`Workflow ${workflowId} enqueued`, {
      workflowId,
      jobId: job.id,
    });

    return job;
  } catch (error) {
    logger.error(`Failed to enqueue workflow ${workflowId}`, error as Error);
    throw error;
  }
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string): Promise<{
  id: string;
  state: string;
  progress: number;
  data: any;
  result?: any;
  failedReason?: string;
}> {
  try {
    const job = await workflowQueue.getJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const state = await job.getState();
    const progress = job.progress();

    return {
      id: job.id as string,
      state,
      progress: typeof progress === 'number' ? progress : 0,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  } catch (error) {
    logger.error(`Failed to get job status for ${jobId}`, error as Error);
    throw error;
  }
}

/**
 * Get queue stats
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      workflowQueue.getWaitingCount(),
      workflowQueue.getActiveCount(),
      workflowQueue.getCompletedCount(),
      workflowQueue.getFailedCount(),
      workflowQueue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
    };
  } catch (error) {
    logger.error('Failed to get queue stats', error as Error);
    throw error;
  }
}

/**
 * Pause queue
 */
export async function pauseQueue(): Promise<void> {
  try {
    await workflowQueue.pause();
    logger.info('Queue paused');
  } catch (error) {
    logger.error('Failed to pause queue', error as Error);
    throw error;
  }
}

/**
 * Resume queue
 */
export async function resumeQueue(): Promise<void> {
  try {
    await workflowQueue.resume();
    logger.info('Queue resumed');
  } catch (error) {
    logger.error('Failed to resume queue', error as Error);
    throw error;
  }
}

/**
 * Close queue (for graceful shutdown)
 */
export async function closeQueue(): Promise<void> {
  try {
    await workflowQueue.close();
    logger.info('Queue closed');
  } catch (error) {
    logger.error('Failed to close queue', error as Error);
    throw error;
  }
}

export default workflowQueue;
