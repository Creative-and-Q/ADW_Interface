-- Migration: Add missing workflow columns (branch_name, webhook_id)
-- Date: 2025-12-02
-- Description: Adds branch_name and webhook_id columns that are referenced in code but missing from schema

-- Add branch_name column for tracking git branch associated with workflow
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workflows' AND COLUMN_NAME='branch_name');
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE workflows ADD COLUMN branch_name VARCHAR(255) NULL AFTER target_module', 'SELECT "Column branch_name already exists"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

-- Add webhook_id column for tracking webhook that triggered the workflow
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workflows' AND COLUMN_NAME='webhook_id');
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE workflows ADD COLUMN webhook_id INT NULL AFTER id', 'SELECT "Column webhook_id already exists"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

-- Add index for branch_name (ignore if exists)
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workflows' AND INDEX_NAME='idx_workflows_branch_name');
SET @sqlstmt := IF(@exist = 0, 'CREATE INDEX idx_workflows_branch_name ON workflows(branch_name)', 'SELECT "Index idx_workflows_branch_name already exists"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

-- Add index for webhook_id (ignore if exists)
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workflows' AND INDEX_NAME='idx_workflows_webhook_id');
SET @sqlstmt := IF(@exist = 0, 'CREATE INDEX idx_workflows_webhook_id ON workflows(webhook_id)', 'SELECT "Index idx_workflows_webhook_id already exists"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

