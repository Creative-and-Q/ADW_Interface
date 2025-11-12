-- Migration: Add container support to items table
-- Date: 2025-01-29
-- Description: Adds contained_in_item_id foreign key to support item containment hierarchy

-- Add the contained_in_item_id column
ALTER TABLE items
ADD COLUMN contained_in_item_id INT NULL AFTER meta_data;

-- Add index for performance
ALTER TABLE items
ADD INDEX idx_contained_in (contained_in_item_id);

-- Add foreign key constraint
ALTER TABLE items
ADD CONSTRAINT fk_container
  FOREIGN KEY (contained_in_item_id)
  REFERENCES items(id)
  ON DELETE CASCADE;
