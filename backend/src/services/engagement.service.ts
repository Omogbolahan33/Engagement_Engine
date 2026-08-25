import { prisma } from '../config/database';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import { auditLog } from '../middleware/audit';
import { createContextLogger } from '../utils/logger';
import { EngagementType, EngagementStatus } from '@prisma/client';

const log = createContextLogger('engagement-service');

interface CreateEngagementInput {
  siteId: string;
  name: string;
  description?: string;
  engagementType: EngagementType;
  config?: Record<string, any>;
  targetConfig: Record<string, any>;
  schedule?: Record<string, any>;
  frequency?: {
    maxPerMinute?: number;
    maxPerHour?: number;
    maxPerDay?: number;
    maxPerWeek?: number;
    maxTotal?: number;
    cooldownMs?: number;
    jitterMs?: number;
    backoffStrategy?: string;
  };
  expiresAt?: Date;
  priority?: number;
  retryConfig?: Record<string, any>;
}

interface UpdateEngagementInput {
  name?: string;
  description?: string;
  config?: Record<string, any>;
  targetConfig?: Record<string, any>;
  schedule?: Record<string, any>;
  frequency?: Record<string, any>;
  expiresAt?: Date;
  status?: EngagementStatus;
  priority?: number;
  retryConfig?: Record<string, any>;
}

export class EngagementService {
  /**
   * Create a new engagement
   */
  async create(input: CreateEngagementInput, organizationId: string) {
    // Verify site belongs to organization
    const site = await prisma.site.findFirst({
      where: { id: input.siteId, organizationId },
    });

    if (!site) {
      throw new NotFoundError('Site');
    }

    const engagement = await prisma.engagement.create({
      data: {
        siteId: input.siteId,
        name: input.name,
        description: input.description,
        engagementType: input.engagementType,
        config: input.config || {},
        targetConfig: input.targetConfig,
        schedule: input.schedule || {},
        frequency: {
          maxPerMinute: input.frequency?.maxPerMinute || 1,
          maxPerHour: input.frequency?.maxPerHour || 10,
          maxPerDay: input.frequency?.maxPerDay || 100,
          maxPerWeek: input.frequency?.maxPerWeek || 500,
          maxTotal: input.frequency?.maxTotal,
          cooldownMs: input.frequency?.cooldownMs || 60000,
          jitterMs: input.frequency?.jitterMs || 5000,
          backoffStrategy: (input.frequency?.backoffStrategy as any) || 'LINEAR',
        },
        expiresAt: input.expiresAt,
        priority: input.priority || 5,
        retryConfig: input.retryConfig || {},
      },
      include: {
        site: { select: { id: true, name: true, platform: true } },
      },
    });

    await auditLog(organizationId, undefined, {
      action: 'ENGAGEMENT_CREATED',
      resource: 'engagement',
      resourceId: engagement.id,
      details: { type: input.engagementType, siteId: input.siteId },
    });

    log.info('Engagement created', {
      engagementId: engagement.id,
      type: input.engagementType,
    });

    return engagement;
  }

  /**
   * List engagements for an organization
   */
  async list(
    organizationId: string,
    filters?: {
      siteId?: string;
      engagementType?: EngagementType;
      status?: EngagementStatus;
    }
  ) {
    const where: any = { site: { organizationId } };
    if (filters?.siteId) where.siteId = filters.siteId;
    if (filters?.engagementType) where.engagementType = filters.engagementType;
    if (filters?.status) where.status = filters.status;

    const engagements = await prisma.engagement.findMany({
      where,
      include: {
        site: { select: { id: true, name: true, platform: true } },
        _count: { select: { runs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return engagements;
  }

  /**
   * Get a single engagement
   */
  async getById(engagementId: string, organizationId: string) {
    const engagement = await prisma.engagement.findFirst({
      where: { id: engagementId, site: { organizationId } },
      include: {
        site: { select: { id: true, name: true, platform: true } },
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        _count: { select: { runs: true } },
      },
    });

    if (!engagement) {
      throw new NotFoundError('Engagement');
    }

    return engagement;
  }

  /**
   * Update an engagement
   */
  async update(engagementId: string, input: UpdateEngagementInput, organizationId: string) {
    const engagement = await prisma.engagement.findFirst({
      where: { id: engagementId, site: { organizationId } },
    });

    if (!engagement) {
      throw new NotFoundError('Engagement');
    }

    const updated = await prisma.engagement.update({
      where: { id: engagementId },
      data: input,
    });

    await auditLog(organizationId, undefined, {
      action: 'ENGAGEMENT_UPDATED',
      resource: 'engagement',
      resourceId: engagementId,
      details: input,
    });

    return updated;
  }

  /**
   * Delete an engagement (soft delete → archived)
   */
  async delete(engagementId: string, organizationId: string) {
    const engagement = await prisma.engagement.findFirst({
      where: { id: engagementId, site: { organizationId } },
    });

    if (!engagement) {
      throw new NotFoundError('Engagement');
    }

    // Soft delete: archive instead of hard delete
    await prisma.engagement.update({
      where: { id: engagementId },
      data: { status: 'ARCHIVED' },
    });

    await auditLog(organizationId, undefined, {
      action: 'ENGAGEMENT_DELETED',
      resource: 'engagement',
      resourceId: engagementId,
    });

    log.info('Engagement archived (soft deleted)', { engagementId });
  }

  /**
   * Activate an engagement
   */
  async activate(engagementId: string, organizationId: string) {
    return this.updateStatus(engagementId, 'ACTIVE', organizationId);
  }

  /**
   * Pause an engagement
   */
  async pause(engagementId: string, organizationId: string) {
    return this.updateStatus(engagementId, 'PAUSED', organizationId);
  }

  /**
   * Update engagement status
   */
  private async updateStatus(engagementId: string, status: EngagementStatus, organizationId: string) {
    const engagement = await prisma.engagement.findFirst({
      where: { id: engagementId, site: { organizationId } },
    });

    if (!engagement) {
      throw new NotFoundError('Engagement');
    }

    const updated = await prisma.engagement.update({
      where: { id: engagementId },
      data: { status },
    });

    await auditLog(organizationId, undefined, {
      action: 'ENGAGEMENT_STATUS_CHANGED',
      resource: 'engagement',
      resourceId: engagementId,
      details: { from: engagement.status, to: status },
    });

    log.info('Engagement status changed', { engagementId, from: engagement.status, to: status });

    return updated;
  }

  /**
   * Get engagement statistics
   */
  async getStats(engagementId: string, organizationId: string) {
    const engagement = await prisma.engagement.findFirst({
      where: { id: engagementId, site: { organizationId } },
    });

    if (!engagement) {
      throw new NotFoundError('Engagement');
    }

    const [totalRuns, successfulRuns, failedRuns, runsByDay] = await Promise.all([
      prisma.engagementRun.count({ where: { engagementId } }),
      prisma.engagementRun.count({ where: { engagementId, status: 'SUCCESS' } }),
      prisma.engagementRun.count({ where: { engagementId, status: 'FAILED' } }),
      prisma.$queryRaw`
        SELECT DATE(created_at) as date, COUNT(*) as count, status
        FROM engagement_runs
        WHERE engagement_id = ${engagementId}
          AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at), status
        ORDER BY date DESC
      `,
    ]);

    return {
      totalRuns,
      successfulRuns,
      failedRuns,
      successRate: totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0,
      runsByDay,
    };
  }
}

export const engagementService = new EngagementService();
