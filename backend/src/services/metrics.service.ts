import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('metrics');

/**
 * Detailed metrics for every engagement execution
 * Tracks success/failure, response codes, timing, reasons, and trends
 */

export interface EngagementMetrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  avgResponseTimeMs: number;
  p50ResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;
  runsByStatus: Record<string, number>;
  runsByHour: Array<{ hour: string; count: number; success: number; failed: number }>;
  topErrors: Array<{ error: string; count: number; lastOccurred: Date }>;
  runsByEngagementType: Array<{ type: string; total: number; successful: number; failed: number }>;
  credentialHealth: Array<{ credentialId: string; name: string; authType: string; lastUsed: Date | null; failureCount: number; status: string }>;
  timeline: Array<{ date: string; total: number; successful: number; failed: number; avgResponseTime: number }>;
}

export interface RunDetail {
  id: string;
  engagementId: string;
  engagementName: string;
  engagementType: string;
  siteId: string;
  siteName: string;
  platform: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  httpStatusCode: number | null;
  requestUrl: string | null;
  requestMethod: string | null;
  requestHeaders: Record<string, string> | null;
  requestBody: any;
  responseStatus: number | null;
  responseHeaders: Record<string, string> | null;
  responseBody: any;
  errorMessage: string | null;
  errorCode: string | null;
  errorCategory: string | null;
  retryCount: number;
  credentialId: string | null;
  credentialName: string | null;
  credentialAuthType: string | null;
  proxyUsed: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface FailureAnalysis {
  totalFailures: number;
  byCategory: Array<{ category: string; count: number; percentage: number }>;
  byErrorCode: Array<{ code: string; count: number; lastOccurred: Date; sampleMessage: string }>;
  byPlatform: Array<{ platform: string; failures: number; total: number; failureRate: number }>;
  recentFailures: RunDetail[];
  recurringIssues: Array<{ pattern: string; count: number; firstSeen: Date; lastSeen: Date }>;
}

export class MetricsService {
  /**
   * Get comprehensive metrics for an organization
   */
  async getOrganizationMetrics(
    organizationId: string,
    options?: {
      siteId?: string;
      engagementId?: string;
      dateFrom?: Date;
      dateTo?: Date;
      engagementType?: string;
    }
  ): Promise<EngagementMetrics> {
    const where: any = { site: { organizationId } };
    if (options?.siteId) where.siteId = options.siteId;
    if (options?.engagementId) where.engagementId = options.engagementId;
    if (options?.dateFrom || options?.dateTo) {
      where.createdAt = {};
      if (options.dateFrom) where.createdAt.gte = options.dateFrom;
      if (options.dateTo) where.createdAt.lte = options.dateTo;
    }

    const [
      totalRuns,
      successfulRuns,
      failedRuns,
      runsByStatus,
      responseTimeStats,
      runsByHour,
      topErrors,
      runsByEngagementType,
      timeline,
    ] = await Promise.all([
      // Total runs
      prisma.engagementRun.count({ where }),

      // Successful runs
      prisma.engagementRun.count({ where: { ...where, status: 'SUCCESS' } }),

      // Failed runs
      prisma.engagementRun.count({ where: { ...where, status: 'FAILED' } }),

      // Runs by status
      prisma.engagementRun.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),

      // Response time statistics
      prisma.$queryRaw<Array<{ avg: number; p50: number; p95: number; p99: number }>>`
        SELECT
          AVG((metadata->>'responseTime')::int) as avg,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (metadata->>'responseTime')::int) as p50,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (metadata->>'responseTime')::int) as p95,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY (metadata->>'responseTime')::int) as p99
        FROM engagement_runs
        WHERE site_id IN (SELECT id FROM sites WHERE organization_id = ${organizationId})
          AND metadata->>'responseTime' IS NOT NULL
          ${options?.dateFrom ? Prisma.sql`AND created_at >= ${options.dateFrom}` : Prisma.empty}
          ${options?.dateTo ? Prisma.sql`AND created_at <= ${options.dateTo}` : Prisma.empty}
      `,

      // Runs by hour (last 24h)
      prisma.$queryRaw`
        SELECT
          TO_CHAR(created_at, 'HH24:00') as hour,
          COUNT(*) as count,
          COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as success,
          COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed
        FROM engagement_runs
        WHERE site_id IN (SELECT id FROM sites WHERE organization_id = ${organizationId})
          AND created_at > NOW() - INTERVAL '24 hours'
        GROUP BY TO_CHAR(created_at, 'HH24:00')
        ORDER BY hour
      `,

      // Top errors
      prisma.$queryRaw`
        SELECT
          error_message as error,
          COUNT(*) as count,
          MAX(created_at) as last_occurred
        FROM engagement_runs
        WHERE site_id IN (SELECT id FROM sites WHERE organization_id = ${organizationId})
          AND status = 'FAILED'
          AND error_message IS NOT NULL
        GROUP BY error_message
        ORDER BY count DESC
        LIMIT 10
      `,

      // Runs by engagement type
      prisma.$queryRaw`
        SELECT
          e.engagement_type as type,
          COUNT(r.id) as total,
          COUNT(CASE WHEN r.status = 'SUCCESS' THEN 1 END) as successful,
          COUNT(CASE WHEN r.status = 'FAILED' THEN 1 END) as failed
        FROM engagement_runs r
        JOIN engagements e ON r.engagement_id = e.id
        JOIN sites s ON r.site_id = s.id
        WHERE s.organization_id = ${organizationId}
        GROUP BY e.engagement_type
        ORDER BY total DESC
      `,

      // Timeline (last 30 days)
      prisma.$queryRaw`
        SELECT
          TO_CHAR(created_at, 'YYYY-MM-DD') as date,
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as successful,
          COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed,
          AVG((metadata->>'responseTime')::int) as avg_response_time
        FROM engagement_runs
        WHERE site_id IN (SELECT id FROM sites WHERE organization_id = ${organizationId})
          AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
        ORDER BY date
      `,
    ]);

