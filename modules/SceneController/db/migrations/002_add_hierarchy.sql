-- SceneController Hierarchy Migration
-- Adds hierarchy references to existing tables
-- Note: Continents and Regions tables already exist in the schema
-- This migration is idempotent - it will skip columns that already exist

-- Add region_id to locations table
-- This links locations (cities, towns, etc.) to their regions
ALTER TABLE locations
  ADD COLUMN region_id INT AFTER parent_location_id;

ALTER TABLE locations
  ADD INDEX idx_location_region (region_id);

-- Add continent_id to locations table
-- This allows direct continent reference for top-level locations
ALTER TABLE locations
  ADD COLUMN continent_id INT AFTER region_id;

ALTER TABLE locations
  ADD INDEX idx_location_continent (continent_id);

-- Add region_id to POIs table
-- POIs can belong to a region directly or through their location
ALTER TABLE pois
  ADD COLUMN region_id INT AFTER location_id;

ALTER TABLE pois
  ADD INDEX idx_poi_region (region_id);

-- Add hierarchy references to entity_positions
ALTER TABLE entity_positions
  ADD COLUMN region_id INT AFTER location_id;

ALTER TABLE entity_positions
  ADD COLUMN continent_id INT AFTER region_id;

ALTER TABLE entity_positions
  ADD INDEX idx_entity_region (region_id);

ALTER TABLE entity_positions
  ADD INDEX idx_entity_continent (continent_id);

-- Add hierarchy tracking to movement_history
ALTER TABLE movement_history
  ADD COLUMN from_region_id INT AFTER from_location_id;

ALTER TABLE movement_history
  ADD COLUMN from_continent_id INT AFTER from_region_id;

ALTER TABLE movement_history
  ADD COLUMN to_region_id INT AFTER to_location_id;

ALTER TABLE movement_history
  ADD COLUMN to_continent_id INT AFTER to_region_id;
