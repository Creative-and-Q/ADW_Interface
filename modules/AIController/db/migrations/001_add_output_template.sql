-- Migration: Add output_template and output columns
-- Date: 2025-10-29

USE ai_controller;

-- Add output_template to chain_configurations
ALTER TABLE chain_configurations
ADD COLUMN output_template JSON AFTER steps;

-- Add output to execution_history
ALTER TABLE execution_history
ADD COLUMN output JSON AFTER steps;
