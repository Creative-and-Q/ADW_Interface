-- Add 'new_module' to workflow_type enum
-- This allows creating entirely new modules with GitHub repos via workflows

ALTER TABLE workflows
MODIFY COLUMN workflow_type ENUM('feature','bugfix','refactor','documentation','review','new_module') NOT NULL;
