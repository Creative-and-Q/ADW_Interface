-- Migration: Add security_lint and security_linting enum values
-- Date: 2025-11-11
-- Description: Adds security_lint to agent_type and artifact_type enums,
--              and security_linting to workflow status enum to support
--              the SecurityLintAgent in the workflow pipeline.

-- Add security_linting to workflows.status enum
ALTER TABLE workflows
MODIFY COLUMN status ENUM(
  'pending',
  'planning',
  'coding',
  'security_linting',
  'testing',
  'reviewing',
  'documenting',
  'completed',
  'failed'
) NOT NULL DEFAULT 'pending';

-- Add security_lint to agent_executions.agent_type enum
ALTER TABLE agent_executions
MODIFY COLUMN agent_type ENUM(
  'orchestrator',
  'plan',
  'code',
  'security_lint',
  'test',
  'review',
  'document'
) NOT NULL;

-- Add security_lint to artifacts.artifact_type enum
ALTER TABLE artifacts
MODIFY COLUMN artifact_type ENUM(
  'plan',
  'code',
  'security_lint',
  'test',
  'review_report',
  'documentation'
) NOT NULL;
