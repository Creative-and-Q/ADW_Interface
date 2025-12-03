-- Migration: Add completed_at column to workflows table
-- Date: 2025-12-01
-- Description: Adds completed_at timestamp to track when workflows finish executing

-- Add completed_at column for tracking when workflow execution completed
ALTER TABLE workflows ADD COLUMN completed_at TIMESTAMP NULL AFTER started_at;

-- Add index for efficient queries on completed workflows
CREATE INDEX idx_workflows_completed_at ON workflows(completed_at);

