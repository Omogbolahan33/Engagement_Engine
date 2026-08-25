import { Router, Response } from 'express';
import { z } from 'zod';
import { metricsService } from '../services/metrics.service';
import { validate } from '../middleware/validation';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// Comprehensive metrics
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { siteId, engagementId, dateFrom, dateTo, engagementType } = req.query;
    const metrics = await metricsService.getOrganizationMetrics(req.user!.organizationId, {
      siteId: siteId as string,
      engagementId: engagementId as string,
      engagementType: engagementType as string,
      dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
      dateTo: dateTo ? new Date(dateTo as string) : undefined,
    });
    res.json({ metrics });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Run history with pagination and filters
router.get('/runs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await metricsService.getRunHistory(req.user!.organizationId, {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
      status: req.query.status as string,
      engagementId: req.query.engagementId as string,
      siteId: req.query.siteId as string,
      engagementType: req.query.engagementType as string,
      dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
      dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
      sortBy: req.query.sortBy as string,
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Single run detail with full request/response
router.get('/runs/:runId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const run = await metricsService.getRunDetail(req.params.runId, req.user!.organizationId);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }
    res.json({ run });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Failure analysis
router.get('/failures', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const analysis = await metricsService.getFailureAnalysis(req.user!.organizationId, {
      siteId: req.query.siteId as string,
      dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
      dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
    });
    res.json({ analysis });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
