-- Add workflow hierarchy support for parent/child workflows and sub-task queuing
-- This allows complex workflows to be broken down into sequential sub-workflows

-- Add parent workflow tracking
ALTER TABLE workflows
ADD COLUMN parent_workflow_id INT NULL AFTER id,
ADD COLUMN workflow_depth INT DEFAULT 0 AFTER parent_workflow_id,
ADD COLUMN execution_order INT DEFAULT 0 AFTER workflow_depth,
ADD COLUMN plan_json JSON NULL AFTER payload,
ADD COLUMN auto_execute_children BOOLEAN DEFAULT TRUE AFTER plan_json;

-- Add foreign key constraint for parent workflows
ALTER TABLE workflows
ADD CONSTRAINT fk_parent_workflow
FOREIGN KEY (parent_workflow_id) REFERENCES workflows(id) ON DELETE CASCADE;

-- Create index for efficient parent-child queries
CREATE INDEX idx_workflows_parent ON workflows(parent_workflow_id);
CREATE INDEX idx_workflows_depth ON workflows(workflow_depth);
CREATE INDEX idx_workflows_execution_order ON workflows(parent_workflow_id, execution_order);

-- Create sub-workflow queue table for tracking execution progress
CREATE TABLE IF NOT EXISTS sub_workflow_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_workflow_id INT NOT NULL,
    child_workflow_id INT NOT NULL,
    execution_order INT NOT NULL,
    status ENUM('pending', 'in_progress', 'completed', 'failed', 'skipped') DEFAULT 'pending',
    depends_on JSON NULL COMMENT 'Array of workflow IDs this depends on',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    error_message TEXT NULL,
    
    FOREIGN KEY (parent_workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
    FOREIGN KEY (child_workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
    
    INDEX idx_parent_workflow (parent_workflow_id),
    INDEX idx_child_workflow (child_workflow_id),
    INDEX idx_execution_order (parent_workflow_id, execution_order),
    INDEX idx_status (status),
    UNIQUE KEY unique_child_workflow (child_workflow_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add comments for documentation
ALTER TABLE workflows 
MODIFY COLUMN parent_workflow_id INT NULL COMMENT 'Reference to parent workflow if this is a sub-workflow',
MODIFY COLUMN workflow_depth INT DEFAULT 0 COMMENT 'Depth in workflow hierarchy (0 = root)',
MODIFY COLUMN execution_order INT DEFAULT 0 COMMENT 'Order of execution within same parent',
MODIFY COLUMN plan_json JSON NULL COMMENT 'Structured plan for generating sub-workflows',
MODIFY COLUMN auto_execute_children BOOLEAN DEFAULT TRUE COMMENT 'Auto-execute child workflows when created';


