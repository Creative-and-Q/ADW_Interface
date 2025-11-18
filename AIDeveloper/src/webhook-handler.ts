/**
 * Webhook handler
 * Processes incoming webhooks and creates workflow jobs
 */

import { WorkflowType, WebhookPayload } from './types.js';
import * as logger from './utils/logger.js';
import { logWebhook } from './webhook-logger.js';
import { createWorkflow } from './workflow-state.js';
import { enqueueWorkflow } from './queue.js';

/**
 * Parse GitHub event to determine workflow type and extract data
 */
function parseGitHubEvent(payload: any): {
  workflowType: WorkflowType;
  taskDescription: string;
  webhookPayload: WebhookPayload;
} {
  const eventType = payload._eventType;

  // Handle issues event
  if (eventType === 'issues') {
    const issue = payload.issue;
    const labels = issue.labels?.map((l: any) => l.name.toLowerCase()) || [];

    let workflowType = WorkflowType.FEATURE;
    if (labels.includes('bug')) {
      workflowType = WorkflowType.BUGFIX;
    } else if (labels.includes('refactor')) {
      workflowType = WorkflowType.REFACTOR;
    } else if (labels.includes('documentation')) {
      workflowType = WorkflowType.DOCUMENTATION;
    }

    return {
      workflowType,
      taskDescription: `${issue.title}\n\n${issue.body || ''}`,
      webhookPayload: {
        source: 'github',
        eventType,
        repository: {
          name: payload.repository.name,
          fullName: payload.repository.full_name,
          url: payload.repository.html_url,
          defaultBranch: payload.repository.default_branch,
        },
        issue: {
          number: issue.number,
          title: issue.title,
          body: issue.body,
        },
      },
    };
  }

  // Handle pull request event
  if (eventType === 'pull_request') {
    const pr = payload.pull_request;

    return {
      workflowType: WorkflowType.REVIEW,
      taskDescription: `Review PR: ${pr.title}\n\n${pr.body || ''}`,
      webhookPayload: {
        source: 'github',
        eventType,
        repository: {
          name: payload.repository.name,
          fullName: payload.repository.full_name,
          url: payload.repository.html_url,
          defaultBranch: payload.repository.default_branch,
        },
        pullRequest: {
          number: pr.number,
          title: pr.title,
          description: pr.body,
          branch: pr.head.ref,
        },
      },
    };
  }

  // Handle push event (default to feature)
  if (eventType === 'push') {
    const commits = payload.commits || [];
    const commitMessages = commits.map((c: any) => c.message).join('\n');

    return {
      workflowType: WorkflowType.FEATURE,
      taskDescription: `Push to ${payload.ref}\n\nCommits:\n${commitMessages}`,
      webhookPayload: {
        source: 'github',
        eventType,
        repository: {
          name: payload.repository.name,
          fullName: payload.repository.full_name,
          url: payload.repository.html_url,
          defaultBranch: payload.repository.default_branch,
        },
        commit: {
          sha: payload.after,
          message: commitMessages,
          author: payload.pusher?.name || 'unknown',
        },
      },
    };
  }

  throw new Error(`Unsupported GitHub event type: ${eventType}`);
}

/**
 * Parse GitLab event to determine workflow type and extract data
 */
