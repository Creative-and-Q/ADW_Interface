/**
 * MySQL Storage Layer for StoryTeller
 *
 * Handles all database operations for narrative interactions, templates, and caching.
 */

import mysql from 'mysql2/promise';
import crypto from 'crypto';
import {
  NarrativeInteraction,
  StoryTemplate,
  ResponseCache,
  ResponseType,
  ResponseContent,
} from './types.js';

export class MySQLStorage {
  private pool: mysql.Pool;

  constructor() {
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'storyteller',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    };

    this.pool = mysql.createPool(dbConfig);
    console.log(`📊 MySQL Storage initialized: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  }

  // ==========================================================================
  // Narrative Interactions
  // ==========================================================================

  /**
   * Save a narrative interaction to database
   */
  public async saveInteraction(interaction: NarrativeInteraction): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO narrative_interactions
      (user_id, character_id, scene_id, intent_type, player_input, game_events,
       character_context, scene_context, npc_context, ai_model, ai_prompt,
       ai_tokens_used, response_type, response_content, processing_time_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        interaction.user_id,
        interaction.character_id || null,
        interaction.scene_id || null,
        interaction.intent_type || null,
        interaction.player_input,
        JSON.stringify(interaction.game_events || null),
        JSON.stringify(interaction.character_context || null),
        JSON.stringify(interaction.scene_context || null),
        JSON.stringify(interaction.npc_context || null),
        interaction.ai_model || null,
        interaction.ai_prompt || null,
        interaction.ai_tokens_used || null,
        interaction.response_type,
        JSON.stringify(interaction.response_content),
        interaction.processing_time_ms || null,
      ]
    );

    return (result as mysql.ResultSetHeader).insertId;
  }

  /**
   * Get interaction by ID
   */
  public async getInteraction(id: number): Promise<NarrativeInteraction | null> {
    const [rows] = await this.pool.execute(
      'SELECT * FROM narrative_interactions WHERE id = ?',
      [id]
    );

    const records = rows as any[];
    if (records.length === 0) return null;

    return this.mapRowToInteraction(records[0]);
  }

  /**
   * Get interaction history for a user
   */
  public async getInteractionHistory(
    user_id: string,
    limit: number = 50,
    character_id?: number,
    response_type?: ResponseType
  ): Promise<NarrativeInteraction[]> {
    let query = 'SELECT * FROM narrative_interactions WHERE user_id = ?';
    const params: any[] = [user_id];

    if (character_id !== undefined) {
      query += ' AND character_id = ?';
      params.push(character_id);
    }

    if (response_type) {
      query += ' AND response_type = ?';
      params.push(response_type);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const [rows] = await this.pool.execute(query, params);

    return (rows as any[]).map((row) => this.mapRowToInteraction(row));
  }

  /**
   * Map database row to NarrativeInteraction object
   */
  private mapRowToInteraction(row: any): NarrativeInteraction {
    return {
      id: row.id,
      user_id: row.user_id,
      character_id: row.character_id,
      scene_id: row.scene_id,
      intent_type: row.intent_type,
      player_input: row.player_input,
      game_events: row.game_events ? JSON.parse(row.game_events) : null,
      character_context: row.character_context ? JSON.parse(row.character_context) : null,
      scene_context: row.scene_context ? JSON.parse(row.scene_context) : null,
      npc_context: row.npc_context ? JSON.parse(row.npc_context) : null,
      ai_model: row.ai_model,
      ai_prompt: row.ai_prompt,
      ai_tokens_used: row.ai_tokens_used,
      response_type: row.response_type,
      response_content: row.response_content ? JSON.parse(row.response_content) : null,
      created_at: row.created_at,
      processing_time_ms: row.processing_time_ms,
    };
  }

  // ==========================================================================
  // Story Templates
  // ==========================================================================

  /**
   * Get template by name
   */
  public async getTemplate(name: string): Promise<StoryTemplate | null> {
    const [rows] = await this.pool.execute(
      'SELECT * FROM story_templates WHERE name = ? AND is_active = TRUE',
      [name]
    );

    const records = rows as any[];
    if (records.length === 0) return null;

    return this.mapRowToTemplate(records[0]);
  }

  /**
   * Get template by response type
   */
  public async getTemplateByType(response_type: string): Promise<StoryTemplate | null> {
    const [rows] = await this.pool.execute(
      'SELECT * FROM story_templates WHERE response_type = ? AND is_active = TRUE LIMIT 1',
      [response_type]
    );

    const records = rows as any[];
    if (records.length === 0) return null;

    return this.mapRowToTemplate(records[0]);
  }

  /**
   * Get all active templates
   */
  public async getAllTemplates(): Promise<StoryTemplate[]> {
    const [rows] = await this.pool.execute(
      'SELECT * FROM story_templates WHERE is_active = TRUE ORDER BY name'
    );

    return (rows as any[]).map((row) => this.mapRowToTemplate(row));
  }

  /**
   * Create or update a template
   */
  public async saveTemplate(template: StoryTemplate): Promise<number> {
    if (template.id) {
      // Update existing
      await this.pool.execute(
        `UPDATE story_templates
        SET description = ?, response_type = ?, system_prompt = ?,
            user_prompt_template = ?, temperature = ?, max_tokens = ?, is_active = ?
        WHERE id = ?`,
        [
          template.description || null,
          template.response_type,
          template.system_prompt,
          template.user_prompt_template,
          template.temperature || 0.7,
          template.max_tokens || 500,
          template.is_active !== false,
          template.id,
        ]
      );
      return template.id;
    } else {
      // Insert new
      const [result] = await this.pool.execute(
        `INSERT INTO story_templates
        (name, description, response_type, system_prompt, user_prompt_template,
         temperature, max_tokens, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          template.name,
          template.description || null,
          template.response_type,
          template.system_prompt,
          template.user_prompt_template,
          template.temperature || 0.7,
          template.max_tokens || 500,
          template.is_active !== false,
        ]
      );

