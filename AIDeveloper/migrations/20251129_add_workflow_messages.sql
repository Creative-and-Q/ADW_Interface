-- Migration: Add workflow_messages table for conversation thread system
-- Date: 2025-11-29
-- Description: Enables real-time conversation between users and AI agents during workflow execution

-- Create workflow_messages table
CREATE TABLE IF NOT EXISTS workflow_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workflow_id INT NOT NULL,
  agent_execution_id INT NULL,
  message_type ENUM('user', 'agent', 'system') NOT NULL,
  agent_type VARCHAR(50) NULL,
  content TEXT NOT NULL,
  metadata JSON NULL,
  action_type ENUM('comment', 'instruction', 'pause', 'resume', 'cancel', 'redirect') DEFAULT 'comment',
  action_status ENUM('pending', 'acknowledged', 'processed', 'ignored') DEFAULT 'pending',
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),

  INDEX idx_workflow_messages_workflow_id (workflow_id),
  INDEX idx_workflow_messages_action_status (action_status),
  INDEX idx_workflow_messages_created_at (created_at),
  INDEX idx_workflow_messages_type_status (message_type, action_status),
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_execution_id) REFERENCES agent_executions(id) ON DELETE SET NULL
);

-- Add pause-related columns to workflows table
ALTER TABLE workflows
  ADD COLUMN is_paused BOOLEAN DEFAULT FALSE AFTER status,
  ADD COLUMN pause_requested_at TIMESTAMP NULL AFTER is_paused,
  ADD COLUMN pause_reason TEXT NULL AFTER pause_requested_at;

-- Add index for finding paused workflows
CREATE INDEX idx_workflows_is_paused ON workflows(is_paused);
