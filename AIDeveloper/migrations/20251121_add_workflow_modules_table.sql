-- Create workflow_modules junction table for multi-module workflow support
-- This allows workflows to target multiple modules simultaneously

CREATE TABLE IF NOT EXISTS workflow_modules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workflow_id INT NOT NULL,
  module_name VARCHAR(255) NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  UNIQUE KEY unique_workflow_module (workflow_id, module_name),
  INDEX idx_workflow_modules_workflow (workflow_id),
  INDEX idx_workflow_modules_module (module_name)
);

-- Migrate existing workflows with target_module to the new junction table
INSERT INTO workflow_modules (workflow_id, module_name, is_primary, created_at)
SELECT id, target_module, TRUE, created_at
FROM workflows
WHERE target_module IS NOT NULL AND target_module != '';

-- Note: We keep target_module column for backwards compatibility
-- It will be used as the "primary" module for PR creation decisions
