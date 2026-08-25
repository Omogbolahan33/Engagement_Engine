import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { engagementQueue, scheduledQueue } from './queue.service';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('health');

/**
 * Health Check Service
 * Deep health checks for all dependencies
 */

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
    queue: ComponentHealth;
    workers: ComponentHealth;
  };
}

interface ComponentHealth {
  status: 'up' | 'down' | 'degraded';
  latencyMs?: number;
  details?: Record<string, any>;
  error?: string;
}

export class HealthService {
  private startTime = Date.now();

  /**
   * Full health check
   */
  async check(): Promise<HealthCheckResult> {
    const [database, redisCheck, queue, workers] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkQueue(),
      this.checkWorkers(),
    ]);

    const allUp = [database, redisCheck, queue, workers].every((c) => c.status === 'up');
    const anyDown = [database, redisCheck, queue, workers].some((c) => c.status === 'down');

    return {
      status: anyDown ? 'unhealthy' : allUp ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: '1.0.0',
      checks: {
        database,
        redis: redisCheck,
        queue,
        workers,
      },
    };
  }

  /**
   * Quick liveness check (for load balancers)
   */
  async liveness(): Promise<{ status: string }> {
    return { status: 'ok' };
  }

  /**
   * Readiness check (can accept traffic?)
   */
  async readiness(): Promise<{ ready: boolean; checks: Record<string, boolean> }> {
    const [dbOk, redisOk] = await Promise.all([
      this.checkDatabase().then((c) => c.status === 'up'),
      this.checkRedis().then((c) => c.status === 'up'),
    ]);

    return {
      ready: dbOk && redisOk,
      checks: { database: dbOk, redis: redisOk },
    };
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: 'up',
        latencyMs: Date.now() - start,
      };
    } catch (error: any) {
      return { status: 'down', error: error.message, latencyMs: Date.now() - start };
    }
  }

  private async checkRedis(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const pong = await redis.ping();
      return {
        status: pong === 'PONG' ? 'up' : 'down',
        latencyMs: Date.now() - start,
      };
    } catch (error: any) {
      return { status: 'down', error: error.message, latencyMs: Date.now() - start };
    }
  }

  private async checkQueue(): Promise<ComponentHealth> {
    try {
      const [engWaiting, engActive, engFailed, schedWaiting] = await Promise.all([
        engagementQueue.getWaitingCount(),
        engagementQueue.getActiveCount(),
        engagementQueue.getFailedCount(),
        scheduledQueue.getWaitingCount(),
      ]);

      const isDegraded = engFailed > 100;

      return {
        status: isDegraded ? 'degraded' : 'up',
        details: {
          engagement: { waiting: engWaiting, active: engActive, failed: engFailed },
          scheduled: { waiting: schedWaiting },
        },
      };
    } catch (error: any) {
      return { status: 'down', error: error.message };
    }
  }

  private async checkWorkers(): Promise<ComponentHealth> {
    try {
      const workers = await engagementQueue.getWorkers();
      return {
        status: workers.length > 0 ? 'up' : 'degraded',
        details: { activeWorkers: workers.length },
      };
    } catch (error: any) {
      return { status: 'down', error: error.message };
    }
  }
}

export const healthService = new HealthService();
