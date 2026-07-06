import { Sequelize } from 'sequelize';
import { config } from '../../config/index.js';
import { logger } from '../../logger/index.js';
import { errorHandler } from '../../errors/error-handler.js';
import pg from 'pg';
import { initStationModel } from './models/station-model.js';
import { initPendingMessageModel, PendingMessage } from './models/pending-message-model.js';

export class DatabaseService {
  private sequelize: Sequelize;

  constructor() {
    const isRDS = config.DB_HOST.includes('rds.amazonaws.com');
    const ssl = isRDS ? { rejectUnauthorized: false } : undefined;

    this.sequelize = new Sequelize(config.DB_NAME, config.DB_USER, config.DB_PASSWORD, {
      host: config.DB_HOST,
      port: config.DB_PORT,
      dialect: 'postgres',
      dialectModule: pg,
      logging: (msg) => logger.debug(msg),
      dialectOptions: ssl
        ? {
            ssl: {
              require: true,
              rejectUnauthorized: false,
            },
          }
        : undefined,
      pool: {
        max: 10,
        min: 2,
        acquire: 30000,
        idle: 10000,
      },
    });
  }

  /**
   * Initializes the database connection pool and registers models.
   */
  public async initialize(): Promise<void> {
    logger.info('Connecting to PostgreSQL database using Sequelize ORM...');
    try {
      await this.sequelize.authenticate();
      logger.info('Successfully connected to PostgreSQL database via Sequelize.');

      // Initialize models
      initStationModel(this.sequelize);
      initPendingMessageModel(this.sequelize);

      // Only sync the pending messages queue table (does not touch or sync the stations table)
      await PendingMessage.sync();
      logger.info('Database queue table temp_pending_messages verified.');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Sequelize database initialization failed: ${errMsg}`, { cause: err });
    }
  }

  /**
   * Retrieves the raw Sequelize instance.
   */
  public getSequelize(): Sequelize {
    return this.sequelize;
  }

  /**
   * Closes the Sequelize pool gracefully on application shutdown.
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down PostgreSQL database Sequelize connection pool...');
    try {
      await this.sequelize.close();
      logger.info('PostgreSQL database Sequelize connection pool closed.');
    } catch (err: unknown) {
      errorHandler.handleError(err, { context: 'Sequelize pool shutdown' });
    }
  }
}
