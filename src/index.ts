import { logger } from './logger/index.js';
import { GroupCache } from './services/whatsapp/group-cache.js';
import { MessageHandler } from './handlers/message-handler.js';
import { WhatsAppListener } from './services/whatsapp/listener.js';
import { WhatsAppClient } from './services/whatsapp/client.js';
import { DatabaseService } from './services/database/index.js';
import { errorHandler } from './errors/error-handler.js';

async function bootstrap() {
  logger.info('🚀 Starting WhatsApp Group Listener application...');

  // Initialize Database Service (PostgreSQL)
  const dbService = new DatabaseService();
  await dbService.initialize();

  // Initialize JID-to-Name caching service
  const groupCache = new GroupCache();

  // eslint-disable-next-line prefer-const
  let client: WhatsAppClient;

  // Create socket provider wrapper to allow MessageHandler to lazily retrieve
  // the socket instance from WhatsAppClient without circular dependencies.
  const socketProvider = {
    getSock(): import('@whiskeysockets/baileys').WASocket | null {
      return client ? client.getSock() : null;
    },
  };

  // Instantiate handlers & event listeners
  const messageHandler = new MessageHandler(groupCache, socketProvider);
  await messageHandler.initialize();
  const listener = new WhatsAppListener(messageHandler);

  // Instantiate main client connection manager
  client = new WhatsAppClient(listener);

  // Define shutdown hook
  const handleShutdown = async (signal: string) => {
    logger.info(`Received signal: ${signal}. Initiating graceful shutdown...`);
    try {
      await client.shutdown();
      await dbService.shutdown();
      logger.info('Graceful shutdown finished. Exiting process.');
      process.exit(0);
    } catch (err) {
      errorHandler.handleError(err, { context: `Graceful shutdown on ${signal}` });
      process.exit(1);
    }
  };

  // Register process termination handlers
  process.on('SIGINT', () => {
    handleShutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    handleShutdown('SIGTERM');
  });

  // Register catch-all error listeners
  process.on('uncaughtException', (err) => {
    errorHandler.handleError(err, { context: 'Uncaught Exception' });
  });

  process.on('unhandledRejection', (reason) => {
    errorHandler.handleError(reason, { context: 'Unhandled Promise Rejection' });
  });

  // Start the connection process
  await client.connect();
}

bootstrap().catch((err) => {
  errorHandler.handleError(err, { context: 'Application bootstrap' });
  process.exit(1);
});
