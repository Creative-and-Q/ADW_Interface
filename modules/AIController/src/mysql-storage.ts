import mysql, { type Pool, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { ChainConfiguration, ExecutionResult, Statistics } from './types.js';

export class MySQLStorage {
  private pool: Pool;

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ai_controller',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    console.log('📦 MySQL storage initialized');
  }

  // ==========================================================================
  // Chain Configuration Operations
  // ==========================================================================

  async createChain(chain: ChainConfiguration): Promise<ChainConfiguration> {
    try {
      const [result] = await this.pool.execute<ResultSetHeader>(
        `INSERT INTO chain_configurations (user_id, name, description, steps, output_template, meta_data)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          chain.user_id,
          chain.name,
          chain.description && chain.description.trim() !== '' ? chain.description : null,
          JSON.stringify(chain.steps),
          chain.output_template ? JSON.stringify(chain.output_template) : null,
          chain.meta_data ? JSON.stringify(chain.meta_data) : null,
        ]
      );

      return this.getChain(result.insertId);
    } catch (error: any) {
      console.error('Error creating chain:', error);
      throw new Error(`Failed to create chain: ${error.message}`);
    }
  }

  async getChain(id: number): Promise<ChainConfiguration> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM chain_configurations WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      throw new Error(`Chain ${id} not found`);
    }

    return this.rowToChain(rows[0]);
  }

  async getChainsByUser(userId: string): Promise<ChainConfiguration[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM chain_configurations WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    return rows.map((row) => this.rowToChain(row));
  }

  async getAllChains(): Promise<ChainConfiguration[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM chain_configurations ORDER BY created_at DESC'
    );

    return rows.map((row) => this.rowToChain(row));
  }

  async updateChain(
    id: number,
    updates: Partial<ChainConfiguration>
  ): Promise<ChainConfiguration> {
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
    if (updates.steps !== undefined) {
      fields.push('steps = ?');
      values.push(JSON.stringify(updates.steps));
    }
    if (updates.output_template !== undefined) {
      fields.push('output_template = ?');
      values.push(updates.output_template ? JSON.stringify(updates.output_template) : null);
    }
    if (updates.meta_data !== undefined) {
      fields.push('meta_data = ?');
      values.push(JSON.stringify(updates.meta_data));
    }

    if (fields.length === 0) {
      return this.getChain(id);
    }

    values.push(id);
    await this.pool.execute(
      `UPDATE chain_configurations SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return this.getChain(id);
  }

  async deleteChain(id: number): Promise<void> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'DELETE FROM chain_configurations WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      throw new Error(`Chain ${id} not found`);
    }
  }

  async chainExists(id: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT id FROM chain_configurations WHERE id = ?',
      [id]
    );
    return rows.length > 0;
  }

  async getChainOwner(id: number): Promise<string> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT user_id FROM chain_configurations WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      throw new Error(`Chain ${id} not found`);
    }

    return rows[0].user_id;
  }

  // ==========================================================================
  // Execution History Operations
  // ==========================================================================

  async saveExecution(execution: ExecutionResult): Promise<ExecutionResult> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO execution_history
       (user_id, chain_id, chain_name, input, steps, output, success, error, total_duration_ms, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        execution.user_id,
        execution.chain_id || null,
        execution.chain_name || null,
        JSON.stringify(execution.input),
        JSON.stringify(execution.steps),
        execution.output ? JSON.stringify(execution.output) : null,
        execution.success,
        execution.error || null,
        execution.total_duration_ms,
        this.toMySQLDatetime(execution.started_at),
        this.toMySQLDatetime(execution.completed_at),
      ]
    );

    return {
      ...execution,
      id: result.insertId,
    };
  }

  async getExecution(id: number): Promise<ExecutionResult> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM execution_history WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      throw new Error(`Execution ${id} not found`);
    }

    return this.rowToExecution(rows[0]);
  }

  async getExecutionsByUser(
    userId: string,
    limit: number = 100
  ): Promise<ExecutionResult[]> {
    // Ensure limit is a safe integer
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 1000));

    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT * FROM execution_history WHERE user_id = ? ORDER BY started_at DESC LIMIT ${safeLimit}`,
      [userId]
    );

    return rows.map((row) => this.rowToExecution(row));
  }

  async getExecutionsByChain(
    chainId: number,
    limit: number = 100
  ): Promise<ExecutionResult[]> {
    // Ensure limit is a safe integer
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 1000));

    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT * FROM execution_history WHERE chain_id = ? ORDER BY started_at DESC LIMIT ${safeLimit}`,
      [chainId]
    );

    return rows.map((row) => this.rowToExecution(row));
  }

  async getRecentExecutions(limit: number = 10): Promise<ExecutionResult[]> {
    // Ensure limit is a safe integer
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 1000));

    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT * FROM execution_history ORDER BY started_at DESC LIMIT ${safeLimit}`
    );

    return rows.map((row) => this.rowToExecution(row));
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  async getStatistics(): Promise<Statistics> {
    // Get basic stats from view
    const [statsRows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM execution_statistics'
    );
    const stats = statsRows[0];

    // Get total chains
    const [chainRows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM chain_configurations'
    );
    const totalChains = chainRows[0].count;

    // Get chains by user (no parameters, limit is hardcoded)
    const [chainsByUserRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT user_id, COUNT(*) as count
       FROM chain_configurations
       GROUP BY user_id
       ORDER BY count DESC
       LIMIT 10`
    );

    // Get executions by module (parse steps JSON)
    const [executionsRows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT steps FROM execution_history WHERE success = 1'
    );

    const moduleCounts: Record<string, number> = {};
    executionsRows.forEach((row) => {
      const steps = typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps;
      steps.forEach((step: any) => {
        // Only count module steps (skip conditional and chain_call steps)
        if (step.module) {
          moduleCounts[step.module] = (moduleCounts[step.module] || 0) + 1;
        }
      });
    });

    const executionsByModule = Object.entries(moduleCounts).map(([module, count]) => ({
      module: module as any,
      count,
    }));

    // Get recent executions
    const recentExecutions = await this.getRecentExecutions(10);

    return {
      total_chains: totalChains,
      total_executions: stats.total_executions || 0,
      successful_executions: stats.successful_executions || 0,
      failed_executions: stats.failed_executions || 0,
      average_duration_ms: Math.round(stats.average_duration_ms || 0),
      chains_by_user: chainsByUserRows.map((row) => ({
        user_id: row.user_id,
        count: row.count,
      })),
      executions_by_module: executionsByModule,
      recent_executions: recentExecutions,
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Convert ISO 8601 datetime string to MySQL datetime format
   * '2025-10-29T23:09:01.074Z' -> '2025-10-29 23:09:01'
   */
  private toMySQLDatetime(isoString: string): string {
    const date = new Date(isoString);
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  private rowToChain(row: RowDataPacket): ChainConfiguration {
    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      description: row.description,
      steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps,
      output_template: row.output_template
        ? (typeof row.output_template === 'string' ? JSON.parse(row.output_template) : row.output_template)
        : undefined,
      meta_data: row.meta_data
        ? (typeof row.meta_data === 'string' ? JSON.parse(row.meta_data) : row.meta_data)
        : undefined,
      created_at: row.created_at?.toISOString(),
      updated_at: row.updated_at?.toISOString(),
    };
  }

  private rowToExecution(row: RowDataPacket): ExecutionResult {
    return {
      id: row.id,
      user_id: row.user_id,
      chain_id: row.chain_id,
      chain_name: row.chain_name,
      input: typeof row.input === 'string' ? JSON.parse(row.input) : row.input,
      steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps,
      output: row.output
        ? (typeof row.output === 'string' ? JSON.parse(row.output) : row.output)
        : undefined,
      success: row.success === 1,
      error: row.error,
      total_duration_ms: row.total_duration_ms,
      started_at: row.started_at?.toISOString(),
      completed_at: row.completed_at?.toISOString(),
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
    console.log('📦 MySQL storage closed');
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.pool.execute('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
