import { prisma } from '../config/database';
import { NotFoundError } from '../middleware/errorHandler';
import { auditLog } from '../middleware/audit';
import { createContextLogger } from '../utils/logger';
import { PlatformType } from '@prisma/client';

const log = createContextLogger('site-service');

interface CreateSiteInput {
  name: string;
  url: string;
  platform: PlatformType;
  description?: string;
  settings?: Record<string, any>;
  rateLimits?: Record<string, any>;
}

interface UpdateSiteInput {
  name?: string;
  url?: string;
  platform?: PlatformType;
  description?: string;
  settings?: Record<string, any>;
  rateLimits?: Record<string, any>;
  isActive?: boolean;
}

export class SiteService {
  /**
   * Create a new site
   */
  async create(input: CreateSiteInput, organizationId: string) {
    const site = await prisma.site.create({
      data: {
        organizationId,
        name: input.name,
        url: input.url,
        platform: input.platform,
        description: input.description,
        settings: input.settings || {},
        rateLimits: input.rateLimits || {},
      },
      include: {
        _count: {
          select: { engagements: true, credentials: true },
        },
      },
    });

    await auditLog(organizationId, undefined, {
      action: 'SITE_CREATED',
      resource: 'site',
      resourceId: site.id,
      details: { name: site.name, platform: site.platform },
    });

    log.info('Site created', { siteId: site.id, platform: site.platform });
    return site;
  }

  /**
   * List all sites for an organization
   */
  async list(organizationId: string, filters?: { platform?: PlatformType; isActive?: boolean }) {
    const where: any = { organizationId };
    if (filters?.platform) where.platform = filters.platform;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;

    const sites = await prisma.site.findMany({
      where,
      include: {
        _count: {
          select: { engagements: true, credentials: true, engagementRuns: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sites;
  }

  /**
   * Get a single site
   */
  async getById(siteId: string, organizationId: string) {
    const site = await prisma.site.findFirst({
      where: { id: siteId, organizationId },
      include: {
        credentials: {
          select: { id: true, name: true, authType: true, isActive: true, lastUsedAt: true },
        },
        engagements: {
          select: { id: true, name: true, engagementType: true, status: true },
        },
        proxyConfigs: {
          select: { id: true, name: true, proxyType: true, isActive: true },
        },
        _count: {
          select: { engagementRuns: true },
        },
      },
    });

    if (!site) {
      throw new NotFoundError('Site');
    }

    return site;
  }

  /**
   * Update a site
   */
  async update(siteId: string, input: UpdateSiteInput, organizationId: string) {
    const site = await prisma.site.findFirst({
      where: { id: siteId, organizationId },
    });

    if (!site) {
      throw new NotFoundError('Site');
    }

    const updated = await prisma.site.update({
      where: { id: siteId },
      data: input,
    });

    await auditLog(organizationId, undefined, {
      action: 'SITE_UPDATED',
      resource: 'site',
      resourceId: siteId,
      details: input,
    });

    return updated;
  }

  /**
   * Delete a site (soft delete → deactivate)
   */
  async delete(siteId: string, organizationId: string) {
    const site = await prisma.site.findFirst({
      where: { id: siteId, organizationId },
    });

    if (!site) {
      throw new NotFoundError('Site');
    }

    // Soft delete: deactivate site and pause all engagements
    await prisma.$transaction(async (tx) => {
      await tx.site.update({
        where: { id: siteId },
        data: { isActive: false },
      });
      await tx.engagement.updateMany({
        where: { siteId, status: 'ACTIVE' },
        data: { status: 'PAUSED' },
      });
    });

    await auditLog(organizationId, undefined, {
      action: 'SITE_DELETED',
      resource: 'site',
      resourceId: siteId,
    });

    log.info('Site deactivated (soft deleted)', { siteId });
  }

  /**
   * Get site statistics
   */
  async getStats(siteId: string, organizationId: string) {
    const site = await prisma.site.findFirst({
      where: { id: siteId, organizationId },
    });

    if (!site) {
      throw new NotFoundError('Site');
    }

    const [totalRuns, successfulRuns, failedRuns, activeEngagements] = await Promise.all([
      prisma.engagementRun.count({ where: { siteId } }),
      prisma.engagementRun.count({ where: { siteId, status: 'SUCCESS' } }),
      prisma.engagementRun.count({ where: { siteId, status: 'FAILED' } }),
      prisma.engagement.count({ where: { siteId, status: 'ACTIVE' } }),
    ]);

    return {
      totalRuns,
      successfulRuns,
      failedRuns,
      successRate: totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0,
      activeEngagements,
    };
  }
}

export const siteService = new SiteService();
