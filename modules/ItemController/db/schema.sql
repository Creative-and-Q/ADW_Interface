-- ItemController Database Schema
-- Purpose: Catalog of all items in the world (each row = one physical item)

-- Items: Each row represents a single physical item in the world
-- If there are 10 "Great Swords" in the world, there are 10 rows
-- Supports hierarchical containment (items in items, items in locations)
CREATE TABLE IF NOT EXISTS items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,

  -- Flexible JSON metadata column for all item details
  -- Can contain: description, stats, abilities, item_type, rarity, weight,
  -- damage, armor_class, magical_properties, enchantments, condition, etc.
  -- For containers, should include: is_container, container_capacity (weight limit), container_volume
  meta_data JSON,

  -- Container/Location hierarchy
  -- An item can be contained in ONE of the following:
  -- 1. Another item (contained_in_item_id) - e.g., sword in a bag
  -- 2. A location entity via SceneController (stored in meta_data as location_id/poi_id)
  -- 3. A character via CharacterController (stored in meta_data as owner_character_id)
  -- 4. Free-floating in the world at coordinates (stored in meta_data as x, y)
  contained_in_item_id INT NULL,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Indexes
  INDEX idx_name (name),
  FULLTEXT idx_name_fulltext (name),
  INDEX idx_contained_in (contained_in_item_id),

  -- Foreign key constraint to ensure container exists
  CONSTRAINT fk_container
    FOREIGN KEY (contained_in_item_id)
    REFERENCES items(id)
    ON DELETE CASCADE  -- If container is deleted, contained items are also deleted
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
