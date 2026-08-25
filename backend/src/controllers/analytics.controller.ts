import { Router, Response } from 'express';
import { prisma } from '../config/database';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// Dashboard overview
router.get('/overview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orgId = req.user!.organizationId;

    const [
      totalSites,
      activeSites,
      totalEngagements,
      activeEngagements,
      totalRuns,
      successfulRuns,
      failedRuns,
      runsToday,
    ] = await Promise.all([
      prisma.site.count({ where: { organizationId: orgId } }),
      prisma.site.count({ where: { organizationId: orgId, isActive: true } }),
      prisma.engagement.count({ where: { site: { organizationId: orgId } } }),
      prisma.engagement.count({ where: { site: { organizationId: orgId }, status: 'ACTIVE' } }),
      prisma.engagementRun.count({ where: { site: { organizationId: orgId } } }),
      prisma.engagementRun.count({ where: { site: { organizationId: orgId }, status: 'SUCCESS' } }),
      prisma.engagementRun.count({ where: { site: { organizationId: orgId }, status: 'FAILED' } }),
      prisma.engagementRun.count({
        where: {
          site: { organizationId: orgId },
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);

    res.json({
      overview: {
        sites: { total: totalSites, active: activeSites },
        engagements: { total: totalEngagements, active: activeEngagements },
        runs: {
          total: totalRuns,
          successful: successfulRuns,
          failed: failedRuns,
          today: runsToday,
          successRate: totalRuns > 0 ? ((successfulRuns / totalRuns) * 100).toFixed(1) : '0',
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Runs over time
router.get('/runs-over-time', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const days = parseInt(req.query.days as string) || 30;

    const runs = await prisma.$queryRaw`
      SELECT
        DATE(r.created_at) as date,
        COUNT(*) as total,
        COUNT(CASE WHEN r.status = 'SUCCESS' THEN 1 END) as successful,
        COUNT(CASE WHEN r.status = 'FAILED' THEN 1 END) as failed
      FROM engagement_runs r
      JOIN sites s ON r.site_id = s.id
      WHERE s.organization_id = ${orgId}
        AND r.created_at > NOW() - (${days}::int * INTERVAL '1 day')
      GROUP BY DATE(r.created_at)
      ORDER BY date ASC
    `;

    res.json({ runs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Engagement breakdown by type
router.get('/by-type', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orgId = req.user!.organizationId;

    const breakdown = await prisma.$queryRaw`
      SELECT
        e.engagement_type as type,
        COUNT(*) as total,
        COUNT(CASE WHEN r.status = 'SUCCESS' THEN 1 END) as successful
      FROM engagements e
      JOIN sites s ON e.site_id = s.id
      LEFT JOIN engagement_runs r ON r.engagement_id = e.id
      WHERE s.organization_id = ${orgId}
      GROUP BY e.engagement_type
      ORDER BY total DESC
    `;

    res.json({ breakdown });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Site performance
router.get('/site-performance', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orgId = req.user!.organizationId;

    const performance = await prisma.$queryRaw`
      SELECT
        s.id,
        s.name,
        s.platform,
        COUNT(r.id) as total_runs,
        COUNT(CASE WHEN r.status = 'SUCCESS' THEN 1 END) as successful,
        COUNT(CASE WHEN r.status = 'FAILED' THEN 1 END) as failed,
        AVG(CASE WHEN r.metadata->>'responseTime' IS NOT NULL
            THEN (r.metadata->>'responseTime')::int END) as avg_response_time
      FROM sites s
      LEFT JOIN engagement_runs r ON r.site_id = s.id
      WHERE s.organization_id = ${orgId}
      GROUP BY s.id, s.name, s.platform
      ORDER BY total_runs DESC
    `;

    res.json({ performance });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Recent activity
router.get('/recent-activity', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const limit = parseInt(req.query.limit as string) || 20;

    const activity = await prisma.engagementRun.findMany({
      where: { site: { organizationId: orgId } },
      include: {
        engagement: { select: { name: true, engagementType: true } },
        site: { select: { name: true, platform: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({ activity });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Audit logs
router.get('/audit-logs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { organizationId: orgId },
        include: { user: { select: { email: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where: { organizationId: orgId } }),
    ]);

    res.json({ logs, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
