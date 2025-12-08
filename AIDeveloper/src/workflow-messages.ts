/**
 * Workflow Messages Module
 * Handles conversation thread between users and AI agents during workflow execution
 */

import { query } from "./database.js";
import * as logger from "./utils/logger.js";
import { emitToClients } from "./websocket-emitter.js";

export type MessageType = "user" | "agent" | "system";
export type ActionType = "comment" | "instruction" | "pause" | "resume" | "cancel" | "redirect";
export type ActionStatus = "pending" | "acknowledged" | "processed" | "ignored";

// Database result types
interface InsertResult {
  insertId: number;
  affectedRows: number;
}

interface WorkflowMessageRow {
  id: number;
  workflow_id: number;
  agent_execution_id: number | null;
  message_type: MessageType;
  agent_type: string | null;
  content: string;
  metadata: string | Record<string, unknown> | null;
  action_type: ActionType;
  action_status: ActionStatus;
  created_at: string;
  workflow_type?: string;
  target_module?: string;
  parent_workflow_id?: number | null;
}

interface WorkflowRow {
  id: number;
  is_paused?: number | boolean;
  parent_workflow_id?: number | null;
}

export interface WorkflowMessage {
  id: number;
  workflow_id: number;
  agent_execution_id: number | null;
  message_type: MessageType;
  agent_type: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  action_type: ActionType;
  action_status: ActionStatus;
  created_at: string;
}

export interface InterruptSignal {
  type: "pause" | "cancel" | "redirect" | "instruction";
  messageId: number;
  content: string;
  metadata?: Record<string, unknown> | null;
}

export interface AddMessageOptions {
  agentExecutionId?: number;
  agentType?: string;
  actionType?: ActionType;
  actionStatus?: ActionStatus;
  metadata?: Record<string, unknown> | null;
}

/**
 * Add a message to the workflow conversation thread
 */
