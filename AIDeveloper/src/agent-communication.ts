/**
 * Inter-Agent Communication System
 * Provides message protocol and communication between agents
 */

import { EventEmitter } from 'events';
import * as logger from './utils/logger.js';

/**
 * Message types
 */
export enum MessageType {
  REQUEST = 'request',
  RESPONSE = 'response',
  STATUS = 'status',
  ERROR = 'error',
  BROADCAST = 'broadcast',
}

/**
 * Message structure
 */
export interface AgentMessage {
  id: string;
  type: MessageType;
  from: string;
  to?: string;
  payload: any;
  timestamp: Date;
  correlationId?: string;
}

/**
 * Agent Communication Bus
 * Central message hub for inter-agent communication
 */
export class AgentCommunicationBus extends EventEmitter {
  private messageQueue: Map<string, AgentMessage[]>;
  private ackTimeouts: Map<string, NodeJS.Timeout>;
  private messageCounter: number;

  constructor() {
    super();
    this.messageQueue = new Map();
    this.ackTimeouts = new Map();
    this.messageCounter = 0;
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    this.messageCounter++;
    return `msg-${Date.now()}-${this.messageCounter}`;
  }

  /**
   * Send message to specific agent
   */
  async sendToAgent(
    to: string,
    from: string,
    type: MessageType,
    payload: any,
    correlationId?: string
  ): Promise<string> {
    const message: AgentMessage = {
      id: this.generateMessageId(),
      type,
      from,
      to,
      payload,
      timestamp: new Date(),
      correlationId,
    };

    logger.debug('Sending message to agent', {
      messageId: message.id,
      from,
      to,
      type,
    });

    // Add to queue for recipient
    if (!this.messageQueue.has(to)) {
      this.messageQueue.set(to, []);
    }
    this.messageQueue.get(to)!.push(message);

    // Emit event for real-time delivery
    this.emit(`message:${to}`, message);

    return message.id;
  }

  /**
   * Receive message for agent
   * Returns next message in queue or waits for one
   */
  async receiveMessage(
    agentId: string,
    timeout: number = 5000
  ): Promise<AgentMessage | null> {
    // Check if message already in queue
    const queue = this.messageQueue.get(agentId);
    if (queue && queue.length > 0) {
      const message = queue.shift()!;
      logger.debug('Message retrieved from queue', {
        messageId: message.id,
        agentId,
      });
      return message;
    }

    // Wait for new message with timeout
    return new Promise<AgentMessage | null>((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.removeListener(`message:${agentId}`, listener);
          resolve(null);
        }
      }, timeout);

      const listener = (message: AgentMessage) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          this.removeListener(`message:${agentId}`, listener);
          resolve(message);
        }
      };

      this.once(`message:${agentId}`, listener);
    });
  }

  /**
   * Send request and wait for response
   */
  async sendRequest<T = any>(
    to: string,
    from: string,
    payload: any,
    timeout: number = 30000
  ): Promise<T> {
    const correlationId = this.generateMessageId();

    await this.sendToAgent(to, from, MessageType.REQUEST, payload, correlationId);

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeListener(`response:${correlationId}`, listener);
        reject(new Error(`Request timeout: ${to}`));
      }, timeout);

      const listener = (message: AgentMessage) => {
        clearTimeout(timer);
        this.removeListener(`response:${correlationId}`, listener);

        if (message.type === MessageType.ERROR) {
          reject(new Error(message.payload.message || 'Agent error'));
        } else {
          resolve(message.payload);
        }
      };

      this.once(`response:${correlationId}`, listener);
    });
  }

  /**
   * Send response to a request
   */
  async sendResponse(
    to: string,
    from: string,
    payload: any,
    correlationId: string
  ): Promise<void> {
    await this.sendToAgent(to, from, MessageType.RESPONSE, payload, correlationId);
    this.emit(`response:${correlationId}`, {
      id: this.generateMessageId(),
      type: MessageType.RESPONSE,
      from,
      to,
      payload,
      timestamp: new Date(),
      correlationId,
    });
  }

  /**
   * Send error response
   */
  async sendError(
    to: string,
    from: string,
    error: Error,
    correlationId?: string
  ): Promise<void> {
    const payload = {
      message: error.message,
      stack: error.stack,
    };

    await this.sendToAgent(to, from, MessageType.ERROR, payload, correlationId);

    if (correlationId) {
      this.emit(`response:${correlationId}`, {
        id: this.generateMessageId(),
        type: MessageType.ERROR,
        from,
        to,
        payload,
        timestamp: new Date(),
        correlationId,
      });
    }
  }

  /**
   * Broadcast message to all agents
   */
  async broadcast(from: string, payload: any): Promise<void> {
    logger.debug('Broadcasting message', { from });

    const message: AgentMessage = {
      id: this.generateMessageId(),
      type: MessageType.BROADCAST,
      from,
      payload,
      timestamp: new Date(),
    };

    // Emit to all registered agents
    this.emit('broadcast', message);
  }

  /**
   * Get pending message count for agent
   */
  getPendingCount(agentId: string): number {
    const queue = this.messageQueue.get(agentId);
    return queue ? queue.length : 0;
  }

  /**
   * Clear all messages for agent
   */
  clearMessages(agentId: string): void {
    this.messageQueue.delete(agentId);
    logger.debug('Cleared message queue', { agentId });
  }

  /**
   * Cleanup
   */
  destroy(): void {
    // Clear all timeouts
    for (const timeout of this.ackTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.ackTimeouts.clear();

    // Clear all queues
    this.messageQueue.clear();

    // Remove all listeners
    this.removeAllListeners();

    logger.debug('Agent communication bus destroyed');
  }
}

/**
 * Global communication bus instance
 */
export const communicationBus = new AgentCommunicationBus();
