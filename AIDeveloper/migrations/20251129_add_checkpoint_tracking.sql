-- Add checkpoint commit tracking to workflows table
-- This allows workflows to track their last successful commit checkpoint
-- for resuming from failed states

ALTER TABLE workflows
ADD COLUMN checkpoint_commit VARCHAR(40) NULL COMMENT 'Git commit SHA at workflow completion checkpoint',
ADD COLUMN checkpoint_created_at TIMESTAMP NULL COMMENT 'When the checkpoint was created';

-- Add index for efficient checkpoint queries
CREATE INDEX idx_workflows_checkpoint ON workflows(checkpoint_commit);

-- Update completed workflows to use their branch's latest commit as checkpoint
-- This is a one-time migration to backfill existing completed workflows
