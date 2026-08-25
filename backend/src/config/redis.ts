import Redis from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

const baseOptions = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
};

/**
 * General-purpose client: rate limiting, caching, pub/sub publishing.
 * Commands here should fail fast rather than hang, so retries are bounded.
 */
export const redis = new Redis({
  ...baseOptions,
  maxRetriesPerRequest: 3,
});

/**
 * Dedicated connection for BullMQ.
 *
 * BullMQ workers issue blocking commands (BRPOPLPUSH) that intentionally wait
 * indefinitely for a job, and it refuses to start unless maxRetriesPerRequest is
 * null — a bounded retry count would abort the block and kill the worker. That
 * is the wrong setting for ordinary commands, so queues get their own client
 * rather than changing the shared one.
 */
export const bullConnection = new Redis({
  ...baseOptions,
  maxRetriesPerRequest: null,
});

bullConnection.on('error', (err) => {
  logger.error('Redis (BullMQ) error', { error: err.message });
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error('Redis error', { error: err.message });
});

export async function connectRedis(): Promise<void> {
  await redis.ping();
  logger.info('Redis ping successful');
}

export async function disconnectRedis(): Promise<void> {
  // Both clients must be closed or the process will not exit cleanly.
  await Promise.allSettled([redis.quit(), bullConnection.quit()]);
  logger.info('Redis disconnected');
}
