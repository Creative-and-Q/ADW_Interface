-- Add output_mode column to workflows table to control workflow completion behavior
ALTER TABLE workflows
ADD COLUMN output_mode ENUM('pr', 'download', 'both') DEFAULT 'pr' AFTER workflow_type;

-- Create index for faster filtering by output mode
CREATE INDEX idx_workflows_output_mode ON workflows(output_mode);
