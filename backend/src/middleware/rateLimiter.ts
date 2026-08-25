import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { config } from '../config';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('rate-limiter');

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Sliding window rate limiter using Redis
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowMs;

  const multi = redis.multi();
  multi.zremrangebyscore(key, 0, windowStart);
  multi.zadd(key, now.toString(), `${now}-${Math.random()}`);
  multi.zcard(key);
  multi.pexpire(key, windowMs);

  const results = await multi.exec();
  const count = results?.[2]?.[1] as number || 0;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: now + windowMs,
  };
}

/**
 * Express rate limiting middleware
 */
export function rateLimiter(
  limit: number = config.rateLimit.maxRequests,
  windowMs: number = config.rateLimit.windowMs
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identifier = req.ip || req.socket.remoteAddress || 'unknown';
      const key = `ratelimit:${identifier}`;

      const result = await checkRateLimit(key, limit, windowMs);

      res.set({
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
      });

      if (!result.allowed) {
        res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
        });
        return;
      }

      next();
    } catch (error) {
      log.error('Rate limiter error', { error });
      next(); // Fail open
    }
  };
}