    const statusMap: Record<string, number> = {};
    runsByStatus.forEach((r: any) => { statusMap[r.status] = r._count.id; });

    const rt = responseTimeStats[0] || { avg: 0, p50: 0, p95: 0, p99: 0 };

    return {
      totalRuns,
      successfulRuns,
      failedRuns,
      successRate: totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0,
      avgResponseTimeMs: Math.round(rt.avg || 0),
      p50ResponseTimeMs: Math.round(rt.p50 || 0),
      p95ResponseTimeMs: Math.round(rt.p95 || 0),
      p99ResponseTimeMs: Math.round(rt.p99 || 0),
      runsByStatus: statusMap,
      runsByHour: runsByHour as any[],
      topErrors: topErrors as any[],
      runsByEngagementType: runsByEngagementType as any[],
      credentialHealth: [],
      timeline: timeline as any[],
    };
  }

  /**
   * Get detailed run information with full request/response data
   */
  async getRunDetail(runId: string, organizationId: string): Promise<RunDetail | null> {
    const run = await prisma.engagementRun.findFirst({
      where: {
        id: runId,
        site: { organizationId },
      },
      include: {
        engagement: { select: { name: true, engagementType: true } },
        site: { select: { name: true, platform: true } },
        credential: { select: { name: true, authType: true } },
      },
    });

    if (!run) return null;

    const meta = run.metadata as Record<string, any>;

    return {
      id: run.id,
      engagementId: run.engagementId,
      engagementName: run.engagement.name,
      engagementType: run.engagement.engagementType,
      siteId: run.siteId,
      siteName: run.site.name,
      platform: run.site.platform,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      durationMs: meta?.responseTime || (run.completedAt && run.startedAt
        ? run.completedAt.getTime() - run.startedAt.getTime()
        : null),
      httpStatusCode: meta?.statusCode || null,
      requestUrl: meta?.requestUrl || null,
      requestMethod: meta?.requestMethod || null,
      requestHeaders: meta?.requestHeaders || null,
      requestBody: meta?.requestBody || null,
      responseStatus: meta?.responseStatus || null,
      responseHeaders: meta?.responseHeaders || null,
      responseBody: meta?.responseBody || null,
      errorMessage: run.errorMessage,
      errorCode: meta?.errorCode || null,
      errorCategory: this.categorizeError(run.errorMessage, meta?.statusCode),
      retryCount: run.retryCount,
      credentialId: run.credentialId,
      credentialName: run.credential?.name || null,
      credentialAuthType: run.credential?.authType || null,
      proxyUsed: meta?.proxyUsed || null,
      ipAddress: meta?.ipAddress || null,
      userAgent: meta?.userAgent || null,
      metadata: meta || {},
      createdAt: run.createdAt,
    };
  }

