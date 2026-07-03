import pg from 'pg';
import { config } from '../../config/index.js';
import { logger } from '../../logger/index.js';
import { ConnectionError } from '../../errors/app-error.js';
import { errorHandler } from '../../errors/error-handler.js';

const { Pool } = pg;

export class DatabaseService {
  private pool: pg.Pool;

  constructor() {
    const isRDS = config.DB_HOST.includes('rds.amazonaws.com');
    // Enable SSL for RDS databases automatically (common for AWS RDS)
    const ssl = isRDS ? { rejectUnauthorized: false } : undefined;

    this.pool = new Pool({
      host: config.DB_HOST,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      database: config.DB_NAME,
      port: config.DB_PORT,
      ssl,
      // Standard production pool settings
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  /**
   * Initializes the database connection pool and sets up the temp_cng_pump table.
   * Ensures no DROP/DELETE commands are run.
   */
  public async initialize(): Promise<void> {
    logger.info('Connecting to PostgreSQL database...');
    try {
      // Test connection
      const client = await this.pool.connect();
      logger.info('Successfully connected to PostgreSQL database.');
      client.release();

      // Initialize table structure
      await this.createTable();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new ConnectionError(`PostgreSQL connection failed: ${errMsg}`, {
        host: config.DB_HOST,
        database: config.DB_NAME,
      });
    }
  }

  /**
   * Creates the temp_cng_pump table if it does not already exist.
   * Under no circumstances should this drop or truncate any tables.
   */
  private async createTable(): Promise<void> {
    const createQuery = `
      CREATE TABLE IF NOT EXISTS temp_cng_pump (
        id SERIAL PRIMARY KEY,
        pump_name VARCHAR(255) NOT NULL,
        last_updated TIMESTAMP WITH TIME ZONE,
        note TEXT,
        owner_name VARCHAR(255),
        price NUMERIC(10, 2),
        is_cng_available BOOLEAN DEFAULT FALSE,
        created_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const alterQuery = `
      ALTER TABLE temp_cng_pump 
      ADD COLUMN IF NOT EXISTS is_cng_available BOOLEAN DEFAULT FALSE;
    `;

    try {
      logger.debug('Running DDL query to initialize temp_cng_pump table if not exists...');
      await this.pool.query(createQuery);
      
      logger.debug('Running DDL query to ensure is_cng_available column exists...');
      await this.pool.query(alterQuery);
      
      logger.info('Database table temp_cng_pump verified/initialized successfully.');
    } catch (err: unknown) {
      errorHandler.handleError(err, { context: 'Database table creation/alteration' });
    }
  }

  /**
   * Executes a database query.
   */
  public async query(text: string, params?: unknown[]): Promise<pg.QueryResult> {
    return this.pool.query(text, params);
  }

  /**
   * Closes the connection pool gracefully on application shutdown.
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down PostgreSQL database connection pool...');
    try {
      await this.pool.end();
      logger.info('PostgreSQL database connection pool closed.');
    } catch (err: unknown) {
      logger.error({ err }, 'Error occurred closing PostgreSQL connection pool.');
    }
  }
}
