-- Migration: Add 'scaffold' to agent_executions.agent_type enum
-- Description: Adds scaffold agent type to support ModuleScaffoldAgent in new_module workflows

-- Add scaffold to agent_executions.agent_type enum
ALTER TABLE agent_executions
MODIFY COLUMN agent_type ENUM(
  'orchestrator',
  'plan',
  'code',
  'security_lint',
  'test',
  'review',
  'document',
  'scaffold'
) NOT NULL;