function parseGitLabEvent(payload: any): {
  workflowType: WorkflowType;
  taskDescription: string;
  webhookPayload: WebhookPayload;
} {
  const eventType = payload._eventType;

  // Handle issue event
  if (eventType === 'Issue Hook') {
    const issue = payload.object_attributes;
    const labels = payload.labels?.map((l: any) => l.title.toLowerCase()) || [];

    let workflowType = WorkflowType.FEATURE;
    if (labels.includes('bug')) {
      workflowType = WorkflowType.BUGFIX;
    } else if (labels.includes('refactor')) {
      workflowType = WorkflowType.REFACTOR;
    } else if (labels.includes('documentation')) {
      workflowType = WorkflowType.DOCUMENTATION;
    }

    return {
      workflowType,
      taskDescription: `${issue.title}\n\n${issue.description || ''}`,
      webhookPayload: {
        source: 'gitlab',
        eventType,
        repository: {
          name: payload.project.name,
          fullName: payload.project.path_with_namespace,
          url: payload.project.web_url,
          defaultBranch: payload.project.default_branch,
        },
        issue: {
          number: issue.iid,
          title: issue.title,
          body: issue.description,
        },
      },
    };
  }

  // Handle merge request event
  if (eventType === 'Merge Request Hook') {
    const mr = payload.object_attributes;

    return {
      workflowType: WorkflowType.REVIEW,
      taskDescription: `Review MR: ${mr.title}\n\n${mr.description || ''}`,
      webhookPayload: {
        source: 'gitlab',
        eventType,
        repository: {
          name: payload.project.name,
          fullName: payload.project.path_with_namespace,
          url: payload.project.web_url,
          defaultBranch: payload.project.default_branch,
        },
        pullRequest: {
          number: mr.iid,
          title: mr.title,
          description: mr.description,
          branch: mr.source_branch,
        },
      },
    };
  }

  // Handle push event
  if (eventType === 'Push Hook') {
    const commits = payload.commits || [];
    const commitMessages = commits.map((c: any) => c.message).join('\n');

    return {
      workflowType: WorkflowType.FEATURE,
      taskDescription: `Push to ${payload.ref}\n\nCommits:\n${commitMessages}`,
      webhookPayload: {
        source: 'gitlab',
        eventType,
        repository: {
          name: payload.project.name,
          fullName: payload.project.path_with_namespace,
          url: payload.project.web_url,
          defaultBranch: payload.project.default_branch,
        },
        commit: {
          sha: payload.after,
          message: commitMessages,
          author: payload.user_name || 'unknown',
        },
      },
    };
  }

  throw new Error(`Unsupported GitLab event type: ${eventType}`);
}

/**
 * Parse custom/manual webhook
 */
function parseCustomEvent(payload: any): {
  workflowType: WorkflowType;
  targetModule: string;
  taskDescription: string;
  webhookPayload: WebhookPayload;
} {
  const source = payload._source || 'custom';

  return {
    workflowType: payload.workflowType as WorkflowType || WorkflowType.FEATURE,
    targetModule: payload.targetModule || 'AIDeveloper',
    taskDescription: payload.taskDescription || 'Manual workflow execution',
    webhookPayload: {
      source: source as 'custom' | 'manual',
      repository: payload.repository,
      targetModule: payload.targetModule || 'AIDeveloper',
      customData: payload,
    },
  };
}

/**
 * Main webhook handler
 */
export async function handleWebhook(
  payload: any,
  source: 'github' | 'gitlab' | 'custom' | 'manual'
): Promise<{ success: boolean; workflowId: number; message: string }> {
  try {
    logger.info(`Processing ${source} webhook`);

    // Parse webhook based on source
    let workflowType: WorkflowType;
    let targetModule: string = 'AIDeveloper';
    let taskDescription: string;
    let webhookPayload: WebhookPayload;

    if (source === 'github') {
      const parsed = parseGitHubEvent(payload);
      workflowType = parsed.workflowType;
      taskDescription = parsed.taskDescription;
      webhookPayload = parsed.webhookPayload;
    } else if (source === 'gitlab') {
      const parsed = parseGitLabEvent(payload);
      workflowType = parsed.workflowType;
      taskDescription = parsed.taskDescription;
      webhookPayload = parsed.webhookPayload;
    } else {
      const parsed = parseCustomEvent(payload);
      workflowType = parsed.workflowType;
      targetModule = parsed.targetModule;
      taskDescription = parsed.taskDescription;
      webhookPayload = parsed.webhookPayload;
    }

    logger.info(`Workflow type determined: ${workflowType}, target module: ${targetModule}`);

    // Log webhook to database
    const webhookLogId = await logWebhook(
      source,
      payload._eventType || workflowType,
      payload
    );

    // Create workflow record
    const workflowId = await createWorkflow(workflowType, webhookPayload, targetModule);

    logger.info(`Workflow created: ${workflowId}`);

    // Link webhook log to workflow
    const { linkWebhookToWorkflow } = await import('./webhook-logger.js');
    await linkWebhookToWorkflow(webhookLogId, workflowId);

    // Enqueue workflow for processing
    await enqueueWorkflow(workflowId, {
      workflowId,
      workflowType,
      targetModule,
      taskDescription,
      webhookPayload,
      workingDir: '', // Will be set by orchestrator when workflow is executed
    });

    logger.info(`Workflow ${workflowId} enqueued for processing`);

    return {
      success: true,
      workflowId,
      message: `Workflow ${workflowId} created and queued for processing`,
    };
  } catch (error) {
    logger.error('Webhook handling failed', error as Error);
    throw error;
  }
}
