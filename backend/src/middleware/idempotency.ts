import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('idempotency');

/**
 * Idempotency Middleware
 * Prevents duplicate processing of the same request
 *
 * Client sends: Idempotency-Key: <unique-key>
 * Server checks Redis: if key exists, return cached response
 * If not, process request and cache the response
 */

const IDEMPOTENCY_TTL = 86400; // 24 hours

export function idempotency() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only for mutating operations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      next();
      return;
    }

    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (!idempotencyKey) {
      next();
      return;
    }

    const redisKey = `idempotency:${idempotencyKey}`;

    try {
      // Check if we've seen this key before
      const cached = await redis.get(redisKey);

      if (cached) {
        const { statusCode, body } = JSON.parse(cached);
        log.debug('Returning cached idempotent response', { key: idempotencyKey });
        res.status(statusCode).json(body);
        return;
      }

      // Intercept the response to cache it
      const originalJson = res.json.bind(res);
      res.json = function (body: any) {
        // Cache the response
        redis.setex(
          redisKey,
          IDEMPOTENCY_TTL,
          JSON.stringify({ statusCode: res.statusCode, body })
        ).catch((err) => log.error('Failed to cache idempotent response', { error: err.message }));

        return originalJson(body);
      };

      next();
    } catch (error) {
      // Don't block on idempotency errors
      next();
    }
  };
}
