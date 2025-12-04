-- Migration: Fix ENUM columns that are causing data truncation errors
-- Date: 2025-12-04
-- Status: APPLIED

-- Fix artifact_type ENUM to include new artifact types
-- Current values causing errors: 'module_scaffold', 'structured_plan'
ALTER TABLE artifacts MODIFY COLUMN artifact_type VARCHAR(50) NOT NULL;

-- Fix workflow status ENUM to include all statuses including 'cancelled' and 'pending_fix'
ALTER TABLE workflows MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'pending';

-- Note: execution_logs table uses 'created_at' column, not 'timestamp'
-- The code fix in execution-logger.ts:417 changes the query to use created_at
