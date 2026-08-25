import { prisma } from '../config/database';
import { auditLog } from '../middleware/audit';
import { createContextLogger } from '../utils/logger';
import { EngagementStatus } from '@prisma/client';

const log = createContextLogger('bulk-ops');

/**
 * Bulk Operations Service
 * Batch operations on engagements, sites, and credentials
 */

export class BulkOperationsService {
  /**
   * Bulk update engagement statuses
   */
  async bulkUpdateEngagementStatus(
    engagementIds: string[],
    status: EngagementStatus,
    organizationId: string,
    userId?: string
  ): Promise<{ updated: number; failed: string[] }> {
    const failed: string[] = [];
    let updated = 0;

    // Verify all engagements belong to the organization
    const engagements = await prisma.engagement.findMany({
      where: {
        id: { in: engagementIds },
        site: { organizationId },
      },
    });

    const validIds = new Set(engagements.map((e) => e.id));
    const invalidIds = engagementIds.filter((id) => !validIds.has(id));
    failed.push(...invalidIds);

    // Update in transaction
    await prisma.$transaction(async (tx) => {
      for (const id of validIds) {
        try {
          await tx.engagement.update({
            where: { id },
            data: { status },
          });
          updated++;
        } catch (error: any) {
          failed.push(id);
          log.error('Bulk status update failed for engagement', { id, error: error.message });
        }
      }
    });

    await auditLog(organizationId, userId, {
      action: 'BULK_STATUS_UPDATE',
      resource: 'engagement',
      details: { status, updated, failed: failed.length, total: engagementIds.length },
    });

    log.info('Bulk status update completed', { status, updated, failed: failed.length });

    return { updated, failed };
  }

  /**
   * Bulk delete engagements (soft delete → archived)
   */
  async bulkDeleteEngagements(
    engagementIds: string[],
    organizationId: string,
    userId?: string
  ): Promise<{ deleted: number; failed: string[] }> {
    const failed: string[] = [];
    let deleted = 0;

    const engagements = await prisma.engagement.findMany({
      where: {
        id: { in: engagementIds },
        site: { organizationId },
      },
    });

    const validIds = new Set(engagements.map((e) => e.id));

    for (const id of engagementIds) {
      if (!validIds.has(id)) {
        failed.push(id);
        continue;
      }
      try {
        await prisma.engagement.update({
          where: { id },
          data: { status: 'ARCHIVED' },
        });
        deleted++;
      } catch (error: any) {
        failed.push(id);
      }
    }

    await auditLog(organizationId, userId, {
      action: 'BULK_DELETE_ENGAGEMENTS',
      resource: 'engagement',
      details: { deleted, failed: failed.length },
    });

    return { deleted, failed };
  }

  /**
   * Clone an engagement with all its configuration
   */
  async cloneEngagement(
    engagementId: string,
    overrides?: {
      name?: string;
      siteId?: string;
      status?: EngagementStatus;
    },
    organizationId?: string
  ) {
    const original = await prisma.engagement.findFirst({
      where: {
        id: engagementId,
        ...(organizationId ? { site: { organizationId } } : {}),
      },
    });

    if (!original) {
      throw new Error('Engagement not found');
    }

    const cloned = await prisma.engagement.create({
      data: {
        siteId: overrides?.siteId || original.siteId,
        name: overrides?.name || `${original.name} (Copy)`,
        description: original.description,
        engagementType: original.engagementType,
        config: original.config as object,
        targetConfig: original.targetConfig as object,
        schedule: original.schedule as object,
        frequency: original.frequency as object,
        expiresAt: original.expiresAt,
        status: overrides?.status || 'DRAFT',
        priority: original.priority,
        retryConfig: original.retryConfig as object,
      },
    });

    if (organizationId) {
      await auditLog(organizationId, undefined, {
        action: 'ENGAGEMENT_CLONED',
        resource: 'engagement',
        resourceId: cloned.id,
        details: { originalId: engagementId },
      });
    }

    log.info('Engagement cloned', { originalId: engagementId, clonedId: cloned.id });

    return cloned;
  }

