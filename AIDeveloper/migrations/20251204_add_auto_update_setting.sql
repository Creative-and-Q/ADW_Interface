-- Migration: Add auto_update column to module_settings table
-- Date: 2025-12-04
-- Description: Add auto_update setting to allow modules to automatically check for and pull updates from master

ALTER TABLE module_settings ADD COLUMN auto_update BOOLEAN DEFAULT FALSE AFTER auto_load;

-- Add index for efficient queries
CREATE INDEX idx_auto_update ON module_settings (auto_update);
