-- Migration: Add conversation_history column to agent_executions
-- Date: 2025-11-30
-- Description: Adds detailed conversation thread tracking for agent interactions

-- Add conversation_history column to store the full Claude API conversation
-- This includes all messages, tool calls, and responses for debugging and transparency
ALTER TABLE agent_executions
  ADD COLUMN conversation_history JSON NULL AFTER output;

-- Create index for querying by conversation presence
CREATE INDEX idx_agent_executions_has_conversation ON agent_executions((conversation_history IS NOT NULL));
