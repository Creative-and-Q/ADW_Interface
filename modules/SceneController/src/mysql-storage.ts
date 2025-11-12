import mysql from 'mysql2/promise';
import {
  Continent,
  Region,
  Location,
  POI,
  EntityPosition,
  MovementHistory,
  LocationConnection,
  ProximityResult,
} from './types.js';

/**
 * MySQL storage for scene management
 */
export class MySQLSceneStorage {
  private pool: mysql.Pool;

  constructor(config?: mysql.PoolOptions) {
    this.pool = mysql.createPool(
      config || {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'scene_controller',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      }
    );
  }

  /**
   * Location Management
   */

  async createLocation(location: Location): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO locations (name, description, location_type, x_coord, y_coord, parent_location_id, region_id, continent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        location.name,
        location.description || null,
        location.location_type,
        location.x_coord,
        location.y_coord,
        location.parent_location_id || null,
        location.region_id || null,
        location.continent_id || null,
      ]
    );
    return result.insertId;
  }

  async getLocation(id: number): Promise<Location | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM locations WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return this.mapRowToLocation(rows[0]);
  }

  async getLocationByName(name: string): Promise<Location | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM locations WHERE name = ?',
      [name]
    );

    if (rows.length === 0) return null;
    return this.mapRowToLocation(rows[0]);
  }

  async getLocationByCoordinates(x: number, y: number, tolerance: number = 1): Promise<Location | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT * FROM locations
       WHERE x_coord BETWEEN ? AND ?
       AND y_coord BETWEEN ? AND ?
       LIMIT 1`,
      [x - tolerance, x + tolerance, y - tolerance, y + tolerance]
    );

    if (rows.length === 0) return null;
    return this.mapRowToLocation(rows[0]);
  }

  async getNearbyLocations(
    x: number,
    y: number,
    radius: number
  ): Promise<ProximityResult<Location>[]> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT *,
         SQRT(POW(x_coord - ?, 2) + POW(y_coord - ?, 2)) as distance
       FROM locations
       WHERE SQRT(POW(x_coord - ?, 2) + POW(y_coord - ?, 2)) <= ?
       ORDER BY distance ASC`,
      [x, y, x, y, radius]
    );

    return rows.map((row) => ({
      item: this.mapRowToLocation(row),
      distance: parseFloat(row.distance),
    }));
  }

  async updateLocation(id: number, updates: Partial<Location>): Promise<boolean> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.location_type !== undefined) {
      fields.push('location_type = ?');
      values.push(updates.location_type);
    }
    if (updates.x_coord !== undefined) {
      fields.push('x_coord = ?');
      values.push(updates.x_coord);
    }
    if (updates.y_coord !== undefined) {
      fields.push('y_coord = ?');
      values.push(updates.y_coord);
    }
    if (updates.parent_location_id !== undefined) {
      fields.push('parent_location_id = ?');
      values.push(updates.parent_location_id);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const [result] = await this.pool.execute<mysql.ResultSetHeader>(
      `UPDATE locations SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return result.affectedRows > 0;
  }

  async deleteLocation(id: number): Promise<boolean> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader>(
      'DELETE FROM locations WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  /**
   * POI Management
   */

  async createPOI(poi: POI): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO pois (name, description, poi_type, location_id, x_coord, y_coord, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        poi.name,
        poi.description || null,
        poi.poi_type,
        poi.location_id,
        poi.x_coord,
        poi.y_coord,
        poi.metadata ? JSON.stringify(poi.metadata) : null,
      ]
    );
    return result.insertId;
  }

  async getPOI(id: number): Promise<POI | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM pois WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return this.mapRowToPOI(rows[0]);
  }

  async getPOIsByLocation(locationId: number): Promise<POI[]> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM pois WHERE location_id = ? ORDER BY name',
      [locationId]
    );

    return rows.map((row) => this.mapRowToPOI(row));
  }

  async getNearbyPOIs(
    x: number,
    y: number,
    radius: number
  ): Promise<ProximityResult<POI>[]> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT *,
         SQRT(POW(x_coord - ?, 2) + POW(y_coord - ?, 2)) as distance
       FROM pois
       WHERE SQRT(POW(x_coord - ?, 2) + POW(y_coord - ?, 2)) <= ?
       ORDER BY distance ASC`,
      [x, y, x, y, radius]
    );

    return rows.map((row) => ({
      item: this.mapRowToPOI(row),
      distance: parseFloat(row.distance),
    }));
  }

  async deletePOI(id: number): Promise<boolean> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader>(
      'DELETE FROM pois WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  /**
   * Entity Position Management
   */

  async upsertEntityPosition(position: EntityPosition): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO entity_positions
       (entity_id, entity_type, entity_name, x_coord, y_coord, location_id, user_id, facing_direction, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         entity_name = VALUES(entity_name),
         x_coord = VALUES(x_coord),
         y_coord = VALUES(y_coord),
         location_id = VALUES(location_id),
         facing_direction = VALUES(facing_direction),
         is_active = VALUES(is_active),
         last_movement_at = NOW()`,
      [
        position.entity_id,
        position.entity_type,
        position.entity_name,
        position.x_coord,
        position.y_coord,
        position.location_id || null,
        position.user_id || null,
        position.facing_direction || null,
        position.is_active ?? true,
      ]
    );

    // Get the ID (either inserted or existing)
    if (result.insertId > 0) {
      return result.insertId;
    } else {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        'SELECT id FROM entity_positions WHERE entity_id = ? AND entity_type = ?',
        [position.entity_id, position.entity_type]
      );
      return rows[0].id;
    }
  }

  async getEntityPosition(entityId: string, entityType: string): Promise<EntityPosition | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM entity_positions WHERE entity_id = ? AND entity_type = ?',
      [entityId, entityType]
    );

    if (rows.length === 0) return null;
    return this.mapRowToEntityPosition(rows[0]);
  }

  async getNearbyEntities(
    x: number,
    y: number,
    radius: number,
    activeOnly: boolean = true
  ): Promise<ProximityResult<EntityPosition>[]> {
    const query = activeOnly
      ? `SELECT *,
           SQRT(POW(x_coord - ?, 2) + POW(y_coord - ?, 2)) as distance
         FROM entity_positions
         WHERE is_active = TRUE
         AND SQRT(POW(x_coord - ?, 2) + POW(y_coord - ?, 2)) <= ?
         ORDER BY distance ASC`
      : `SELECT *,
           SQRT(POW(x_coord - ?, 2) + POW(y_coord - ?, 2)) as distance
         FROM entity_positions
         WHERE SQRT(POW(x_coord - ?, 2) + POW(y_coord - ?, 2)) <= ?
         ORDER BY distance ASC`;

    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      query,
      activeOnly ? [x, y, x, y, radius] : [x, y, x, y, radius]
    );

    return rows.map((row) => ({
      item: this.mapRowToEntityPosition(row),
      distance: parseFloat(row.distance),
    }));
  }

  async getEntitiesInLocation(locationId: number, activeOnly: boolean = true): Promise<EntityPosition[]> {
    const query = activeOnly
      ? 'SELECT * FROM entity_positions WHERE location_id = ? AND is_active = TRUE ORDER BY entity_name'
      : 'SELECT * FROM entity_positions WHERE location_id = ? ORDER BY entity_name';

    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(query, [locationId]);
    return rows.map((row) => this.mapRowToEntityPosition(row));
  }

  async setEntityActive(entityId: string, entityType: string, isActive: boolean): Promise<boolean> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader>(
      'UPDATE entity_positions SET is_active = ? WHERE entity_id = ? AND entity_type = ?',
      [isActive, entityId, entityType]
    );
    return result.affectedRows > 0;
  }

  /**
   * Movement History
   */

  async recordMovement(history: MovementHistory): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO movement_history
       (entity_position_id, from_x, from_y, to_x, to_y, from_location_id, to_location_id, movement_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        history.entity_position_id,
        history.from_x,
        history.from_y,
        history.to_x,
        history.to_y,
        history.from_location_id || null,
        history.to_location_id || null,
        history.movement_type,
      ]
    );
    return result.insertId;
  }

  async getMovementHistory(
    entityPositionId: number,
    limit: number = 100
  ): Promise<MovementHistory[]> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM movement_history WHERE entity_position_id = ? ORDER BY moved_at DESC LIMIT ?',
      [entityPositionId, limit]
    );

    return rows.map((row) => this.mapRowToMovementHistory(row));
  }

  /**
   * Location Connections
   */

  async createConnection(connection: LocationConnection): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO location_connections
       (from_location_id, to_location_id, connection_type, description, is_bidirectional, requires_key, is_hidden)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        connection.from_location_id,
        connection.to_location_id,
        connection.connection_type,
        connection.description || null,
        connection.is_bidirectional ?? true,
        connection.requires_key ?? false,
        connection.is_hidden ?? false,
      ]
    );
    return result.insertId;
  }

  async getConnectionsFromLocation(locationId: number): Promise<LocationConnection[]> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT * FROM location_connections
       WHERE (from_location_id = ? OR (to_location_id = ? AND is_bidirectional = TRUE))
       AND is_hidden = FALSE`,
      [locationId, locationId]
    );

    return rows.map((row) => this.mapRowToLocationConnection(row));
  }

  /**
   * Utility Methods
   */

  async getStats(): Promise<{
    totalLocations: number;
    totalPOIs: number;
    activeEntities: number;
    totalMovements: number;
  }> {
    const [locations] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM locations'
    );
    const [pois] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM pois'
    );
    const [entities] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM entity_positions WHERE is_active = TRUE'
    );
    const [movements] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM movement_history'
    );

    return {
      totalLocations: locations[0].count,
      totalPOIs: pois[0].count,
      activeEntities: entities[0].count,
      totalMovements: movements[0].count,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Row Mapping
   */

  private mapRowToLocation(row: any): Location {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      location_type: row.location_type,
      x_coord: parseFloat(row.x_coord),
      y_coord: parseFloat(row.y_coord),
      parent_location_id: row.parent_location_id,
      region_id: row.region_id,
      continent_id: row.continent_id,
      created_at: row.created_at?.toISOString(),
      updated_at: row.updated_at?.toISOString(),
    };
  }

  private mapRowToPOI(row: any): POI {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      poi_type: row.poi_type,
      location_id: row.location_id,
      region_id: row.region_id,
      x_coord: parseFloat(row.x_coord),
      y_coord: parseFloat(row.y_coord),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      created_at: row.created_at?.toISOString(),
      updated_at: row.updated_at?.toISOString(),
    };
  }

  private mapRowToEntityPosition(row: any): EntityPosition {
    return {
      id: row.id,
      entity_id: row.entity_id,
      entity_type: row.entity_type,
      entity_name: row.entity_name,
      x_coord: parseFloat(row.x_coord),
      y_coord: parseFloat(row.y_coord),
      location_id: row.location_id,
      region_id: row.region_id,
      continent_id: row.continent_id,
      user_id: row.user_id,
      facing_direction: row.facing_direction ? parseFloat(row.facing_direction) : null,
      is_active: Boolean(row.is_active),
      last_movement_at: row.last_movement_at?.toISOString(),
      created_at: row.created_at?.toISOString(),
      updated_at: row.updated_at?.toISOString(),
    };
  }

  private mapRowToMovementHistory(row: any): MovementHistory {
    return {
      id: row.id,
      entity_position_id: row.entity_position_id,
      from_x: parseFloat(row.from_x),
      from_y: parseFloat(row.from_y),
      to_x: parseFloat(row.to_x),
      to_y: parseFloat(row.to_y),
      from_location_id: row.from_location_id,
      from_region_id: row.from_region_id,
      from_continent_id: row.from_continent_id,
      to_location_id: row.to_location_id,
      to_region_id: row.to_region_id,
      to_continent_id: row.to_continent_id,
      movement_type: row.movement_type,
      moved_at: row.moved_at?.toISOString(),
    };
  }

  private mapRowToLocationConnection(row: any): LocationConnection {
    return {
      id: row.id,
      from_location_id: row.from_location_id,
      to_location_id: row.to_location_id,
      connection_type: row.connection_type,
      description: row.description,
      is_bidirectional: Boolean(row.is_bidirectional),
      requires_key: Boolean(row.requires_key),
      is_hidden: Boolean(row.is_hidden),
      created_at: row.created_at?.toISOString(),
    };
  }

  private mapRowToContinent(row: any): Continent {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      map_data: row.map_data ? JSON.parse(row.map_data) : undefined,
      created_at: row.created_at?.toISOString(),
      updated_at: row.updated_at?.toISOString(),
    };
  }

  private mapRowToRegion(row: any): Region {
    return {
      id: row.id,
      continent_id: row.continent_id,
      name: row.name,
      description: row.description,
      min_x: row.min_x ? parseFloat(row.min_x) : undefined,
      min_y: row.min_y ? parseFloat(row.min_y) : undefined,
      max_x: row.max_x ? parseFloat(row.max_x) : undefined,
      max_y: row.max_y ? parseFloat(row.max_y) : undefined,
      terrain_type: row.terrain_type,
      climate: row.climate,
      danger_level: row.danger_level,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      created_at: row.created_at?.toISOString(),
      updated_at: row.updated_at?.toISOString(),
    };
  }

  /**
   * Continent Management
   */

  async createContinent(continent: Continent): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO continents (name, description, map_data)
       VALUES (?, ?, ?)`,
      [
        continent.name,
        continent.description || null,
        continent.map_data ? JSON.stringify(continent.map_data) : null,
      ]
    );
    return result.insertId;
  }

  async getContinent(id: number): Promise<Continent | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM continents WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return this.mapRowToContinent(rows[0]);
  }

  async getContinentByName(name: string): Promise<Continent | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM continents WHERE name = ?',
      [name]
    );

    if (rows.length === 0) return null;
    return this.mapRowToContinent(rows[0]);
  }

  async getAllContinents(): Promise<Continent[]> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM continents ORDER BY name ASC'
    );

    return rows.map((row) => this.mapRowToContinent(row));
  }

  /**
   * Region Management
   */

  async createRegion(region: Region): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO regions (continent_id, name, description, min_x, min_y, max_x, max_y, terrain_type, climate, danger_level, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        region.continent_id,
        region.name,
        region.description || null,
        region.min_x || null,
        region.min_y || null,
        region.max_x || null,
        region.max_y || null,
        region.terrain_type || null,
        region.climate || null,
        region.danger_level || 1,
        region.metadata ? JSON.stringify(region.metadata) : null,
      ]
    );
    return result.insertId;
  }

  async getRegion(id: number): Promise<Region | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM regions WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return this.mapRowToRegion(rows[0]);
  }

  async getRegionByName(name: string): Promise<Region | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM regions WHERE name = ?',
      [name]
    );

    if (rows.length === 0) return null;
    return this.mapRowToRegion(rows[0]);
  }

  async getRegionsByContinent(continentId: number): Promise<Region[]> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM regions WHERE continent_id = ? ORDER BY name ASC',
      [continentId]
    );

    return rows.map((row) => this.mapRowToRegion(row));
  }

  async getRegionByCoordinates(x: number, y: number): Promise<Region | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT * FROM regions
       WHERE ? BETWEEN min_x AND max_x
       AND ? BETWEEN min_y AND max_y
       LIMIT 1`,
      [x, y]
    );

    if (rows.length === 0) return null;
    return this.mapRowToRegion(rows[0]);
  }

  async getAllRegions(): Promise<Region[]> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM regions ORDER BY continent_id, name ASC'
    );

    return rows.map((row) => this.mapRowToRegion(row));
  }
}
