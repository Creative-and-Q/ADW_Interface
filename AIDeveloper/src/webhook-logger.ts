/**
 * Webhook logging utility
 * Logs all incoming webhooks to database for audit trail
 */

import { insert, update, query } from './database.js';
import { WebhookLog } from './types.js';
import * as logger from './utils/logger.js';

/**
 * Log webhook to database
 */
export async function logWebhook(
  source: string,
  eventType: string,
  payload: any
): Promise<number> {
  try {
    const webhookLogId = await insert('webhook_logs', {
      source,
      event_type: eventType,
      payload: JSON.stringify(payload),
      response_status: 200,
    });

    logger.debug(`Webhook logged: ${webhookLogId}`, {
      source,
      eventType,
    });

    return webhookLogId;
  } catch (error) {
    logger.error('Failed to log webhook', error as Error);
    throw error;
  }
}

/**
 * Link webhook log to workflow
 */
export async function linkWebhookToWorkflow(
  webhookLogId: number,
  workflowId: number
): Promise<void> {
  try {
    await update(
      'webhook_logs',
      { workflow_id: workflowId },
      'id = ?',
      [webhookLogId]
    );

    logger.debug(`Linked webhook ${webhookLogId} to workflow ${workflowId}`);
  } catch (error) {
    logger.error('Failed to link webhook to workflow', error as Error);
    throw error;
  }
}

/**
 * Get webhook logs with optional filters
 */
export async function getWebhookLogs(filters?: {
  source?: string;
  workflowId?: number;
  limit?: number;
  offset?: number;
}): Promise<WebhookLog[]> {
  try {
    let sql = 'SELECT * FROM webhook_logs WHERE 1=1';
    const params: any[] = [];

    if (filters?.source) {
      sql += ' AND source = ?';
      params.push(filters.source);
    }

    if (filters?.workflowId) {
      sql += ' AND workflow_id = ?';
      params.push(filters.workflowId);
    }

    sql += ' ORDER BY received_at DESC';

    if (filters?.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);

      if (filters?.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const results = await query<any[]>(sql, params);

    return results.map(row => ({
      id: row.id,
      source: row.source,
      eventType: row.event_type,
      payload: JSON.parse(row.payload),
      workflowId: row.workflow_id,
      responseStatus: row.response_status,
      receivedAt: row.received_at,
    }));
  } catch (error) {
    logger.error('Failed to get webhook logs', error as Error);
    throw error;
  }
}

/**
 * Get webhook log by ID
 */
export async function getWebhookLogById(id: number): Promise<WebhookLog | null> {
  try {
    const results = await query<any[]>(
      'SELECT * FROM webhook_logs WHERE id = ?',
      [id]
    );

    if (results.length === 0) {
      return null;
    }

    const row = results[0];
    return {
      id: row.id,
      source: row.source,
      eventType: row.event_type,
      payload: JSON.parse(row.payload),
      workflowId: row.workflow_id,
      responseStatus: row.response_status,
      receivedAt: row.received_at,
    };
  } catch (error) {
    logger.error('Failed to get webhook log', error as Error);
    throw error;
  }
}