export async function addMessage(
  workflowId: number,
  messageType: MessageType,
  content: string,
  options: AddMessageOptions = {}
): Promise<number> {
  const {
    agentExecutionId = null,
    agentType = null,
    actionType = "comment",
    actionStatus = messageType === "user" ? "pending" : "processed",
    metadata = null,
  } = options;

  try {
    const result = await query(
      `INSERT INTO workflow_messages
       (workflow_id, agent_execution_id, message_type, agent_type, content, metadata, action_type, action_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        workflowId,
        agentExecutionId,
        messageType,
        agentType,
        content,
        metadata ? JSON.stringify(metadata) : null,
        actionType,
        actionStatus,
      ]
    );

    const messageId = (result as InsertResult).insertId;

    // Emit WebSocket event for real-time updates
    emitMessageCreated(workflowId, {
      id: messageId,
      workflow_id: workflowId,
      agent_execution_id: agentExecutionId,
      message_type: messageType,
      agent_type: agentType,
      content,
      metadata,
      action_type: actionType,
      action_status: actionStatus,
      created_at: new Date().toISOString(),
    });

    logger.debug("Added workflow message", {
      workflowId,
      messageId,
      messageType,
      actionType,
    });

    return messageId;
  } catch (error) {
    logger.error("Failed to add workflow message", error as Error, {
      workflowId,
      messageType,
    });
    throw error;
  }
}

/**
 * Get the root workflow ID for a given workflow (traverses up the parent chain)
 */
export async function getRootWorkflowId(workflowId: number): Promise<number> {
  try {
    const result = await query(
      `WITH RECURSIVE workflow_ancestors AS (
         SELECT id, parent_workflow_id FROM workflows WHERE id = ?
         UNION ALL
         SELECT w.id, w.parent_workflow_id
         FROM workflows w
         INNER JOIN workflow_ancestors wa ON w.id = wa.parent_workflow_id
       )
       SELECT id FROM workflow_ancestors WHERE parent_workflow_id IS NULL`,
      [workflowId]
    );
    return (result as WorkflowRow[])[0]?.id || workflowId;
  } catch (error) {
    logger.error("Failed to get root workflow ID", error as Error, { workflowId });
    return workflowId;
  }
}

/**
 * Get all workflow IDs in a tree (root + all descendants)
 */
export async function getWorkflowTreeIds(rootWorkflowId: number): Promise<number[]> {
  try {
    const result = await query(
      `WITH RECURSIVE workflow_tree AS (
         SELECT id FROM workflows WHERE id = ?
         UNION ALL
         SELECT w.id FROM workflows w
         INNER JOIN workflow_tree wt ON w.parent_workflow_id = wt.id
       )
       SELECT id FROM workflow_tree`,
      [rootWorkflowId]
    );
    return (result as WorkflowRow[]).map((r) => r.id);
  } catch (error) {
    logger.error("Failed to get workflow tree IDs", error as Error, { rootWorkflowId });
    return [rootWorkflowId];
  }
}

/**
 * Get all messages for a workflow and all its sub-workflows (entire tree)
 * Messages are ordered by created_at and include workflow context
 */
export async function getMessages(
  workflowId: number,
  includeTree: boolean = true
): Promise<WorkflowMessage[]> {
  try {
    let messages;

    if (includeTree) {
      // Get all workflow IDs in the tree
      const treeIds = await getWorkflowTreeIds(workflowId);

      if (treeIds.length === 0) {
        return [];
      }

      // Fetch messages from all workflows in the tree
      const placeholders = treeIds.map(() => "?").join(",");
      messages = await query(
        `SELECT wm.*, w.workflow_type, w.target_module, w.parent_workflow_id
         FROM workflow_messages wm
         LEFT JOIN workflows w ON wm.workflow_id = w.id
         WHERE wm.workflow_id IN (${placeholders})
         ORDER BY wm.created_at ASC`,
        treeIds
      );
    } else {
      // Get messages for just this workflow
      messages = await query(
        `SELECT wm.*, w.workflow_type, w.target_module, w.parent_workflow_id
         FROM workflow_messages wm
         LEFT JOIN workflows w ON wm.workflow_id = w.id
         WHERE wm.workflow_id = ?
         ORDER BY wm.created_at ASC`,
        [workflowId]
      );
    }

    return (messages as WorkflowMessageRow[]).map((msg) => ({
      ...msg,
      metadata: msg.metadata
        ? typeof msg.metadata === "string"
          ? JSON.parse(msg.metadata)
          : msg.metadata
        : null,
    }));
  } catch (error) {
    logger.error("Failed to get workflow messages", error as Error, { workflowId });
    throw error;
  }
}

/**
 * Get pending user messages that need to be processed by the orchestrator
 */
export async function getPendingUserMessages(workflowId: number): Promise<WorkflowMessage[]> {
  try {
    const messages = await query(
      `SELECT * FROM workflow_messages
       WHERE workflow_id = ?
         AND message_type = 'user'
         AND action_status = 'pending'
       ORDER BY created_at ASC`,
      [workflowId]
    );

    return (messages as WorkflowMessageRow[]).map((msg) => ({
      ...msg,
      metadata: msg.metadata
        ? typeof msg.metadata === "string"
          ? JSON.parse(msg.metadata)
          : msg.metadata
        : null,
    }));
  } catch (error) {
    logger.error("Failed to get pending user messages", error as Error, { workflowId });
    throw error;
  }
}

/**
 * Mark a message as acknowledged (being processed)
 */
export async function markMessageAcknowledged(messageId: number): Promise<void> {
  try {
    await query(`UPDATE workflow_messages SET action_status = 'acknowledged' WHERE id = ?`, [
      messageId,
    ]);
    logger.debug("Marked message as acknowledged", { messageId });
  } catch (error) {
    logger.error("Failed to mark message as acknowledged", error as Error, { messageId });
    throw error;
  }
}

/**
 * Mark a message as processed (action completed)
 */
export async function markMessageProcessed(messageId: number): Promise<void> {
  try {
    await query(`UPDATE workflow_messages SET action_status = 'processed' WHERE id = ?`, [
      messageId,
    ]);
    logger.debug("Marked message as processed", { messageId });
  } catch (error) {
    logger.error("Failed to mark message as processed", error as Error, { messageId });
    throw error;
  }
}

/**
 * Mark a message as ignored
 */
export async function markMessageIgnored(messageId: number): Promise<void> {
  try {
    await query(`UPDATE workflow_messages SET action_status = 'ignored' WHERE id = ?`, [messageId]);
    logger.debug("Marked message as ignored", { messageId });
  } catch (error) {
    logger.error("Failed to mark message as ignored", error as Error, { messageId });
    throw error;
  }
}

/**
 * Check for interrupt signals from user messages
 * Returns the first pending interrupt-type message if any
 */
export async function checkForInterrupt(workflowId: number): Promise<InterruptSignal | null> {
  try {
    // Check for pending user messages with action types
    const pendingMessages = await getPendingUserMessages(workflowId);

    for (const msg of pendingMessages) {
      if (msg.action_type === "pause") {
        return {
          type: "pause",
          messageId: msg.id,
          content: msg.content,
          metadata: msg.metadata,
        };
      }
      if (msg.action_type === "cancel") {
        return {
          type: "cancel",
          messageId: msg.id,
          content: msg.content,
          metadata: msg.metadata,
        };
      }
      if (msg.action_type === "redirect") {
        return {
          type: "redirect",
          messageId: msg.id,
          content: msg.content,
          metadata: msg.metadata,
        };
      }
      if (msg.action_type === "instruction") {
        return {
          type: "instruction",
          messageId: msg.id,
          content: msg.content,
          metadata: msg.metadata,
        };
      }
    }

    // Also check if workflow is paused
    const workflow = await query(`SELECT is_paused FROM workflows WHERE id = ?`, [workflowId]);

    if ((workflow as WorkflowRow[])[0]?.is_paused) {
      return {
        type: "pause",
        messageId: 0,
        content: "Workflow is paused",
      };
    }

    return null;
  } catch (error) {
    logger.error("Failed to check for interrupt", error as Error, { workflowId });
    return null; // Don't throw - let workflow continue
  }
}

/**
 * Pause a workflow
 */
export async function pauseWorkflow(workflowId: number, reason?: string): Promise<void> {
  try {
    await query(
      `UPDATE workflows
       SET is_paused = TRUE, pause_requested_at = NOW(), pause_reason = ?
       WHERE id = ?`,
      [reason || "User requested pause", workflowId]
    );

    // Add system message
    await addMessage(workflowId, "system", `Workflow paused: ${reason || "User requested pause"}`, {
      actionType: "pause",
      actionStatus: "processed",
    });

    // Emit WebSocket event
    emitWorkflowPaused(workflowId, reason);

    logger.info("Workflow paused", { workflowId, reason });
  } catch (error) {
    logger.error("Failed to pause workflow", error as Error, { workflowId });
    throw error;
  }
}

/**
 * Unpause (resume) a workflow
 */
export async function unpauseWorkflow(workflowId: number): Promise<void> {
  try {
    await query(
      `UPDATE workflows
       SET is_paused = FALSE, pause_requested_at = NULL, pause_reason = NULL
       WHERE id = ?`,
      [workflowId]
    );

    // Add system message
    await addMessage(workflowId, "system", "Workflow resumed", {
      actionType: "resume",
      actionStatus: "processed",
    });

    // Emit WebSocket event
    emitWorkflowUnpaused(workflowId);

    logger.info("Workflow unpaused", { workflowId });
  } catch (error) {
    logger.error("Failed to unpause workflow", error as Error, { workflowId });
    throw error;
  }
}

/**
 * Check if a workflow is paused
 */
export async function isWorkflowPaused(workflowId: number): Promise<boolean> {
  try {
    const result = await query(`SELECT is_paused FROM workflows WHERE id = ?`, [workflowId]);
    return (result as WorkflowRow[])[0]?.is_paused === 1;
  } catch (error) {
    logger.error("Failed to check if workflow is paused", error as Error, { workflowId });
    return false;
  }
}

/**
 * Add an agent comment to the conversation thread
 * Convenience function for agents to post updates
 */
export async function addAgentComment(
  workflowId: number,
  agentType: string,
  content: string,
  agentExecutionId?: number,
  metadata?: Record<string, unknown> | null
): Promise<number> {
  return addMessage(workflowId, "agent", content, {
    agentType,
    agentExecutionId,
    actionType: "comment",
    actionStatus: "processed",
    metadata,
  });
}

/**
 * Add a system message to the conversation thread
 */
export async function addSystemMessage(
  workflowId: number,
  content: string,
  actionType: ActionType = "comment",
  metadata?: Record<string, unknown> | null
): Promise<number> {
  return addMessage(workflowId, "system", content, {
    actionType,
    actionStatus: "processed",
    metadata,
  });
}

// WebSocket event emitters

function emitMessageCreated(workflowId: number, message: WorkflowMessage) {
  emitToClients("message:new", {
    workflowId,
    message,
  });
}

function emitWorkflowPaused(workflowId: number, reason?: string) {
  emitToClients("workflow:paused", {
    workflowId,
    reason,
  });
}

function emitWorkflowUnpaused(workflowId: number) {
  emitToClients("workflow:unpaused", {
    workflowId,
  });
}
