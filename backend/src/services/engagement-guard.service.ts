import crypto from 'crypto';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { webhookService } from './webhook.service';
import { emailService } from './email.service';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('engagement-guard');

/**
 * Engagement Guard Service
 * Protects engagements from running when conditions are unfavorable
 *
 * Features:
 * - Auto-pause on consecutive failures
 * - Credential expiry detection
 * - Rate limit breach detection
 * - Platform block detection
 * - Content deduplication
 */

interface GuardConfig {
  maxConsecutiveFailures: number;   // Auto-pause after N failures
  failureWindowMinutes: number;     // Window to count failures
  cooldownAfterPauseMinutes: number; // Wait before allowing re-enable
  deduplicationWindowHours: number; // Prevent duplicate content within window
}

const DEFAULT_GUARD_CONFIG: GuardConfig = {
  maxConsecutiveFailures: 5,
  failureWindowMinutes: 60,
  cooldownAfterPauseMinutes: 30,
  deduplicationWindowHours: 24,
};

export class EngagementGuardService {
  private config: GuardConfig;

  constructor(config?: Partial<GuardConfig>) {
    this.config = { ...DEFAULT_GUARD_CONFIG, ...config };
  }

  /**
   * Check if an engagement should be allowed to run
   * Returns { allowed, reason } — called before every execution
   */
  async preExecutionCheck(engagementId: string): Promise<{ allowed: boolean; reason?: string }> {
    const engagement = await prisma.engagement.findUnique({
      where: { id: engagementId },
      include: { site: true },
    });

    if (!engagement) {
      return { allowed: false, reason: 'Engagement not found' };
    }

    // Check if engagement is active
    if (engagement.status !== 'ACTIVE') {
      return { allowed: false, reason: `Engagement is ${engagement.status}` };
    }

    // Check if site is active
    if (!engagement.site.isActive) {
      return { allowed: false, reason: 'Site is deactivated' };
    }

    // Check consecutive failures
    const failureCheck = await this.checkConsecutiveFailures(engagementId);
    if (!failureCheck.allowed) {
      return failureCheck;
    }

    // Check credential validity
    const credCheck = await this.checkCredentials(engagement.siteId);
    if (!credCheck.allowed) {
      return credCheck;
    }

    // Check if platform is blocking us
    const blockCheck = await this.checkPlatformBlock(engagement.siteId);
    if (!blockCheck.allowed) {
      return blockCheck;
    }

    return { allowed: true };
  }

  /**
   * Record execution result and auto-pause if needed
   */
  async recordResult(
    engagementId: string,
    success: boolean,
    statusCode?: number,
    errorMessage?: string
  ): Promise<void> {
    const key = `guard:failures:${engagementId}`;

    if (success) {
      // Clear failure counter on success
      await redis.del(key);
      return;
    }

    // Increment failure counter
    const failures = await redis.incr(key);
    await redis.expire(key, this.config.failureWindowMinutes * 60);

    // Check if we should auto-pause
    if (failures >= this.config.maxConsecutiveFailures) {
      await this.autoPause(engagementId, failures, errorMessage);
    }

    // Check for specific failure patterns
    if (statusCode === 401 || statusCode === 403) {
      await this.handleAuthFailure(engagementId);
    }

    if (statusCode === 429) {
      await this.handleRateLimit(engagementId);
    }

    if (statusCode === 403 && errorMessage?.toLowerCase().includes('blocked')) {
      await this.handlePlatformBlock(engagementId);
    }
  }

