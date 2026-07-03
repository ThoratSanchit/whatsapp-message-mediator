import pino from 'pino';
import { config } from '../config/index.js';

const isDev = config.NODE_ENV === 'development';

const targets: pino.TransportTargetOptions[] = [
  {
    target: 'pino/file',
    options: {
      destination: `${config.LOG_PATH}/app.log`,
      mkdir: true,
    },
    level: config.LOG_LEVEL,
  },
];

if (isDev) {
  targets.push({
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
    },
    level: config.LOG_LEVEL,
  });
} else {
  targets.push({
    target: 'pino/file',
    options: {
      destination: 1, // stdout (raw JSON)
    },
    level: config.LOG_LEVEL,
  });
}

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: {
    targets,
  },
});
