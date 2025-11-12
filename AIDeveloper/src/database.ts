/**
 * Database connection and query management
 * Provides MySQL connection pool and query utilities
 */

import mysql from 'mysql2/promise';
import { config } from './config.js';

// Connection pool
let pool: mysql.Pool | null = null;

/**
 * Initialize database connection pool
 */
export function initializeDatabase(): mysql.Pool {
  if (pool) {
    return pool;
  }

  pool = mysql.createPool({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.name,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

  console.log(`Database pool created for ${config.database.name}`);
  return pool;
}

/**
 * Get database connection pool
 */
export function getDatabase(): mysql.Pool {
  if (!pool) {
    return initializeDatabase();
  }
  return pool;
}

/**
 * Check database connection health
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const db = getDatabase();
    const connection = await db.getConnection();
    await connection.ping();
    connection.release();
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

/**
 * Execute a query with automatic error handling
 */
export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T> {
  const db = getDatabase();
  try {
    const [rows] = await db.execute(sql, params);
    return rows as T;
  } catch (error) {
    console.error('Database query error:', error);
    console.error('SQL:', sql);
    console.error('Params:', params);
    throw error;
  }
}

/**
 * Execute a query and return the first result
 */
export async function queryOne<T = any>(
  sql: string,
  params?: any[]
): Promise<T | null> {
  const results = await query<T[]>(sql, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * Begin a database transaction
 */
export async function beginTransaction(): Promise<mysql.PoolConnection> {
  const db = getDatabase();
  const connection = await db.getConnection();
  await connection.beginTransaction();
  return connection;
}

/**
 * Commit a transaction
 */
export async function commitTransaction(
  connection: mysql.PoolConnection
): Promise<void> {
  try {
    await connection.commit();
  } finally {
    connection.release();
  }
}

/**
 * Rollback a transaction
 */
export async function rollbackTransaction(
  connection: mysql.PoolConnection
): Promise<void> {
  try {
    await connection.rollback();
  } finally {
    connection.release();
  }
}

/**
 * Execute query within a transaction
 */
export async function executeInTransaction<T>(
  callback: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await beginTransaction();
  try {
    const result = await callback(connection);
    await commitTransaction(connection);
    return result;
  } catch (error) {
    await rollbackTransaction(connection);
    throw error;
  }
}

/**
 * Insert a record and return the insert ID
 */
export async function insert(
  table: string,
  data: Record<string, any>
): Promise<number> {
  const fields = Object.keys(data);
  const values = Object.values(data);
  const placeholders = fields.map(() => '?').join(', ');

  const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`;
  const db = getDatabase();
  const [result] = await db.execute(sql, values);

  return (result as mysql.ResultSetHeader).insertId;
}

/**
 * Update records
 */
export async function update(
  table: string,
  data: Record<string, any>,
  where: string,
  whereParams: any[]
): Promise<number> {
  const fields = Object.keys(data);
  const values = Object.values(data);
  const setClause = fields.map(field => `${field} = ?`).join(', ');

  const sql = `UPDATE ${table} SET ${setClause} WHERE ${where}`;
  const db = getDatabase();
  const [result] = await db.execute(sql, [...values, ...whereParams]);

  return (result as mysql.ResultSetHeader).affectedRows;
}

/**
 * Delete records
 */
export async function deleteFrom(
  table: string,
  where: string,
  whereParams: any[]
): Promise<number> {
  const sql = `DELETE FROM ${table} WHERE ${where}`;
  const db = getDatabase();
  const [result] = await db.execute(sql, whereParams);

  return (result as mysql.ResultSetHeader).affectedRows;
}

/**
 * Close database connection pool
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database pool closed');
  }
}

// Initialize database on module load
initializeDatabase();
