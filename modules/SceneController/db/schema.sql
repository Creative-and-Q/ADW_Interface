-- SceneController Database Schema

-- Locations (named places on the map)
CREATE TABLE IF NOT EXISTS locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  location_type ENUM('city', 'town', 'village', 'dungeon', 'wilderness', 'building', 'room', 'region', 'other') DEFAULT 'other',
  x_coord DECIMAL(10, 2) NOT NULL,
  y_coord DECIMAL(10, 2) NOT NULL,
  parent_location_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Spatial index for coordinate queries
  INDEX idx_coordinates (x_coord, y_coord),
  INDEX idx_name (name),
  INDEX idx_location_type (location_type),
  INDEX idx_parent (parent_location_id),

  FOREIGN KEY (parent_location_id) REFERENCES locations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Points of Interest (notable features within locations)
CREATE TABLE IF NOT EXISTS pois (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  poi_type ENUM('shop', 'inn', 'temple', 'landmark', 'npc', 'quest', 'danger', 'resource', 'other') DEFAULT 'other',
  location_id INT NOT NULL,
  x_coord DECIMAL(10, 2) NOT NULL,
  y_coord DECIMAL(10, 2) NOT NULL,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_location (location_id),
  INDEX idx_coordinates (x_coord, y_coord),
  INDEX idx_name (name),
  INDEX idx_poi_type (poi_type),

  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Character and NPC positions
CREATE TABLE IF NOT EXISTS entity_positions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity_id VARCHAR(255) NOT NULL,
  entity_type ENUM('player_character', 'npc', 'monster', 'object') DEFAULT 'player_character',
  entity_name VARCHAR(255) NOT NULL,
  x_coord DECIMAL(10, 2) NOT NULL,
  y_coord DECIMAL(10, 2) NOT NULL,
  location_id INT NULL,
  user_id VARCHAR(255) NULL,
  facing_direction DECIMAL(5, 2) NULL COMMENT 'Angle in degrees (0-360)',
  is_active BOOLEAN DEFAULT TRUE,
  last_movement_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY unique_entity (entity_id, entity_type),
  INDEX idx_coordinates (x_coord, y_coord),
  INDEX idx_location (location_id),
  INDEX idx_entity_type (entity_type),
  INDEX idx_user_id (user_id),
  INDEX idx_active (is_active),

  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Movement history (track entity movements)
CREATE TABLE IF NOT EXISTS movement_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity_position_id INT NOT NULL,
  from_x DECIMAL(10, 2) NOT NULL,
  from_y DECIMAL(10, 2) NOT NULL,
  to_x DECIMAL(10, 2) NOT NULL,
  to_y DECIMAL(10, 2) NOT NULL,
  from_location_id INT NULL,
  to_location_id INT NULL,
  movement_type ENUM('walk', 'run', 'teleport', 'fly', 'swim', 'other') DEFAULT 'walk',
  moved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_entity (entity_position_id),
  INDEX idx_moved_at (moved_at),
  INDEX idx_from_location (from_location_id),
  INDEX idx_to_location (to_location_id),

  FOREIGN KEY (entity_position_id) REFERENCES entity_positions(id) ON DELETE CASCADE,
  FOREIGN KEY (from_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (to_location_id) REFERENCES locations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Location connections (pathways between locations)
CREATE TABLE IF NOT EXISTS location_connections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_location_id INT NOT NULL,
  to_location_id INT NOT NULL,
  connection_type ENUM('road', 'path', 'portal', 'door', 'stairs', 'bridge', 'secret', 'other') DEFAULT 'other',
  description TEXT,
  is_bidirectional BOOLEAN DEFAULT TRUE,
  requires_key BOOLEAN DEFAULT FALSE,
  is_hidden BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_from (from_location_id),
  INDEX idx_to (to_location_id),
  INDEX idx_type (connection_type),

  FOREIGN KEY (from_location_id) REFERENCES locations(id) ON DELETE CASCADE,
  FOREIGN KEY (to_location_id) REFERENCES locations(id) ON DELETE CASCADE,

  UNIQUE KEY unique_connection (from_location_id, to_location_id, connection_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Item entities (tracks position and possession of items from ItemController)
CREATE TABLE IF NOT EXISTS item_entities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL COMMENT 'References ItemController items.id',

  -- Owner/Position tracking
  owner_type ENUM('character', 'npc', 'monster', 'poi', 'location', 'world') DEFAULT 'world',
  owner_id VARCHAR(255) COMMENT 'Entity ID, POI ID, Location ID, or NULL for world',

  -- World coordinates (if dropped in world or at specific location)
  x_coord DECIMAL(10, 2),
  y_coord DECIMAL(10, 2),
  location_id INT NULL COMMENT 'Location where item exists',
  poi_id INT NULL COMMENT 'POI where item exists',

  -- Item state
  is_equipped BOOLEAN DEFAULT FALSE,
  quantity INT DEFAULT 1,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_item (item_id),
  INDEX idx_owner (owner_type, owner_id),
  INDEX idx_coordinates (x_coord, y_coord),
  INDEX idx_location (location_id),
  INDEX idx_poi (poi_id),

  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (poi_id) REFERENCES pois(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Item movement history (tracks item transfers between owners/locations)
CREATE TABLE IF NOT EXISTS item_movement_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_entity_id INT NOT NULL,

  -- From
  from_owner_type ENUM('character', 'npc', 'monster', 'poi', 'location', 'world'),
  from_owner_id VARCHAR(255),
  from_x DECIMAL(10, 2),
  from_y DECIMAL(10, 2),
  from_location_id INT,
  from_poi_id INT,

  -- To
  to_owner_type ENUM('character', 'npc', 'monster', 'poi', 'location', 'world'),
  to_owner_id VARCHAR(255),
  to_x DECIMAL(10, 2),
  to_y DECIMAL(10, 2),
  to_location_id INT,
  to_poi_id INT,

  -- Transaction details
  movement_type ENUM('pickup', 'drop', 'trade', 'steal', 'spawn', 'destroy', 'loot', 'transfer') DEFAULT 'transfer',
  quantity INT DEFAULT 1,
  notes TEXT,
  moved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_item_entity (item_entity_id),
  INDEX idx_moved_at (moved_at),
  INDEX idx_from_owner (from_owner_type, from_owner_id),
  INDEX idx_to_owner (to_owner_type, to_owner_id),

  FOREIGN KEY (item_entity_id) REFERENCES item_entities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
