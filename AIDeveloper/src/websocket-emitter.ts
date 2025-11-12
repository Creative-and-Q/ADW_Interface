/**
 * WebSocket Event Emitter
 * Centralized module for emitting real-time updates via Socket.io
 */

import * as logger from './utils/logger.js';

let ioInstance: any = null;

/**
 * Set the Socket.io instance
 */
export function setSocketIo(io: any) {
  ioInstance = io;
  logger.info('Socket.io instance set for WebSocket emitter');
}

/**
 * Emit workflow updated event
 */
export function emitWorkflowUpdated(workflowId: number, data: any) {
  if (!ioInstance) return;

  ioInstance.to(`workflow-${workflowId}`).emit('workflow:updated', {
    workflowId,
    ...data,
    timestamp: new Date().toISOString(),
  });

  // Also emit to general workflow channel
  ioInstance.emit('workflows:updated', {
    workflowId,
    ...data,
    timestamp: new Date().toISOString(),
  });

  logger.debug('Emitted workflow:updated event', { workflowId });
}

/**
 * Emit agent status update event
 */
export function emitAgentUpdated(workflowId: number, agentData: any) {
  if (!ioInstance) return;

  ioInstance.to(`workflow-${workflowId}`).emit('agent:updated', {
    workflowId,
    ...agentData,
    timestamp: new Date().toISOString(),
  });

  logger.debug('Emitted agent:updated event', {
    workflowId,
    agentType: agentData.type,
  });
}

/**
 * Emit artifact created event
 */
export function emitArtifactCreated(workflowId: number, artifactData: any) {
  if (!ioInstance) return;

  ioInstance.to(`workflow-${workflowId}`).emit('artifact:created', {
    workflowId,
    ...artifactData,
    timestamp: new Date().toISOString(),
  });

  logger.debug('Emitted artifact:created event', {
    workflowId,
    artifactType: artifactData.type,
  });
}

/**
 * Emit workflow completed event
 */
export function emitWorkflowCompleted(workflowId: number) {
  if (!ioInstance) return;

  ioInstance.to(`workflow-${workflowId}`).emit('workflow:completed', {
    workflowId,
    timestamp: new Date().toISOString(),
  });

  ioInstance.emit('workflows:updated', {
    workflowId,
    status: 'completed',
    timestamp: new Date().toISOString(),
  });

  logger.debug('Emitted workflow:completed event', { workflowId });
}

/**
 * Emit workflow failed event
 */
export function emitWorkflowFailed(workflowId: number, error: string) {
  if (!ioInstance) return;

  ioInstance.to(`workflow-${workflowId}`).emit('workflow:failed', {
    workflowId,
    error,
    timestamp: new Date().toISOString(),
  });

  ioInstance.emit('workflows:updated', {
    workflowId,
    status: 'failed',
    error,
    timestamp: new Date().toISOString(),
  });

  logger.debug('Emitted workflow:failed event', { workflowId });
}

/**
 * Emit general stats update
 */
export function emitStatsUpdated() {
  if (!ioInstance) return;

  ioInstance.emit('stats:updated', {
    timestamp: new Date().toISOString(),
  });

  logger.debug('Emitted stats:updated event');
}
