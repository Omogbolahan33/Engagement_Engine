import { Router, Response } from 'express';
import { z } from 'zod';
import { bulkOperationsService } from '../services/bulk-operations.service';
import { validate } from '../middleware/validation';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { EngagementStatus } from '@prisma/client';

const router = Router();
router.use(authenticate);

const bulkStatusSchema = z.object({
  engagementIds: z.array(z.string().uuid()).min(1).max(100),
  status: z.nativeEnum(EngagementStatus),
});

const bulkDeleteSchema = z.object({
  engagementIds: z.array(z.string().uuid()).min(1).max(100),
});

const cloneSchema = z.object({
  name: z.string().optional(),
  siteId: z.string().uuid().optional(),
  status: z.nativeEnum(EngagementStatus).optional(),
});

// Bulk update engagement status
router.post('/engagements/status', validate(bulkStatusSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await bulkOperationsService.bulkUpdateEngagementStatus(
      req.body.engagementIds,
      req.body.status,
      req.user!.organizationId,
      req.user!.id
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete (archive) engagements
router.post('/engagements/delete', validate(bulkDeleteSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await bulkOperationsService.bulkDeleteEngagements(
      req.body.engagementIds,
      req.user!.organizationId,
      req.user!.id
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Clone an engagement
router.post('/engagements/:id/clone', validate(cloneSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cloned = await bulkOperationsService.cloneEngagement(
      req.params.id,
      req.body,
      req.user!.organizationId
    );
    res.status(201).json({ engagement: cloned });
  } catch (error: any) {
    res.status(error.message === 'Engagement not found' ? 404 : 500).json({ error: error.message });
  }
});

// Dry-run an engagement
router.post('/engagements/:id/dry-run', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await bulkOperationsService.dryRunEngagement(
      req.params.id,
      req.user!.organizationId
    );
    res.json(result);
  } catch (error: any) {
    res.status(error.message === 'Engagement not found' ? 404 : 500).json({ error: error.message });
  }
});

// Export engagements
router.get('/export', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await bulkOperationsService.exportEngagements(req.user!.organizationId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="engagement-export-${Date.now()}.json"`);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
