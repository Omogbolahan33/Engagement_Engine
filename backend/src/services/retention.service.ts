import { prisma } from '../config/database';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('retention');

/**
 * Data Retention Service
 * Cleans up old data to prevent unbounded DB growth
 * Configurable retention periods per data type
 */

interface RetentionConfig {
  engagementRunDays: number;      // How long to keep run records
  engagementLogDays: number;      // How long to keep logs
  auditLogDays: number;           // How long to keep audit logs
  sessionDays: number;            // How long to keep expired sessions
  analyticsDays: number;          // How long to keep analytics snapshots
  completedEngagementDays: number; // How long to keep completed/failed engagements
}

const DEFAULT_RETENTION: RetentionConfig = {
  engagementRunDays: 90,
  engagementLogDays: 60,
  auditLogDays: 365,
  sessionDays: 30,
  analyticsDays: 180,
  completedEngagementDays: 180,
};

export class RetentionService {
  private config: RetentionConfig;

  constructor(config?: Partial<RetentionConfig>) {
    this.config = { ...DEFAULT_RETENTION, ...config };
  }

  /**
   * Run all cleanup tasks
   * Should be called daily via cron
   */
  async cleanup(): Promise<Record<string, number>> {
    log.info('Starting data retention cleanup');

    const results: Record<string, number> = {};

    // Clean old engagement runs
    results.engagementRuns = await this.cleanupEngagementRuns();

    // Clean old engagement logs
    results.engagementLogs = await this.cleanupEngagementLogs();

    // Clean old audit logs
    results.auditLogs = await this.cleanupAuditLogs();

    // Clean expired sessions
    results.sessions = await this.cleanupSessions();

    // Clean old analytics snapshots
    results.analytics = await this.cleanupAnalytics();

    // Archive completed/failed engagements
    results.archivedEngagements = await this.archiveOldEngagements();

    log.info('Data retention cleanup completed', results);

    return results;
  }

  private async cleanupEngagementRuns(): Promise<number> {
    const cutoff = new Date(Date.now() - this.config.engagementRunDays * 86_400_000);

    const { count } = await prisma.engagementRun.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        status: { in: ['SUCCESS', 'FAILED', 'CANCELLED'] },
      },
    });

    if (count > 0) log.info(`Cleaned ${count} old engagement runs`);
    return count;
  }

  private async cleanupEngagementLogs(): Promise<number> {
    const cutoff = new Date(Date.now() - this.config.engagementLogDays * 86_400_000);

    const { count } = await prisma.engagementLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (count > 0) log.info(`Cleaned ${count} old engagement logs`);
    return count;
  }

  private async cleanupAuditLogs(): Promise<number> {
    const cutoff = new Date(Date.now() - this.config.auditLogDays * 86_400_000);

    const { count } = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (count > 0) log.info(`Cleaned ${count} old audit logs`);
    return count;
  }

  private async cleanupSessions(): Promise<number> {
    const { count } = await prisma.userSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    if (count > 0) log.info(`Cleaned ${count} expired sessions`);
    return count;
  }

  private async cleanupAnalytics(): Promise<number> {
    const cutoff = new Date(Date.now() - this.config.analyticsDays * 86_400_000);

    const { count } = await prisma.analyticsSnapshot.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (count > 0) log.info(`Cleaned ${count} old analytics snapshots`);
    return count;
  }

  private async archiveOldEngagements(): Promise<number> {
    const cutoff = new Date(Date.now() - this.config.completedEngagementDays * 86_400_000);

    const { count } = await prisma.engagement.updateMany({
      where: {
        status: { in: ['COMPLETED', 'FAILED', 'EXPIRED'] },
        updatedAt: { lt: cutoff },
      },
      data: { status: 'ARCHIVED' },
    });

    if (count > 0) log.info(`Archived ${count} old engagements`);
    return count;
  }

  /**
   * Get retention statistics
   */
  async getStats() {
    const [runs, logs, auditLogs, sessions, analytics] = await Promise.all([
      prisma.engagementRun.count(),
      prisma.engagementLog.count(),
      prisma.auditLog.count(),
      prisma.userSession.count(),
      prisma.analyticsSnapshot.count(),
    ]);

    return {
      engagementRuns: runs,
      engagementLogs: logs,
      auditLogs,
      sessions,
      analytics,
      config: this.config,
    };
  }
}

export const retentionService = new RetentionService();
