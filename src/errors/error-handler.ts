import { logger } from '../logger/index.js';
import { AppError } from './app-error.js';

export const errorHandler = {
  handleError(error: unknown, context?: Record<string, unknown>): void {
    if (error instanceof AppError) {
      logger.error(
        {
          err: {
            name: error.name,
            message: error.message,
            stack: error.stack,
            context: { ...error.context, ...context },
          },
          isOperational: error.isOperational,
        },
        `[${error.name}] ${error.message}`,
      );

      if (!error.isOperational) {
        logger.fatal('Fatal error encountered. System shutting down.');
        process.exit(1);
      }
    } else if (error instanceof Error) {
      logger.error(
        {
          err: {
            name: error.name,
            message: error.message,
            stack: error.stack,
            context,
          },
          isOperational: false,
        },
        `[UnhandledError] ${error.message}`,
      );
    } else {
      logger.error(
        {
          err: {
            message: String(error),
            context,
          },
          isOperational: false,
        },
        'An unknown error occurred',
      );
    }
  },
};
export default errorHandler;
