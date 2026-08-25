import { Router, Response } from 'express';
import { z } from 'zod';
import { engagementService } from '../services/engagement.service';
import { enqueueEngagement, scheduleEngagement } from '../services/queue.service';
import { validate } from '../middleware/validation';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { EngagementType, EngagementStatus } from '@prisma/client';

const router = Router();
router.use(authenticate);

const createEngagementSchema = z.object({
  siteId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  engagementType: z.nativeEnum(EngagementType),
  config: z.record(z.any()).optional(),
  targetConfig: z.record(z.any()),
  schedule: z.record(z.any()).optional(),
  frequency: z.object({
    maxPerMinute: z.number().min(1).optional(),
    maxPerHour: z.number().min(1).optional(),
    maxPerDay: z.number().min(1).optional(),
    maxPerWeek: z.number().min(1).optional(),
    maxTotal: z.number().min(1).optional(),
    cooldownMs: z.number().min(0).optional(),
    jitterMs: z.number().min(0).optional(),
    backoffStrategy: z.enum(['NONE', 'LINEAR', 'EXPONENTIAL', 'FIBONACCI']).optional(),
  }).optional(),
  expiresAt: z.string().datetime().optional(),
  priority: z.number().min(1).max(10).optional(),
  retryConfig: z.record(z.any()).optional(),
});

const updateEngagementSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  config: z.record(z.any()).optional(),
  targetConfig: z.record(z.any()).optional(),
  schedule: z.record(z.any()).optional(),
  frequency: z.record(z.any()).optional(),
  expiresAt: z.string().datetime().optional(),
  status: z.nativeEnum(EngagementStatus).optional(),
  priority: z.number().min(1).max(10).optional(),
  retryConfig: z.record(z.any()).optional(),
});

// List engagements
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { siteId, engagementType, status } = req.query;
    const engagements = await engagementService.list(req.user!.organizationId, {
      siteId: siteId as string,
      engagementType: engagementType as EngagementType,
      status: status as EngagementStatus,
    });
    res.json({ engagements });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single engagement
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const engagement = await engagementService.getById(req.params.id, req.user!.organizationId);
    res.json({ engagement });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Create engagement
router.post('/', validate(createEngagementSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const engagement = await engagementService.create(
      { ...req.body, expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined },
      req.user!.organizationId
    );
    res.status(201).json({ engagement });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Update engagement
router.patch('/:id', validate(updateEngagementSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const engagement = await engagementService.update(
      req.params.id,
      { ...req.body, expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined },
      req.user!.organizationId
    );
    res.json({ engagement });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Delete engagement
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await engagementService.delete(req.params.id, req.user!.organizationId);
    res.json({ message: 'Engagement deleted' });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Activate engagement
router.post('/:id/activate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const engagement = await engagementService.activate(req.params.id, req.user!.organizationId);
    res.json({ engagement });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Pause engagement
router.post('/:id/pause', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const engagement = await engagementService.pause(req.params.id, req.user!.organizationId);
    res.json({ engagement });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Execute engagement now
router.post('/:id/execute', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const engagement = await engagementService.getById(req.params.id, req.user!.organizationId);
    const job = await enqueueEngagement(req.params.id, {
      credentialId: req.body.credentialId,
      priority: req.body.priority,
    });
    res.json({ message: 'Engagement queued for execution', jobId: job.id });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Schedule engagement
router.post('/:id/schedule', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cronExpression } = req.body;
    if (!cronExpression) {
      res.status(400).json({ error: 'cronExpression is required' });
      return;
    }
    await scheduleEngagement(req.params.id, cronExpression);
    res.json({ message: 'Engagement scheduled' });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Get engagement stats
router.get('/:id/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await engagementService.getStats(req.params.id, req.user!.organizationId);
    res.json({ stats });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

export default router;
