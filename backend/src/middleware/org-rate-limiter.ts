import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { redis } from '../config/redis';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('org-rate-limiter');

/**
 * Per-Organization Rate Limiter
 * Prevents one organization from consuming all resources
 * Different limits per plan tier
 */

const PLAN_LIMITS: Record<string, { requestsPerMinute: number; requestsPerHour: number }> = {
  FREE: { requestsPerMinute: 10, requestsPerHour: 200 },
  STARTER: { requestsPerMinute: 30, requestsPerHour: 1000 },
  PROFESSIONAL: { requestsPerMinute: 60, requestsPerHour: 3000 },
  ENTERPRISE: { requestsPerMinute: 120, requestsPerHour: 10000 },
};

export function orgRateLimiter() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const orgId = req.user?.organizationId || req.apiKey?.organizationId;
    if (!orgId) {
      next();
      return;
    }

    // Get org plan (cached in Redis)
    let plan = await redis.get(`org:plan:${orgId}`);
    if (!plan) {
      const { prisma } = await import('../config/database');
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { plan: true },
      });
      plan = org?.plan || 'FREE';
      await redis.setex(`org:plan:${orgId}`, 300, plan); // Cache 5 min
    }

    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS['FREE'];
    const now = Date.now();

    // Check per-minute limit
    const minuteKey = `org:ratelimit:${orgId}:minute`;
    const minuteCount = await redis.incr(minuteKey);
    if (minuteCount === 1) {
      await redis.expire(minuteKey, 60);
    }

    if (minuteCount > limits.requestsPerMinute) {
      res.status(429).json({
        error: 'Organization rate limit exceeded',
        retryAfter: 60,
        limit: limits.requestsPerMinute,
        plan,
      });
      return;
    }

    // Check per-hour limit
    const hourKey = `org:ratelimit:${orgId}:hour`;
    const hourCount = await redis.incr(hourKey);
    if (hourCount === 1) {
      await redis.expire(hourKey, 3600);
    }

    if (hourCount > limits.requestsPerHour) {
      res.status(429).json({
        error: 'Organization hourly rate limit exceeded',
        retryAfter: 3600,
        limit: limits.requestsPerHour,
        plan,
      });
      return;
    }

    // Set rate limit headers
    res.set({
      'X-Org-RateLimit-Limit': limits.requestsPerMinute.toString(),
      'X-Org-RateLimit-Remaining': Math.max(0, limits.requestsPerMinute - minuteCount).toString(),
      'X-Org-RateLimit-Plan': plan,
    });

    next();
  };
}
