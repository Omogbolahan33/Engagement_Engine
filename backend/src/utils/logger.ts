import winston from 'winston';
import { config } from '../config';

/**
 * An Error's `message` and `stack` are non-enumerable, so JSON.stringify renders
 * a caught error as `{}` — which is how a fatal worker startup failure logged as
 * `{"error":{}}` and told us nothing. Unwrap Errors explicitly.
 */
function errorReplacer(_key: string, value: unknown) {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack,
      ...(value as unknown as Record<string, unknown>),
    };
  }
  return value;
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json({ replacer: errorReplacer })
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta, errorReplacer)}` : '';
    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);

export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: 'engagement-platform' },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
    new winston.transports.File({
      filename: config.logging.file,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

export function createContextLogger(context: string) {
  return logger.child({ context });
}
