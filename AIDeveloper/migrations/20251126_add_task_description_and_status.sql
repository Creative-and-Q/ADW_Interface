-- Migration: Add task_description, started_at columns and pending_fix/completed_with_warnings status to workflows
-- Date: 2025-11-26
-- Description: Enables sub-workflow creation for build fix retries

-- Add task_description column for sub-workflows
ALTER TABLE workflows ADD COLUMN task_description TEXT NULL AFTER target_module;

-- Add started_at column for tracking when workflow execution began
ALTER TABLE workflows ADD COLUMN started_at TIMESTAMP NULL AFTER status;

-- Extend status enum to include pending_fix and completed_with_warnings
ALTER TABLE workflows MODIFY COLUMN status ENUM(
  'pending',
  'pending_fix',
  'running',
  'planning',
  'coding',
  'security_linting',
  'testing',
  'reviewing',
  'documenting',
  'completed',
  'completed_with_warnings',
  'failed'
) NOT NULL DEFAULT 'pending';

-- Index for task_description searches (optional, uncomment if needed)
-- ALTER TABLE workflows ADD INDEX idx_task_description (task_description(100));
