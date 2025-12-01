-- Initial database schema for AIDeveloper
-- This creates the base tables that subsequent migrations will modify

-- Workflows table
CREATE TABLE IF NOT EXISTS workflows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workflow_type ENUM('pr_review', 'fix', 'feature', 'new_module') NOT NULL,
  target_module VARCHAR(255) NULL,
  status ENUM('pending', 'planning', 'coding', 'testing', 'reviewing', 'documenting', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  payload JSON NULL,
  result TEXT NULL,
  output_mode ENUM('pr', 'commit') DEFAULT 'pr',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workflows_status (status),
  INDEX idx_workflows_created_at (created_at),
  INDEX idx_workflows_type (workflow_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Agent Executions table
CREATE TABLE IF NOT EXISTS agent_executions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workflow_id INT NOT NULL,
  agent_type ENUM('orchestrator', 'plan', 'code', 'test', 'review', 'document') NOT NULL,
  status ENUM('queued', 'running', 'completed', 'failed') NOT NULL DEFAULT 'queued',
  input TEXT NULL,
  output TEXT NULL,
  error TEXT NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  INDEX idx_agent_executions_workflow (workflow_id),
  INDEX idx_agent_executions_status (status),
  INDEX idx_agent_executions_agent_type (agent_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Artifacts table
CREATE TABLE IF NOT EXISTS artifacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workflow_id INT NOT NULL,
  agent_execution_id INT NULL,
  artifact_type ENUM('plan', 'code', 'test', 'review_report', 'documentation') NOT NULL,
  file_path VARCHAR(500) NULL,
  content TEXT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_execution_id) REFERENCES agent_executions(id) ON DELETE SET NULL,
  INDEX idx_artifacts_workflow (workflow_id),
  INDEX idx_artifacts_type (artifact_type),
  INDEX idx_artifacts_agent_execution (agent_execution_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Execution Logs table
CREATE TABLE IF NOT EXISTS execution_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workflow_id INT NOT NULL,
  agent_execution_id INT NULL,
  log_level ENUM('debug', 'info', 'warn', 'error') NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  timestamp TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  metadata JSON NULL,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_execution_id) REFERENCES agent_executions(id) ON DELETE CASCADE,
  INDEX idx_execution_logs_workflow (workflow_id),
  INDEX idx_execution_logs_agent_execution (agent_execution_id),
  INDEX idx_execution_logs_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Environment Variables table
CREATE TABLE IF NOT EXISTS environment_variables (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key_name VARCHAR(255) NOT NULL UNIQUE,
  key_value TEXT NOT NULL,
  module_name VARCHAR(255) NULL,
  description TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_env_vars_module (module_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

