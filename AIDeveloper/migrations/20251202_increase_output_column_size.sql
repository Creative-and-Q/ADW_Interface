-- Migration: Increase agent_executions output column size
-- This fixes "Data too long for column 'output'" errors
-- Change from TEXT (~65KB limit) to LONGTEXT (~4GB limit)

ALTER TABLE agent_executions MODIFY COLUMN output LONGTEXT NULL;

-- Also increase input column size for consistency
ALTER TABLE agent_executions MODIFY COLUMN input LONGTEXT NULL;

-- Increase error and error_message columns for better error capture
ALTER TABLE agent_executions MODIFY COLUMN error LONGTEXT NULL;
ALTER TABLE agent_executions MODIFY COLUMN error_message LONGTEXT NULL;

-- Also increase artifacts content column to handle large artifacts
ALTER TABLE artifacts MODIFY COLUMN content LONGTEXT NULL;

-- Increase execution_logs message column
ALTER TABLE execution_logs MODIFY COLUMN message LONGTEXT NOT NULL;
