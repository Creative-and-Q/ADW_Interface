import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { Item, SearchItemsRequest } from './types.js';

dotenv.config();

/**
 * MySQL storage for item catalog
 * Simplified to only manage the items table
 */
export class MySQLItemStorage {
  private pool: mysql.Pool;

  constructor(config?: mysql.PoolOptions) {
    this.pool = mysql.createPool(
      config || {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'item_controller',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      }
    );
  }

  /**
   * Create a new item
   */
  async createItem(item: Item): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO items (name, meta_data, contained_in_item_id) VALUES (?, ?, ?)`,
      [item.name, item.meta_data ? JSON.stringify(item.meta_data) : null, item.contained_in_item_id || null]
    );
    return result.insertId;
  }

  /**
   * Get item by ID
   */
  async getItem(id: number): Promise<Item | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>('SELECT * FROM items WHERE id = ?', [id]);

    if (rows.length === 0) return null;
    return this.mapRowToItem(rows[0]);
  }

  /**
   * Update an item
   */
  async updateItem(id: number, updates: Partial<Item>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }

    if (updates.meta_data !== undefined) {
      fields.push('meta_data = ?');
      values.push(JSON.stringify(updates.meta_data));
    }

    if (updates.contained_in_item_id !== undefined) {
      fields.push('contained_in_item_id = ?');
      values.push(updates.contained_in_item_id);
    }

    if (fields.length === 0) return;

    values.push(id);
    await this.pool.execute(`UPDATE items SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  /**
   * Delete an item
   */
  async deleteItem(id: number): Promise<void> {
    await this.pool.execute('DELETE FROM items WHERE id = ?', [id]);
  }

  /**
   * Search items by name (supports partial matching and FULLTEXT search)
   */
  async searchItems(params: SearchItemsRequest): Promise<{ items: Item[]; total: number }> {
    const limit = params.limit || 50;
    const offset = params.offset || 0;
    let whereClause = '';
    const values: any[] = [];

    if (params.name) {
      // Use LIKE for partial matching
      whereClause = 'WHERE name LIKE ?';
      values.push(`%${params.name}%`);
    }

    // Get total count
    const [countRows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM items ${whereClause}`,
      values
    );
    const total = countRows[0].count;

    // Get items
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT * FROM items ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    const items = rows.map((row) => this.mapRowToItem(row));

    return { items, total };
  }

  /**
   * Map database row to Item
   */
  private mapRowToItem(row: mysql.RowDataPacket): Item {
    return {
      id: row.id,
      name: row.name,
      meta_data: row.meta_data ? JSON.parse(row.meta_data) : undefined,
      contained_in_item_id: row.contained_in_item_id || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Get all items contained in a specific item
   */
  async getContainedItems(containerId: number): Promise<Item[]> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM items WHERE contained_in_item_id = ?',
      [containerId]
    );

    return rows.map((row) => this.mapRowToItem(row));
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalItems: number;
  }> {
    const [itemRows] = await this.pool.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as count FROM items');

    return {
      totalItems: itemRows[0].count,
    };
  }
}
