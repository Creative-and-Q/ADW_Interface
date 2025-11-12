-- AIController Database Schema
-- Database for storing chain configurations and execution history

CREATE DATABASE IF NOT EXISTS ai_controller;
USE ai_controller;

-- ============================================================================
-- Chain Configurations Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS chain_configurations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    steps JSON NOT NULL,
    meta_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_user_id (user_id),
    INDEX idx_name (name),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Execution History Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS execution_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    chain_id INT,
    chain_name VARCHAR(255),
    input JSON NOT NULL,
    steps JSON NOT NULL,
    success BOOLEAN NOT NULL,
    error TEXT,
    total_duration_ms INT NOT NULL,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP NOT NULL,

    INDEX idx_user_id (user_id),
    INDEX idx_chain_id (chain_id),
    INDEX idx_started_at (started_at),
    INDEX idx_success (success),

    FOREIGN KEY (chain_id) REFERENCES chain_configurations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Statistics View
-- ============================================================================

CREATE OR REPLACE VIEW execution_statistics AS
SELECT
    COUNT(*) as total_executions,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_executions,
    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_executions,
    AVG(total_duration_ms) as average_duration_ms,
    MIN(started_at) as first_execution,
    MAX(started_at) as last_execution
FROM execution_history;

-- ============================================================================
-- Sample Data (for testing)
-- ============================================================================

-- Sample chain: Get full character context
INSERT INTO chain_configurations (user_id, name, description, steps) VALUES
(
    'admin',
    'Get Full Character Context',
    'Gets character data, position, nearby locations, and inventory',
    JSON_ARRAY(
        JSON_OBJECT(
            'id', 'step_1',
            'name', 'Get Character',
            'module', 'character',
            'endpoint', '/character/:userId/:name',
            'method', 'GET',
            'params', JSON_OBJECT(
                'userId', '{{input.userId}}',
                'name', '{{input.characterName}}'
            )
        ),
        JSON_OBJECT(
            'id', 'step_2',
            'name', 'Get Position',
            'module', 'scene',
            'endpoint', '/position/:entityId',
            'method', 'GET',
            'params', JSON_OBJECT(
                'entityId', 'char_{{input.characterName}}',
                'type', 'player_character'
            )
        ),
        JSON_OBJECT(
            'id', 'step_3',
            'name', 'Get Nearby Locations',
            'module', 'scene',
            'endpoint', '/nearby',
            'method', 'GET',
            'params', JSON_OBJECT(
                'x', '{{step_2.position.x_coord}}',
                'y', '{{step_2.position.y_coord}}',
                'radius', 50,
                'type', 'location'
            )
        )
    )
);

-- Sample chain: Process user message with intent
INSERT INTO chain_configurations (user_id, name, description, steps) VALUES
(
    'admin',
    'Process User Message',
    'Interprets intent and processes character action',
    JSON_ARRAY(
        JSON_OBJECT(
            'id', 'step_1',
            'name', 'Interpret Intent',
            'module', 'intent',
            'endpoint', '/interpret',
            'method', 'POST',
            'body', JSON_OBJECT(
                'message', '{{input.message}}'
            )
        ),
        JSON_OBJECT(
            'id', 'step_2',
            'name', 'Process Character Action',
            'module', 'character',
            'endpoint', '/process',
            'method', 'POST',
            'body', JSON_OBJECT(
                'user_id', '{{input.userId}}',
                'user_character', '{{input.characterName}}',
                'input', '{{input.message}}',
                'meta_data', JSON_OBJECT(
                    'intent', '{{step_1.result.primaryIntent.type}}',
                    'confidence', '{{step_1.result.primaryIntent.confidence}}'
                )
            )
        )
    )
);