  /**
   * Auto-pause engagement after consecutive failures
   */
  private async autoPause(engagementId: string, failureCount: number, lastError?: string): Promise<void> {
    const engagement = await prisma.engagement.update({
      where: { id: engagementId },
      data: { status: 'PAUSED' },
      include: { site: true },
    });

    log.warn('Engagement auto-paused due to consecutive failures', {
      engagementId,
      failureCount,
      lastError,
    });

    // Log the auto-pause
    await prisma.engagementLog.create({
      data: {
        engagementId,
        level: 'WARN',
        message: `⚠️ Auto-paused after ${failureCount} consecutive failures. Last error: ${lastError || 'Unknown'}`,
        data: { failureCount, lastError, autoPaused: true },
      },
    });

    // Set cooldown before re-enable is allowed
    await redis.setex(
      `guard:cooldown:${engagementId}`,
      this.config.cooldownAfterPauseMinutes * 60,
      'true'
    );

    // Notify via webhook
    const orgId = engagement.site.organizationId;
    await webhookService.deliver(orgId, 'engagement.paused', {
      engagementId,
      reason: 'consecutive_failures',
      failureCount,
      lastError,
    }).catch(() => {});

    // Send email notification
    const users = await prisma.user.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { email: true, firstName: true },
    });

    for (const user of users) {
      await emailService.sendEngagementFailureAlert(
        user.email,
        engagement.name,
        engagement.site.name,
        lastError || 'Multiple consecutive failures',
        'Auto-pause'
      ).catch(() => {});
    }
  }

  /**
   * Check consecutive failures
   */
  private async checkConsecutiveFailures(engagementId: string): Promise<{ allowed: boolean; reason?: string }> {
    const key = `guard:failures:${engagementId}`;
    const failures = parseInt(await redis.get(key) || '0');

    if (failures >= this.config.maxConsecutiveFailures) {
      // Check cooldown
      const cooldown = await redis.get(`guard:cooldown:${engagementId}`);
      if (cooldown) {
        return {
          allowed: false,
          reason: `Auto-paused after ${failures} failures. Cooldown active.`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check if any valid credentials exist for the site
   */
  private async checkCredentials(siteId: string): Promise<{ allowed: boolean; reason?: string }> {
    const now = new Date();
    const credentials = await prisma.credential.findMany({
      where: { siteId, isActive: true },
    });

    if (credentials.length === 0) {
      return { allowed: false, reason: 'No credentials configured' };
    }

    const validCreds = credentials.filter((c) => !c.expiresAt || c.expiresAt > now);
    if (validCreds.length === 0) {
      return { allowed: false, reason: 'All credentials expired' };
    }

    return { allowed: true };
  }

  /**
   * Check if the platform is blocking us
   */
  private async checkPlatformBlock(siteId: string): Promise<{ allowed: boolean; reason?: string }> {
    const blockKey = `guard:blocked:${siteId}`;
    const blocked = await redis.get(blockKey);

    if (blocked) {
      return { allowed: false, reason: 'Platform is blocking requests. Cooldown active.' };
    }

    return { allowed: true };
  }

  /**
   * Handle authentication failure
   */
  private async handleAuthFailure(engagementId: string): Promise<void> {
    const engagement = await prisma.engagement.findUnique({
      where: { id: engagementId },
      include: { site: true },
    });

    if (!engagement) return;

    // Check if all credentials are failing
    const recentAuthFailures = await prisma.engagementRun.count({
      where: {
        siteId: engagement.siteId,
        status: 'FAILED',
        metadata: { path: ['statusCode'], equals: 401 },
        createdAt: { gte: new Date(Date.now() - 3600000) },
      },
    });

    if (recentAuthFailures >= 10) {
      log.warn('Multiple auth failures detected, credentials may be invalid', {
        siteId: engagement.siteId,
      });
    }
  }

  /**
   * Handle rate limit from target platform
   */
  private async handleRateLimit(engagementId: string): Promise<void> {
    // Back off: add extra delay to the engagement
    const key = `guard:ratelimited:${engagementId}`;
    await redis.setex(key, 300, 'true'); // 5 min backoff

    log.info('Rate limit backoff activated', { engagementId });
  }

  /**
   * Handle platform block
   */
  private async handlePlatformBlock(engagementId: string): Promise<void> {
    const engagement = await prisma.engagement.findUnique({
      where: { id: engagementId },
      include: { site: true },
    });

    if (!engagement) return;

    // Block all engagements on this site for 30 minutes
    const blockKey = `guard:blocked:${engagement.siteId}`;
    await redis.setex(blockKey, 1800, 'true');

    log.warn('Platform block detected, all engagements on site paused', {
      siteId: engagement.siteId,
    });
  }

  /**
   * Check content deduplication
   * Prevents posting the same content multiple times
   */
  async checkDuplicate(siteId: string, contentHash: string): Promise<{ isDuplicate: boolean }> {
    const key = `guard:dedup:${siteId}:${contentHash}`;
    const exists = await redis.get(key);

    if (exists) {
      return { isDuplicate: true };
    }

    // Mark content as used
    await redis.setex(key, this.config.deduplicationWindowHours * 3600, 'true');
    return { isDuplicate: false };
  }

  /**
   * Generate content hash for deduplication
   */
  hashContent(content: string): string {
    return crypto.createHash('sha256').update(content.trim().toLowerCase()).digest('hex').substring(0, 16);
  }

  /**
   * Get guard status for an engagement
   */
  async getStatus(engagementId: string) {
    const failures = parseInt(await redis.get(`guard:failures:${engagementId}`) || '0');
    const cooldown = await redis.get(`guard:cooldown:${engagementId}`);
    const rateLimited = await redis.get(`guard:ratelimited:${engagementId}`);

    return {
      consecutiveFailures: failures,
      maxFailures: this.config.maxConsecutiveFailures,
      cooldownActive: !!cooldown,
      rateLimitBackoff: !!rateLimited,
      healthy: failures < this.config.maxConsecutiveFailures && !cooldown,
    };
  }
}

export const engagementGuard = new EngagementGuardService();