  /**
   * Dry-run an engagement (simulate without actually executing)
   * Shows what would happen: which target, which auth, rate limit status
   */
  async dryRunEngagement(
    engagementId: string,
    organizationId: string
  ) {
    const engagement = await prisma.engagement.findFirst({
      where: { id: engagementId, site: { organizationId } },
      include: {
        site: true,
      },
    });

    if (!engagement) {
      throw new Error('Engagement not found');
    }

    // Check credentials
    const credentials = await prisma.credential.findMany({
      where: { siteId: engagement.siteId, isActive: true },
      select: { id: true, name: true, authType: true, isActive: true, expiresAt: true },
    });

    const now = new Date();
    const validCredentials = credentials.filter(
      (c) => !c.expiresAt || c.expiresAt > now
    );

    // Check rate limits
    const { rateLimitService } = await import('./rate-limit.service');
    const rateLimitCheck = await rateLimitService.checkEngagementLimit(engagementId);

    // Check proxies
    const proxies = await prisma.proxyConfig.findMany({
      where: { siteId: engagement.siteId, isActive: true },
    });

    // Build dry-run result
    const freq = engagement.frequency as any;

    return {
      engagement: {
        id: engagement.id,
        name: engagement.name,
        type: engagement.engagementType,
        status: engagement.status,
      },
      site: {
        id: engagement.site.id,
        name: engagement.site.name,
        platform: engagement.site.platform,
        url: engagement.site.url,
      },
      target: engagement.targetConfig,
      credentials: {
        total: credentials.length,
        valid: validCredentials.length,
        expired: credentials.length - validCredentials.length,
        list: validCredentials.map((c) => ({
          name: c.name,
          authType: c.authType,
          expiresAt: c.expiresAt,
        })),
      },
      rateLimits: {
        allowed: rateLimitCheck.allowed,
        reason: rateLimitCheck.reason,
        currentUsage: rateLimitCheck.currentCounts,
        configured: {
          maxPerMinute: freq?.maxPerMinute,
          maxPerHour: freq?.maxPerHour,
          maxPerDay: freq?.maxPerDay,
          cooldownMs: freq?.cooldownMs,
          jitterMs: freq?.jitterMs,
        },
      },
      proxies: {
        total: proxies.length,
        active: proxies.filter((p) => p.isActive).length,
      },
      wouldExecute: engagement.status === 'ACTIVE' && rateLimitCheck.allowed && validCredentials.length > 0,
      blockers: [
        ...(engagement.status !== 'ACTIVE' ? ['Engagement is not active'] : []),
        ...(validCredentials.length === 0 ? ['No valid credentials'] : []),
        ...(!rateLimitCheck.allowed ? [`Rate limited: ${rateLimitCheck.reason}`] : []),
      ],
    };
  }

  /**
   * Export engagements as JSON (for backup/migration)
   */
  async exportEngagements(organizationId: string) {
    const sites = await prisma.site.findMany({
      where: { organizationId },
      include: {
        engagements: true,
        credentials: {
          select: { id: true, name: true, authType: true, metadata: true, isActive: true },
        },
      },
    });

    return {
      exportedAt: new Date().toISOString(),
      organizationId,
      sites: sites.map((site) => ({
        name: site.name,
        url: site.url,
        platform: site.platform,
        description: site.description,
        settings: site.settings,
        engagements: site.engagements.map((eng) => ({
          name: eng.name,
          description: eng.description,
          engagementType: eng.engagementType,
          config: eng.config,
          targetConfig: eng.targetConfig,
          schedule: eng.schedule,
          frequency: eng.frequency,
          priority: eng.priority,
          retryConfig: eng.retryConfig,
        })),
        credentials: site.credentials.map((cred) => ({
          name: cred.name,
          authType: cred.authType,
          metadata: cred.metadata,
          isActive: cred.isActive,
          // Note: actual credential data is NOT exported for security
        })),
      })),
    };
  }
}

export const bulkOperationsService = new BulkOperationsService();