      return (result as mysql.ResultSetHeader).insertId;
    }
  }

  /**
   * Delete template (soft delete by setting is_active = false)
   */
  public async deleteTemplate(id: number): Promise<void> {
    await this.pool.execute('UPDATE story_templates SET is_active = FALSE WHERE id = ?', [id]);
  }

  /**
   * Map database row to StoryTemplate object
   */
  private mapRowToTemplate(row: any): StoryTemplate {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      response_type: row.response_type,
      system_prompt: row.system_prompt,
      user_prompt_template: row.user_prompt_template,
      temperature: row.temperature,
      max_tokens: row.max_tokens,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // ==========================================================================
  // Response Cache
  // ==========================================================================

  /**
   * Generate cache key from context
   */
  public generateCacheKey(
    player_input: string,
    character_id?: number,
    scene_id?: number
  ): string {
    const data = JSON.stringify({
      input: player_input.toLowerCase().trim(),
      character: character_id,
      scene: scene_id,
    });

    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get cached response
   */
  public async getCachedResponse(cacheKey: string): Promise<ResponseCache | null> {
    const now = new Date();

    const [rows] = await this.pool.execute(
      `SELECT * FROM response_cache
       WHERE cache_key = ? AND (expires_at IS NULL OR expires_at > ?)`,
      [cacheKey, now]
    );

    const records = rows as any[];
    if (records.length === 0) return null;

    const cached = this.mapRowToCache(records[0]);

    // Update hit count and last used timestamp
    await this.pool.execute(
      'UPDATE response_cache SET hit_count = hit_count + 1, last_used_at = NOW() WHERE id = ?',
      [cached.id]
    );

    return cached;
  }

  /**
   * Save response to cache
   */
  public async cacheResponse(
    cacheKey: string,
    response_type: string,
    response_content: ResponseContent,
    ttlSeconds?: number
  ): Promise<void> {
    let expiresAt = null;
    if (ttlSeconds) {
      expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    }

    await this.pool.execute(
      `INSERT INTO response_cache (cache_key, response_type, response_content, expires_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         response_content = VALUES(response_content),
         expires_at = VALUES(expires_at),
         hit_count = 1,
         last_used_at = NOW()`,
      [cacheKey, response_type, JSON.stringify(response_content), expiresAt]
    );
  }

  /**
   * Clear expired cache entries
   */
  public async clearExpiredCache(): Promise<number> {
    const now = new Date();

    const [result] = await this.pool.execute(
      'DELETE FROM response_cache WHERE expires_at IS NOT NULL AND expires_at < ?',
      [now]
    );

    return (result as mysql.ResultSetHeader).affectedRows;
  }

  /**
   * Clear all cache
   */
  public async clearAllCache(): Promise<number> {
    const [result] = await this.pool.execute('DELETE FROM response_cache');
    return (result as mysql.ResultSetHeader).affectedRows;
  }

  /**
   * Map database row to ResponseCache object
   */
  private mapRowToCache(row: any): ResponseCache {
    return {
      id: row.id,
      cache_key: row.cache_key,
      response_type: row.response_type,
      response_content: row.response_content ? JSON.parse(row.response_content) : null,
      hit_count: row.hit_count,
      created_at: row.created_at,
      last_used_at: row.last_used_at,
      expires_at: row.expires_at,
    };
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Test database connection
   */
  public async testConnection(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  /**
   * Close all connections
   */
  public async close(): Promise<void> {
    await this.pool.end();
  }
}
