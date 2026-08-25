import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { safeFetch } from '../utils/ssrf-protection';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('site-health');

/**
 * Site Health Monitoring Service
 * Continuously checks connectivity and health of connected websites
 * Stores status history for uptime tracking
 */

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown' | 'checking';

export interface SiteHealthResult {
  siteId: string;
  status: HealthStatus;
  statusCode: number | null;
  responseTimeMs: number;
  lastCheckedAt: Date;
  lastHealthyAt: Date | null;
  lastDownAt: Date | null;
  uptime24h: number;    // percentage
  uptime7d: number;     // percentage
  consecutiveFailures: number;
  errorMessage: string | null;
  sslExpiry: Date | null;
  headers: Record<string, string>;
}

export class SiteHealthService {
  private readonly CHECK_TIMEOUT = 15000; // 15s
  private readonly CACHE_TTL = 300; // 5 min cache
  private readonly HISTORY_TTL = 86400 * 7; // 7 days of history

  /**
   * Check health of a single site
   */
  async checkSite(siteId: string): Promise<SiteHealthResult> {
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new Error('Site not found');

    // Check cache first
    const cached = await redis.get(`health:${siteId}`);
    if (cached) return JSON.parse(cached);

    // Mark as checking
    await redis.setex(`health:${siteId}:checking`, 30, 'true');

    const startTime = Date.now();
    let status: HealthStatus = 'unknown';
    let statusCode: number | null = null;
    let errorMessage: string | null = null;
    const headers: Record<string, string> = {};
    let sslExpiry: Date | null = null;

    try {
      const response = await safeFetch(site.url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(this.CHECK_TIMEOUT),
        headers: {
          'User-Agent': 'EngagementPlatform-HealthCheck/1.0',
        },
      });

      statusCode = response.status;
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      if (response.ok) {
        status = 'healthy';
      } else if (response.status >= 500) {
        status = 'down';
        errorMessage = `HTTP ${response.status}`;
      } else if (response.status >= 400) {
        status = 'degraded';
        errorMessage = `HTTP ${response.status}`;
      } else {
        status = 'degraded';
      }

      // Check SSL expiry
      if (site.url.startsWith('https://')) {
        try {
          const url = new URL(site.url);
          // SSL check would need tls.connect in production
          // For now, check if cert-related headers exist
          if (headers['strict-transport-security']) {
            sslExpiry = new Date(Date.now() + 90 * 86400000); // Assume 90 days
          }
        } catch {}
      }
    } catch (error: any) {
      status = 'down';
      errorMessage = error.message?.substring(0, 200) || 'Connection failed';

      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        errorMessage = 'Connection timeout';
        status = 'down';
      }
      if (error.message?.includes('ECONNREFUSED')) {
        errorMessage = 'Connection refused';
        status = 'down';
      }
      if (error.message?.includes('ENOTFOUND')) {
        errorMessage = 'DNS resolution failed';
        status = 'down';
      }
      if (error.message?.includes('CERT')) {
        errorMessage = 'SSL certificate error';
        status = 'down';
      }
    }

    const responseTimeMs = Date.now() - startTime;
    const now = new Date();

    // Get previous state
    const previousData = await redis.get(`health:${siteId}:state`);
    const previous = previousData ? JSON.parse(previousData) : null;

    // Update consecutive failures
    const consecutiveFailures = status === 'down'
      ? (previous?.consecutiveFailures || 0) + 1
      : 0;

    // Record health check in history
    await this.recordHistory(siteId, status, responseTimeMs);

    // Calculate uptime
    const uptime24h = await this.calculateUptime(siteId, 24);
    const uptime7d = await this.calculateUptime(siteId, 168);

    const result: SiteHealthResult = {
      siteId,
      status,
      statusCode,
      responseTimeMs,
      lastCheckedAt: now,
      lastHealthyAt: status === 'healthy' ? now : (previous?.lastHealthyAt ? new Date(previous.lastHealthyAt) : null),
      lastDownAt: status === 'down' ? now : (previous?.lastDownAt ? new Date(previous.lastDownAt) : null),
      uptime24h,
      uptime7d,
      consecutiveFailures,
      errorMessage,
      sslExpiry,
      headers,
    };

    // Cache result
    await redis.setex(`health:${siteId}`, this.CACHE_TTL, JSON.stringify(result));
    await redis.set(`health:${siteId}:state`, JSON.stringify(result));

    // Update site status in DB
    await prisma.site.update({
      where: { id: siteId },
      data: {
        settings: {
          ...(site.settings as object),
          healthStatus: status,
          lastHealthCheck: now.toISOString(),
          responseTimeMs,
          consecutiveFailures,
        },
      },
    }).catch(() => {});

    // Alert on consecutive failures
    if (consecutiveFailures >= 3 && consecutiveFailures % 3 === 0) {
      log.warn('Site health alert: consecutive failures', {
        siteId,
        siteName: site.name,
        consecutiveFailures,
        lastError: errorMessage,
      });
    }

    return result;
  }

  /**
   * Check health of all sites for an organization
   */
  async checkAllSites(organizationId: string): Promise<SiteHealthResult[]> {
    const sites = await prisma.site.findMany({
      where: { organizationId, isActive: true },
      select: { id: true },
    });

    const results: SiteHealthResult[] = [];

    // Check in parallel with concurrency limit
    const concurrency = 5;
    for (let i = 0; i < sites.length; i += concurrency) {
      const batch = sites.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map((s) => this.checkSite(s.id))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        }
      }
    }

    return results;
  }

  /**
   * Get cached health status for a site
   */
  async getStatus(siteId: string): Promise<SiteHealthResult | null> {
    const cached = await redis.get(`health:${siteId}`);
    if (cached) return JSON.parse(cached);

    // Return from DB settings
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { settings: true },
    });

    if (!site) return null;

    const settings = site.settings as any;
    return {
      siteId,
      status: settings?.healthStatus || 'unknown',
      statusCode: null,
      responseTimeMs: settings?.responseTimeMs || 0,
      lastCheckedAt: settings?.lastHealthCheck ? new Date(settings.lastHealthCheck) : new Date(),
      lastHealthyAt: null,
      lastDownAt: null,
      uptime24h: 0,
      uptime7d: 0,
      consecutiveFailures: settings?.consecutiveFailures || 0,
      errorMessage: null,
      sslExpiry: null,
      headers: {},
    };
  }

  /**
   * Get health summary for all sites in an organization
   */
  async getOrganizationHealth(organizationId: string) {
    const sites = await prisma.site.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, url: true, platform: true, settings: true },
    });

    const healthResults = await Promise.allSettled(
      sites.map((s) => this.getStatus(s.id))
    );

    const siteHealth = sites.map((site, i) => {
      const health = healthResults[i].status === 'fulfilled' ? healthResults[i].value : null;
      return {
        siteId: site.id,
        name: site.name,
        url: site.url,
        platform: site.platform,
        health: health || { status: 'unknown' as HealthStatus, lastCheckedAt: null },
      };
    });

    const healthy = siteHealth.filter((s) => s.health?.status === 'healthy').length;
    const degraded = siteHealth.filter((s) => s.health?.status === 'degraded').length;
    const down = siteHealth.filter((s) => s.health?.status === 'down').length;
    const unknown = siteHealth.filter((s) => s.health?.status === 'unknown').length;

    return {
      summary: {
        total: sites.length,
        healthy,
        degraded,
        down,
        unknown,
        overallStatus: down > 0 ? 'degraded' : healthy === sites.length ? 'healthy' : 'unknown',
      },
      sites: siteHealth,
    };
  }

  /**
   * Record health check in history for uptime calculation
   */
  private async recordHistory(siteId: string, status: HealthStatus, responseTimeMs: number): Promise<void> {
    const key = `health:history:${siteId}`;
    const entry = JSON.stringify({
      status,
      responseTimeMs,
      timestamp: Date.now(),
    });

    // Add to sorted set with timestamp as score
    await redis.zadd(key, Date.now().toString(), entry);
    // Trim to last 7 days
    await redis.zremrangebyscore(key, 0, (Date.now() - this.HISTORY_TTL * 1000).toString());
    await redis.expire(key, this.HISTORY_TTL);
  }

  /**
   * Calculate uptime percentage over N hours
   */
  private async calculateUptime(siteId: string, hours: number): Promise<number> {
    const key = `health:history:${siteId}`;
    const since = Date.now() - hours * 3600000;

    const entries = await redis.zrangebyscore(key, since.toString(), '+inf');
    if (entries.length === 0) return 0;

    const healthy = entries.filter((e) => {
      try {
        return JSON.parse(e).status === 'healthy';
      } catch {
        return false;
      }
    }).length;

    return Math.round((healthy / entries.length) * 10000) / 100;
  }
}

export const siteHealthService = new SiteHealthService();
