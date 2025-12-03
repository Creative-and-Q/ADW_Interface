-- Add event_type, data, stack_trace and created_at columns to execution_logs table
-- This aligns the database schema with the WorkflowOrchestrator code expectations

-- Add event_type column for workflow event categorization (ignore error if exists)
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='execution_logs' AND COLUMN_NAME='event_type');
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE execution_logs ADD COLUMN event_type VARCHAR(100) NULL AFTER log_level', 'SELECT "Column event_type already exists"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

-- Add data column for additional event data (code uses 'data', schema has 'metadata')
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='execution_logs' AND COLUMN_NAME='data');
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE execution_logs ADD COLUMN data JSON NULL AFTER metadata', 'SELECT "Column data already exists"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

-- Add stack_trace column for error tracking
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='execution_logs' AND COLUMN_NAME='stack_trace');
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE execution_logs ADD COLUMN stack_trace TEXT NULL AFTER data', 'SELECT "Column stack_trace already exists"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

-- Add created_at column (code uses 'created_at', schema has 'timestamp')
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='execution_logs' AND COLUMN_NAME='created_at');
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE execution_logs ADD COLUMN created_at TIMESTAMP NULL AFTER stack_trace', 'SELECT "Column created_at already exists"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

-- Backfill created_at from timestamp for existing records
UPDATE execution_logs SET created_at = timestamp WHERE created_at IS NULL;

