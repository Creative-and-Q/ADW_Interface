import mysql from 'mysql2/promise';
import { CharacterSheet } from './types.js';

/**
 * MySQL-based character storage with user management
 */
export class MySQLStorage {
  private pool: mysql.Pool;

  constructor(config?: mysql.PoolOptions) {
    this.pool = mysql.createPool(
      config || {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'character_controller',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      }
    );
  }

  /**
   * Ensure user exists in database
   */
  async ensureUser(userId: string): Promise<void> {
    await this.pool.execute(
      'INSERT IGNORE INTO users (id) VALUES (?)',
      [userId]
    );
  }

  /**
   * Check if character name is available for user
   * Returns true if name is available (no conflict with claimed characters)
   * If userId is null (creating unclaimed character), always returns true
   */
  async isNameAvailable(userId: string | null, characterName: string): Promise<boolean> {
    if (userId === null) {
      // Unclaimed characters can always be created (they'll merge if name exists)
      return true;
    }

    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT user_id FROM characters WHERE name = ? AND user_id IS NOT NULL AND user_id != ?',
      [characterName, userId]
    );
    return rows.length === 0;
  }

  /**
   * Get character by user ID and name
   * If userId is null, looks up by name only (for unclaimed characters)
   */
  async getCharacter(userId: string | null, characterName: string): Promise<CharacterSheet | null> {
    let query: string;
    let params: any[];

    if (userId === null) {
      // For unclaimed characters, look up by name only
      query = 'SELECT data FROM characters WHERE name = ? AND user_id IS NULL';
      params = [characterName];
    } else {
      // For user characters, look up by user_id and name
      query = 'SELECT data FROM characters WHERE user_id = ? AND name = ?';
      params = [userId, characterName];
    }

    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(query, params);

    if (rows.length === 0) return null;

    try {
      console.log(`Loading character data for ${userId || 'unclaimed'}/${characterName}`);
      const data = rows[0].data;

      // MySQL2 automatically parses JSON columns, so data is already an object
      // If it's a string, parse it; if it's already an object, use it directly
      const result = typeof data === 'string' ? JSON.parse(data) : data;

      console.log('Successfully loaded character data');
      return result as CharacterSheet;
    } catch (error) {
      console.error(`Failed to load character data for ${userId || 'unclaimed'}/${characterName}:`, error);
      console.error('Data type:', typeof rows[0].data);
      console.error('Data:', rows[0].data);
      // Return null for corrupted data so it gets recreated
      return null;
    }
  }

  /**
   * Save or update character
   * Handles name changes, conflict detection, and claiming unclaimed characters
   * If userId is null, creates an unclaimed character (NPC/ally/enemy)
   * If a user tries to create a character with an unclaimed name, they claim it
   */
  async saveCharacter(
    userId: string | null,
    character: CharacterSheet,
    previousName?: string
  ): Promise<{ success: boolean; error?: string; claimed?: boolean }> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      // Ensure user exists (only if userId is provided)
      if (userId) {
        await connection.execute(
          'INSERT IGNORE INTO users (id) VALUES (?)',
          [userId]
        );
      }

      // Check if this is a name change
      if (previousName && previousName !== character.name) {
        // Check if new name is available (only check claimed characters by other users)
        const [conflicts] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT user_id FROM characters WHERE name = ? AND user_id IS NOT NULL AND user_id != ?',
          [character.name, userId]
        );

        if (conflicts.length > 0) {
          await connection.rollback();
          return {
            success: false,
            error: `Character name "${character.name}" is already taken`,
          };
        }

        // Get character ID for history
        const [charRows] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT id FROM characters WHERE user_id = ? AND name = ?',
          [userId, previousName]
        );

        if (charRows.length > 0) {
          const characterId = charRows[0].id;

          // Record name change in history
          await connection.execute(
            'INSERT INTO character_name_history (character_id, old_name, new_name) VALUES (?, ?, ?)',
            [characterId, previousName, character.name]
          );

          // Update character name and data
          await connection.execute(
            'UPDATE characters SET name = ?, data = ?, updated_at = NOW() WHERE id = ?',
            [character.name, JSON.stringify(character), characterId]
          );
        }
      } else {
        // New character or update without name change
        // Check if character exists with this name
        const [existingChars] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT id, user_id FROM characters WHERE name = ?',
          [character.name]
        );

        if (existingChars.length > 0) {
          const existingChar = existingChars[0];

          // Check if it's owned by the current user
          if (existingChar.user_id === userId) {
            // Update existing character owned by this user
            await connection.execute(
              'UPDATE characters SET data = ?, updated_at = NOW() WHERE id = ?',
              [JSON.stringify(character), existingChar.id]
            );
          } else if (existingChar.user_id === null && userId !== null) {
            // Character is unclaimed - claim it!
            console.log(`User ${userId} is claiming unclaimed character: ${character.name}`);
            await connection.execute(
              'UPDATE characters SET user_id = ?, data = ?, updated_at = NOW() WHERE id = ?',
              [userId, JSON.stringify(character), existingChar.id]
            );
            await connection.commit();
            return { success: true, claimed: true };
          } else {
            // Character is owned by another user
            await connection.rollback();
            return {
              success: false,
              error: `Character name "${character.name}" is already taken by another user`,
            };
          }
        } else {
          // Character doesn't exist - create new one
          await connection.execute(
            'INSERT INTO characters (user_id, name, data) VALUES (?, ?, ?)',
            [userId, character.name, JSON.stringify(character)]
          );
        }
      }

      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get all characters for a user
   */
  async getUserCharacters(userId: string): Promise<string[]> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT name FROM characters WHERE user_id = ? ORDER BY updated_at DESC',
      [userId]
    );

    return rows.map((row) => row.name);
  }

  /**
   * Delete character
   */
  async deleteCharacter(userId: string, characterName: string): Promise<boolean> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader>(
      'DELETE FROM characters WHERE user_id = ? AND name = ?',
      [userId, characterName]
    );

    return result.affectedRows > 0;
  }

  /**
   * Search characters by name pattern (for user only)
   */
  async searchCharacters(userId: string, query: string): Promise<string[]> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT name FROM characters WHERE user_id = ? AND name LIKE ? ORDER BY name',
      [userId, `%${query}%`]
    );

    return rows.map((row) => row.name);
  }

  /**
   * Get statistics
   */
  async getStats(userId?: string): Promise<{
    totalUsers: number;
    totalCharacters: number;
    userCharacters?: number;
  }> {
    const [userCount] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM users'
    );

    const [charCount] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM characters'
    );

    const stats: any = {
      totalUsers: userCount[0].count,
      totalCharacters: charCount[0].count,
    };

    if (userId) {
      const [userCharCount] = await this.pool.execute<mysql.RowDataPacket[]>(
        'SELECT COUNT(*) as count FROM characters WHERE user_id = ?',
        [userId]
      );
      stats.userCharacters = userCharCount[0].count;
    }

    return stats;
  }

  /**
   * Get character's name change history
   */
  async getNameHistory(userId: string, characterName: string): Promise<
    Array<{ oldName: string; newName: string; changedAt: Date }>
  > {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT h.old_name, h.new_name, h.changed_at
       FROM character_name_history h
       JOIN characters c ON h.character_id = c.id
       WHERE c.user_id = ? AND c.name = ?
       ORDER BY h.changed_at DESC`,
      [userId, characterName]
    );

    return rows.map((row) => ({
      oldName: row.old_name,
      newName: row.new_name,
      changedAt: new Date(row.changed_at),
    }));
  }

  /**
   * Close connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
