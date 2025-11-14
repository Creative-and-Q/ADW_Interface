-- Migration: Add module_settings table for storing module configuration
-- Date: 2025-11-14
-- Description: Create table to store module settings like auto_load

CREATE TABLE IF NOT EXISTS module_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module_name VARCHAR(255) NOT NULL UNIQUE,
  auto_load BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_module_name (module_name),
  INDEX idx_auto_load (auto_load)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
