-- Add pr_url column to workflows table to store GitHub PR URL
ALTER TABLE workflows
ADD COLUMN pr_url VARCHAR(500) DEFAULT NULL AFTER target_module;

-- Create index for faster filtering by PR URL
CREATE INDEX idx_workflows_pr_url ON workflows(pr_url);
