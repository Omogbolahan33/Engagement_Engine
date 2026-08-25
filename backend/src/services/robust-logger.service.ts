import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('robust-logger');

/**
 * Robust Engagement Logging Service
 * Comprehensive logging for every engagement action with:
 * - Structured log entries with correlation IDs
 * - Request/response capture
 * - Performance metrics
 * - Error categorization
 * - Log search and filtering
 * - Log retention and rotation
 * - Real-time log streaming via Redis pub/sub
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  correlationId?: string;
  engagementId?: string;
  engagementName?: string;
  siteId?: string;
  siteName?: string;
  platform?: string;
  action: string;
  message: string;
  data?: Record<string, any>;
  request?: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    ip?: string;
  };
  response?: {
    statusCode?: number;
    headers?: Record<string, string>;
    body?: any;
    responseTimeMs?: number;
  };
  error?: {
    message: string;
    code?: string;
    category?: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
}

export interface LogSearchOptions {
  engagementId?: string;
  siteId?: string;
  level?: LogLevel;
  action?: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  correlationId?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export class RobustLoggerService {
  private readonly LOG_KEY_PREFIX = 'logs:';
  private readonly STREAM_KEY = 'logs:stream';
  private readonly RETENTION_DAYS = 90;

  /**
   * Log an engagement action
   */
  async log(entry: Omit<LogEntry, 'id' | 'timestamp'>): Promise<LogEntry> {
    const id = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = new Date();

    const fullEntry: LogEntry = {
      id,
      timestamp,
      ...entry,
    };

    // Store in database
    try {
      await prisma.engagementLog.create({
        data: {
          engagementId: entry.engagementId || '',
          level: entry.level,
          message: entry.message,
          data: {
            ...fullEntry,
            // Don't store huge response bodies in DB
            response: entry.response ? {
              statusCode: entry.response.statusCode,
              responseTimeMs: entry.response.responseTimeMs,
            } : undefined,
          },
        },
      });
    } catch (error: any) {
      // Don't fail the main operation if logging fails
      log.error('Failed to write log to database', { error: error.message });
    }

    // Store in Redis for real-time access and search
    try {
      const redisKey = `${this.LOG_KEY_PREFIX}${entry.engagementId || 'system'}`;
      await redis.lpush(redisKey, JSON.stringify(fullEntry));
      await redis.ltrim(redisKey, 0, 999); // Keep last 1000 per engagement
      await redis.expire(redisKey, this.RETENTION_DAYS * 86400);

      // Publish to stream for real-time subscribers
      await redis.publish(this.STREAM_KEY, JSON.stringify(fullEntry));
    } catch (error: any) {
      log.error('Failed to write log to Redis', { error: error.message });
    }

    return fullEntry;
  }

  /**
   * Log a successful engagement execution
   */
  async logSuccess(params: {
    engagementId: string;
    engagementName?: string;
    siteId?: string;
    siteName?: string;
    platform?: string;
    action: string;
    message: string;
    request?: LogEntry['request'];
    response?: LogEntry['response'];
    correlationId?: string;
    data?: Record<string, any>;
  }): Promise<LogEntry> {
    return this.log({
      level: 'INFO',
      ...params,
      data: {
        ...params.data,
        success: true,
      },
    });
  }

  /**
   * Log a failed engagement execution
   */
  async logFailure(params: {
    engagementId: string;
    engagementName?: string;
    siteId?: string;
    siteName?: string;
    platform?: string;
    action: string;
    message: string;
    error: { message: string; code?: string; category?: string; stack?: string };
    request?: LogEntry['request'];
    response?: LogEntry['response'];
    correlationId?: string;
    data?: Record<string, any>;
  }): Promise<LogEntry> {
    return this.log({
      level: 'ERROR',
      ...params,
      data: {
        ...params.data,
        success: false,
      },
    });
  }

  /**
   * Log rate limiting event
   */
  async logRateLimit(params: {
    engagementId: string;
    siteId?: string;
    platform?: string;
    limitType: string;
    current: number;
    limit: number;
    retryAfterMs?: number;
  }): Promise<LogEntry> {
    return this.log({
      level: 'WARN',
      engagementId: params.engagementId,
      siteId: params.siteId,
      platform: params.platform,
      action: 'RATE_LIMITED',
      message: `Rate limited: ${params.limitType} (${params.current}/${params.limit})`,
      data: params,
    });
  }

  /**
   * Log credential event
   */
  async logCredentialEvent(params: {
    engagementId?: string;
    siteId?: string;
    credentialId: string;
    event: 'refreshed' | 'expired' | 'invalid' | 'created' | 'deleted';
    message: string;
    data?: Record<string, any>;
  }): Promise<LogEntry> {
    return this.log({
      level: params.event === 'expired' || params.event === 'invalid' ? 'WARN' : 'INFO',
      engagementId: params.engagementId,
      siteId: params.siteId,
      action: `CREDENTIAL_${params.event.toUpperCase()}`,
      message: params.message,
      data: { credentialId: params.credentialId, ...params.data },
    });
  }

  /**
   * Log guard event (auto-pause, block detection, etc.)
   */
  async logGuardEvent(params: {
    engagementId: string;
    siteId?: string;
    event: string;
    message: string;
    data?: Record<string, any>;
  }): Promise<LogEntry> {
    return this.log({
      level: 'WARN',
      engagementId: params.engagementId,
      siteId: params.siteId,
      action: `GUARD_${params.event.toUpperCase()}`,
      message: params.message,
      data: params.data,
    });
  }

  /**
   * Search logs with filters
   */
  async search(organizationId: string, options: LogSearchOptions) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 50, 200);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (options.engagementId) {
      where.engagementId = options.engagementId;
    }

    if (options.level) {
      where.level = options.level;
    }

    if (options.dateFrom || options.dateTo) {
      where.createdAt = {};
      if (options.dateFrom) where.createdAt.gte = options.dateFrom;
      if (options.dateTo) where.createdAt.lte = options.dateTo;
    }

    if (options.search) {
      where.message = { contains: options.search, mode: 'insensitive' };
    }

    // Filter by organization through engagement → site
    if (organizationId) {
      where.engagement = { site: { organizationId } };
    }

    const [logs, total] = await Promise.all([
      prisma.engagementLog.findMany({
        where,
        orderBy: { createdAt: options.sortOrder || 'desc' },
        skip,
        take: limit,
      }),
      prisma.engagementLog.count({ where }),
    ]);

    return {
      logs: logs.map((l) => ({
        id: l.id,
        timestamp: l.createdAt,
        level: l.level,
        engagementId: l.engagementId,
        message: l.message,
        data: l.data,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get recent logs for an engagement (from Redis for speed)
   */
  async getRecentLogs(engagementId: string, limit: number = 50): Promise<LogEntry[]> {
    const key = `${this.LOG_KEY_PREFIX}${engagementId}`;
    const entries = await redis.lrange(key, 0, limit - 1);
    return entries.map((e) => JSON.parse(e));
  }

  /**
   * Get log statistics for an engagement
   */
  async getLogStats(engagementId: string, hours: number = 24) {
    const since = new Date(Date.now() - hours * 3600000);

    const stats = await prisma.$queryRaw`
      SELECT
        level,
        COUNT(*) as count
      FROM engagement_logs
      WHERE engagement_id = ${engagementId}
        AND created_at >= ${since}
      GROUP BY level
    `;

    const total = (stats as any[]).reduce((sum, s) => sum + Number(s.count), 0);

    return {
      total,
      byLevel: Object.fromEntries(
        (stats as any[]).map((s) => [s.level, Number(s.count)])
      ),
      periodHours: hours,
    };
  }

  /**
   * Clean old logs (called by retention service)
   */
  async cleanOldLogs(days: number = 90): Promise<number> {
    const cutoff = new Date(Date.now() - days * 86400000);
    const { count } = await prisma.engagementLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (count > 0) {
      log.info(`Cleaned ${count} old log entries`);
    }

    return count;
  }
}

export const robustLogger = new RobustLoggerService();
