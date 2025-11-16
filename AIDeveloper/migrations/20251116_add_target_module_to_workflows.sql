-- Add target_module column to workflows table to restrict agent edits to specific modules
ALTER TABLE workflows
ADD COLUMN target_module VARCHAR(255) DEFAULT 'AIDeveloper' AFTER workflow_type;

-- Create index for faster filtering by target module
CREATE INDEX idx_workflows_target_module ON workflows(target_module);
