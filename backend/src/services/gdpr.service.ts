import { prisma } from '../config/database';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('gdpr');

/**
 * GDPR Compliance Service
 * Data export, account deletion, right to erasure
 */

export class GDPRService {
  /**
   * Export all user data (GDPR Article 20 - Right to Data Portability)
   */
  async exportUserData(userId: string, organizationId: string) {
    const [user, sessions, auditLogs] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, email: true, firstName: true, lastName: true,
          role: true, createdAt: true, lastLoginAt: true, preferences: true,
        },
      }),
      prisma.userSession.findMany({
        where: { userId },
        select: { id: true, ipAddress: true, userAgent: true, createdAt: true, expiresAt: true },
      }),
      prisma.auditLog.findMany({
        where: { userId },
        select: { action: true, resource: true, details: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
    ]);

    // Get organization data
    const [sites, engagements, credentials] = await Promise.all([
      prisma.site.findMany({
        where: { organizationId },
        include: {
          engagements: {
            select: {
              id: true, name: true, engagementType: true, status: true,
              createdAt: true, _count: { select: { runs: true } },
            },
          },
          credentials: {
            select: { id: true, name: true, authType: true, createdAt: true },
            // Note: actual credential data is NOT exported for security
          },
        },
      }),
      prisma.engagement.findMany({
        where: { site: { organizationId } },
        select: {
          id: true, name: true, engagementType: true, status: true,
          createdAt: true, _count: { select: { runs: true } },
        },
      }),
      prisma.engagementRun.findMany({
        where: { site: { organizationId } },
        select: {
          id: true, status: true, startedAt: true, completedAt: true,
          errorMessage: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
    ]);

    return {
      exportDate: new Date().toISOString(),
      format: 'JSON',
      version: '1.0',
      user,
      sessions,
      auditLogs,
      organization: {
        sites: sites.map((s) => ({
          ...s,
          engagements: s.engagements,
          credentials: s.credentials,
        })),
        engagements,
        runs: engagements,
      },
      metadata: {
        totalSites: sites.length,
        totalEngagements: engagements.length,
        totalRuns: engagements.length,
      },
    };
  }

  /**
   * Delete user account (GDPR Article 17 - Right to Erasure)
   * Anonymizes data rather than hard deleting to preserve audit trail
   */
  async deleteAccount(userId: string, password: string): Promise<{ success: boolean; message: string }> {
    // Verify password
    const bcrypt = await import('bcryptjs');
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, message: 'User not found' };

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return { success: false, message: 'Invalid password' };

    // Check if user is the last owner
    if (user.role === 'OWNER') {
      const otherOwners = await prisma.user.count({
        where: { organizationId: user.organizationId, role: 'OWNER', id: { not: userId } },
      });
      if (otherOwners === 0) {
        return { success: false, message: 'Cannot delete the last owner. Transfer ownership first.' };
      }
    }

    // Anonymize user data
    const anonymizedEmail = `deleted_${userId.substring(0, 8)}@deleted.local`;

    await prisma.$transaction(async (tx) => {
      // Anonymize user
      await tx.user.update({
        where: { id: userId },
        data: {
          email: anonymizedEmail,
          firstName: 'Deleted',
          lastName: 'User',
          passwordHash: 'DELETED',
          isActive: false,
          mfaEnabled: false,
          mfaSecret: null,
          preferences: {},
        },
      });

      // Delete all sessions
      await tx.userSession.deleteMany({ where: { userId } });

      // Anonymize audit logs (keep for compliance but remove PII)
      await tx.auditLog.updateMany({
        where: { userId },
        data: { userId: null },
      });
    });

    log.info('User account deleted (anonymized)', { userId });
    return { success: true, message: 'Account deleted successfully' };
  }

  /**
   * Delete organization and all data (GDPR Article 17)
   * This is irreversible
   */
  async deleteOrganization(organizationId: string, userId: string): Promise<{ success: boolean; message: string }> {
    // Verify user is owner
    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId, role: 'OWNER' },
    });
    if (!user) return { success: false, message: 'Only owners can delete organizations' };

    // Delete in order (respect foreign keys)
    await prisma.$transaction(async (tx) => {
      // Delete engagement runs
      await tx.engagementRun.deleteMany({
        where: { site: { organizationId } },
      });

      // Delete engagement logs
      await tx.engagementLog.deleteMany({
        where: { engagement: { site: { organizationId } } },
      });

      // Delete engagements
      await tx.engagement.deleteMany({
        where: { site: { organizationId } },
      });

      // Delete credentials
      await tx.credential.deleteMany({
        where: { site: { organizationId } },
      });

      // Delete proxy configs
      await tx.proxyConfig.deleteMany({
        where: { site: { organizationId } },
      });

      // Delete sites
      await tx.site.deleteMany({ where: { organizationId } });

      // Delete LLM configs
      await tx.lLMConfig.deleteMany({ where: { organizationId } });

      // Delete content templates
      await tx.contentTemplate.deleteMany({ where: { organizationId } });

      // Delete webhooks
      await tx.webhook.deleteMany({ where: { organizationId } });

      // Delete analytics
      await tx.analyticsSnapshot.deleteMany({ where: { organizationId } });

      // Delete audit logs
      await tx.auditLog.deleteMany({ where: { organizationId } });

      // Delete API keys
      await tx.apiKey.deleteMany({ where: { organizationId } });

      // Delete user sessions
      await tx.userSession.deleteMany({
        where: { user: { organizationId } },
      });

      // Delete users
      await tx.user.deleteMany({ where: { organizationId } });

      // Delete organization
      await tx.organization.delete({ where: { id: organizationId } });
    });

    log.info('Organization deleted', { organizationId, requestedBy: userId });
    return { success: true, message: 'Organization and all data deleted' };
  }

  /**
   * Get data processing summary (for transparency)
   */
  async getDataSummary(organizationId: string) {
    const [sites, engagements, runs, credentials, auditLogs, users] = await Promise.all([
      prisma.site.count({ where: { organizationId } }),
      prisma.engagement.count({ where: { site: { organizationId } } }),
      prisma.engagementRun.count({ where: { site: { organizationId } } }),
      prisma.credential.count({ where: { site: { organizationId } } }),
      prisma.auditLog.count({ where: { organizationId } }),
      prisma.user.count({ where: { organizationId } }),
    ]);

    return {
      dataCategories: [
        { category: 'User Accounts', count: users, description: 'Email, name, role, preferences' },
        { category: 'Sites', count: sites, description: 'Connected platform configurations' },
        { category: 'Engagements', count: engagements, description: 'Engagement automation rules' },
        { category: 'Execution Runs', count: runs, description: 'Engagement execution history' },
        { category: 'Credentials', count: credentials, description: 'Encrypted authentication data' },
        { category: 'Audit Logs', count: auditLogs, description: 'Security and action audit trail' },
      ],
      retentionPolicy: {
        executionRuns: '90 days',
        engagementLogs: '60 days',
        auditLogs: '365 days',
        sessions: '30 days after expiry',
      },
      encryption: 'AES-256-GCM for credentials at rest, bcrypt for passwords',
    };
  }
}

export const gdprService = new GDPRService();
