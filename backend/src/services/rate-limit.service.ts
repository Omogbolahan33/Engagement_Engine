import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('rate-limit');

/**
 * Per-Engagement Rate Limit Enforcement
 * Uses Redis sliding window to enforce frequency limits
 * Supports per-minute, per-hour, per-day, per-week, and total limits
 */

interface FrequencyConfig {
  maxPerMinute?: number;
  maxPerHour?: number;
  maxPerDay?: number;
  maxPerWeek?: number;
  maxTotal?: number;
  cooldownMs?: number;
  jitterMs?: number;
}

interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
  currentCounts: {
    perMinute: number;
    perHour: number;
    perDay: number;
    perWeek: number;
    total: number;
  };
}

export class RateLimitService {
  /**
   * Check if an engagement can execute now
   */
  async checkEngagementLimit(engagementId: string): Promise<RateLimitResult> {
    const engagement = await prisma.engagement.findUnique({
      where: { id: engagementId },
    });

    if (!engagement) {
      return { allowed: false, reason: 'Engagement not found', currentCounts: { perMinute: 0, perHour: 0, perDay: 0, perWeek: 0, total: 0 } };
    }

    const freq = engagement.frequency as FrequencyConfig;
    const now = Date.now();

    // Check cooldown
    if (freq.cooldownMs && freq.cooldownMs > 0) {
      const lastRunKey = `ratelimit:eng:${engagementId}:lastRun`;
      const lastRun = await redis.get(lastRunKey);
      if (lastRun) {
        const elapsed = now - parseInt(lastRun);
        if (elapsed < freq.cooldownMs) {
          return {
            allowed: false,
            reason: `Cooldown active (${Math.ceil((freq.cooldownMs - elapsed) / 1000)}s remaining)`,
            retryAfterMs: freq.cooldownMs - elapsed,
            currentCounts: { perMinute: 0, perHour: 0, perDay: 0, perWeek: 0, total: 0 },
          };
        }
      }
    }

    // Check total limit
    if (freq.maxTotal) {
      const totalRuns = await prisma.engagementRun.count({
        where: { engagementId },
      });
      if (totalRuns >= freq.maxTotal) {
        return {
          allowed: false,
          reason: `Total limit reached (${freq.maxTotal})`,
          currentCounts: { perMinute: 0, perHour: 0, perDay: 0, perWeek: 0, total: totalRuns },
        };
      }
    }

    // Sliding window checks
    const windows = [
      { key: 'minute', ms: 60_000, limit: freq.maxPerMinute || 1 },
      { key: 'hour', ms: 3_600_000, limit: freq.maxPerHour || 10 },
      { key: 'day', ms: 86_400_000, limit: freq.maxPerDay || 100 },
      { key: 'week', ms: 604_800_000, limit: freq.maxPerWeek || 500 },
    ];

    const counts: Record<string, number> = {};

    for (const window of windows) {
      const redisKey = `ratelimit:eng:${engagementId}:${window.key}`;
      const windowStart = now - window.ms;

      // Sliding window with sorted sets
      const multi = redis.multi();
      multi.zremrangebyscore(redisKey, 0, windowStart);
      multi.zcard(redisKey);
      multi.pexpire(redisKey, window.ms);
      const results = await multi.exec();
      const count = (results?.[1]?.[1] as number) || 0;
      counts[window.key] = count;

      if (count >= window.limit) {
        // Find when the oldest entry in window expires
        const oldest = await redis.zrange(redisKey, 0, 0, 'WITHSCORES');
        const retryAfterMs = oldest.length >= 2
          ? parseInt(oldest[1]) + window.ms - now
          : window.ms;

        return {
          allowed: false,
          reason: `${window.key} limit reached (${count}/${window.limit})`,
          retryAfterMs,
          currentCounts: {
            perMinute: counts.minute || 0,
            perHour: counts.hour || 0,
            perDay: counts.day || 0,
            perWeek: counts.week || 0,
            total: 0,
          },
        };
      }
    }

    return {
      allowed: true,
      currentCounts: {
        perMinute: counts.minute || 0,
        perHour: counts.hour || 0,
        perDay: counts.day || 0,
        perWeek: counts.week || 0,
        total: 0,
      },
    };
  }

  /**
   * Record an execution in all rate limit windows
   */
  async recordExecution(engagementId: string): Promise<void> {
    const now = Date.now();
    const jitter = Math.floor(Math.random() * 5000); // Small jitter for sorted set uniqueness
    const member = `${now}:${jitter}`;

    const windows = ['minute', 'hour', 'day', 'week'];
    const multi = redis.multi();

    for (const window of windows) {
      const key = `ratelimit:eng:${engagementId}:${window}`;
      multi.zadd(key, (now + jitter).toString(), member);
    }

    // Record last run timestamp for cooldown
    multi.set(`ratelimit:eng:${engagementId}:lastRun`, now.toString());
    multi.pexpire(`ratelimit:eng:${engagementId}:lastRun`, 86_400_000); // 24h TTL

    await multi.exec();
  }

  /**
   * Calculate jitter delay (random delay to appear human)
   */
  calculateJitter(jitterMs: number): number {
    if (jitterMs <= 0) return 0;
    return Math.floor(Math.random() * jitterMs);
  }

  /**
   * Calculate backoff delay for retries
   */
  calculateBackoff(
    strategy: string,
    retryCount: number,
    baseDelayMs: number
  ): number {
    switch (strategy) {
      case 'LINEAR':
        return baseDelayMs * retryCount;
      case 'EXPONENTIAL':
        return baseDelayMs * Math.pow(2, retryCount);
      case 'FIBONACCI': {
        const fib = (n: number): number => (n <= 1 ? n : fib(n - 1) + fib(n - 2));
        return baseDelayMs * fib(retryCount + 1);
      }
      case 'NONE':
      default:
        return baseDelayMs;
    }
  }
}

export const rateLimitService = new RateLimitService();