  /**
   * Get paginated run history with filters
   */
  async getRunHistory(
    organizationId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      engagementId?: string;
      siteId?: string;
      engagementType?: string;
      dateFrom?: Date;
      dateTo?: Date;
      errorCategory?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 50, 200);
    const skip = (page - 1) * limit;

    const where: any = { site: { organizationId } };
    if (options.status) where.status = options.status;
    if (options.engagementId) where.engagementId = options.engagementId;
    if (options.siteId) where.siteId = options.siteId;
    if (options.engagementType) where.engagement = { engagementType: options.engagementType };
    if (options.dateFrom || options.dateTo) {
      where.createdAt = {};
      if (options.dateFrom) where.createdAt.gte = options.dateFrom;
      if (options.dateTo) where.createdAt.lte = options.dateTo;
    }

    const orderBy: any = {};
    if (options.sortBy) {
      orderBy[options.sortBy] = options.sortOrder || 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [runs, total] = await Promise.all([
      prisma.engagementRun.findMany({
        where,
        include: {
          engagement: { select: { name: true, engagementType: true } },
          site: { select: { name: true, platform: true } },
          credential: { select: { name: true, authType: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.engagementRun.count({ where }),
    ]);

    return {
      runs: runs.map((run) => {
        const meta = run.metadata as Record<string, any>;
        return {
          id: run.id,
          engagementId: run.engagementId,
          engagementName: run.engagement.name,
          engagementType: run.engagement.engagementType,
          siteName: run.site.name,
          platform: run.site.platform,
          status: run.status,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          durationMs: meta?.responseTime || null,
          httpStatusCode: meta?.statusCode || null,
          errorMessage: run.errorMessage,
          errorCategory: this.categorizeError(run.errorMessage, meta?.statusCode),
          retryCount: run.retryCount,
          credentialName: run.credential?.name || null,
          createdAt: run.createdAt,
        };
      }),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Failure analysis - understand what's going wrong
   */
  async getFailureAnalysis(
    organizationId: string,
    options?: { siteId?: string; dateFrom?: Date; dateTo?: Date }
  ): Promise<FailureAnalysis> {
    const baseWhere = `s.organization_id = '${organizationId}'`;
    const dateFilter = options?.dateFrom
      ? `AND r.created_at >= '${options.dateFrom.toISOString()}'`
      : '';
    const dateFilterEnd = options?.dateTo
      ? `AND r.created_at <= '${options.dateTo.toISOString()}'`
      : '';
    const siteFilter = options?.siteId ? `AND r.site_id = '${options.siteId}'` : '';

    const [totalFailures, byCategory, byErrorCode, byPlatform, recentFailures] = await Promise.all([
      prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM engagement_runs r
        JOIN sites s ON r.site_id = s.id
        WHERE ${baseWhere} AND r.status = 'FAILED' ${dateFilter} ${dateFilterEnd} ${siteFilter}
      `),

      prisma.$queryRawUnsafe(`
        SELECT
          CASE
            WHEN r.error_message ILIKE '%rate limit%' OR r.error_message ILIKE '%429%' THEN 'Rate Limited'
            WHEN r.error_message ILIKE '%auth%' OR r.error_message ILIKE '%401%' OR r.error_message ILIKE '%403%' THEN 'Authentication'
            WHEN r.error_message ILIKE '%timeout%' OR r.error_message ILIKE '%ETIMEDOUT%' THEN 'Timeout'
            WHEN r.error_message ILIKE '%network%' OR r.error_message ILIKE '%ECONNREFUSED%' THEN 'Network'
            WHEN r.error_message ILIKE '%not found%' OR r.error_message ILIKE '%404%' THEN 'Not Found'
            WHEN r.error_message ILIKE '%blocked%' OR r.error_message ILIKE '%captcha%' THEN 'Blocked/Captcha'
            WHEN r.error_message ILIKE '%validation%' OR r.error_message ILIKE '%400%' THEN 'Validation'
            WHEN r.error_message ILIKE '%server%' OR r.error_message ILIKE '%500%' OR r.error_message ILIKE '%502%' OR r.error_message ILIKE '%503%' THEN 'Server Error'
            ELSE 'Other'
          END as category,
          COUNT(*) as count
        FROM engagement_runs r
        JOIN sites s ON r.site_id = s.id
        WHERE ${baseWhere} AND r.status = 'FAILED' ${dateFilter} ${dateFilterEnd} ${siteFilter}
        GROUP BY category
        ORDER BY count DESC
      `),

      prisma.$queryRawUnsafe(`
        SELECT
          COALESCE((r.metadata->>'statusCode')::text, 'unknown') as code,
          COUNT(*) as count,
          MAX(r.created_at) as last_occurred,
          LEFT(MIN(r.error_message), 200) as sample_message
        FROM engagement_runs r
        JOIN sites s ON r.site_id = s.id
        WHERE ${baseWhere} AND r.status = 'FAILED' ${dateFilter} ${dateFilterEnd} ${siteFilter}
        GROUP BY code
        ORDER BY count DESC
        LIMIT 15
      `),

      prisma.$queryRawUnsafe(`
        SELECT
          s.platform,
          COUNT(CASE WHEN r.status = 'FAILED' THEN 1 END) as failures,
          COUNT(*) as total,
          ROUND(COUNT(CASE WHEN r.status = 'FAILED' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as failure_rate
        FROM engagement_runs r
        JOIN sites s ON r.site_id = s.id
        WHERE ${baseWhere} ${dateFilter} ${dateFilterEnd} ${siteFilter}
        GROUP BY s.platform
        HAVING COUNT(*) > 0
        ORDER BY failure_rate DESC
      `),

      prisma.engagementRun.findMany({
        where: {
          site: { organizationId },
          status: 'FAILED',
        },
        include: {
          engagement: { select: { name: true, engagementType: true } },
          site: { select: { name: true, platform: true } },
          credential: { select: { name: true, authType: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const total = (totalFailures as any[])[0]?.count || 0;

    return {
      totalFailures: Number(total),
      byCategory: (byCategory as any[]).map((c) => ({
        category: c.category,
        count: Number(c.count),
        percentage: total > 0 ? (Number(c.count) / Number(total)) * 100 : 0,
      })),
      byErrorCode: byErrorCode as any[],
      byPlatform: byPlatform as any[],
      recentFailures: recentFailures.map((run: any) => {
        const meta = run.metadata as Record<string, any>;
        return {
          id: run.id,
          engagementId: run.engagementId,
          engagementName: run.engagement.name,
          engagementType: run.engagement.engagementType,
          siteId: run.siteId,
          siteName: run.site.name,
          platform: run.site.platform,
          status: run.status,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          durationMs: meta?.responseTime || null,
          httpStatusCode: meta?.statusCode || null,
          requestUrl: meta?.requestUrl || null,
          requestMethod: meta?.requestMethod || null,
          requestHeaders: null,
          requestBody: null,
          responseStatus: meta?.responseStatus || null,
          responseHeaders: null,
          responseBody: meta?.responseBody || null,
          errorMessage: run.errorMessage,
          errorCode: meta?.errorCode || null,
          errorCategory: this.categorizeError(run.errorMessage, meta?.statusCode),
          retryCount: run.retryCount,
          credentialId: run.credentialId,
          credentialName: run.credential?.name || null,
          credentialAuthType: run.credential?.authType || null,
          proxyUsed: null,
          ipAddress: null,
          userAgent: null,
          metadata: meta || {},
          createdAt: run.createdAt,
        };
      }),
      recurringIssues: [],
    };
  }

  /**
   * Categorize errors for analysis
   */
  private categorizeError(message: string | null, statusCode?: number): string {
    if (!message && !statusCode) return 'Unknown';

    const msg = (message || '').toLowerCase();
    const code = statusCode || 0;

    if (code === 429 || msg.includes('rate limit')) return 'Rate Limited';
    if (code === 401 || code === 403 || msg.includes('auth') || msg.includes('unauthorized')) return 'Authentication';
    if (code === 404 || msg.includes('not found')) return 'Not Found';
    if (code === 400 || msg.includes('validation') || msg.includes('bad request')) return 'Validation';
    if (code >= 500 || msg.includes('server error') || msg.includes('internal')) return 'Server Error';
    if (msg.includes('timeout') || msg.includes('etimedout')) return 'Timeout';
    if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('econnreset')) return 'Network';
    if (msg.includes('blocked') || msg.includes('captcha') || msg.includes('challenge')) return 'Blocked';
    if (msg.includes('expired') || msg.includes('token')) return 'Token Expired';

    return 'Other';
  }
}

export const metricsService = new MetricsService();
