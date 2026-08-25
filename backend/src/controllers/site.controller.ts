import { Router, Response } from 'express';
import { z } from 'zod';
import { siteService } from '../services/site.service';
import { validate } from '../middleware/validation';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { PlatformType } from '@prisma/client';

const router = Router();

// All routes require authentication
router.use(authenticate);

const createSiteSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  platform: z.nativeEnum(PlatformType),
  description: z.string().optional(),
  settings: z.record(z.any()).optional(),
  rateLimits: z.record(z.any()).optional(),
});

const updateSiteSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  platform: z.nativeEnum(PlatformType).optional(),
  description: z.string().optional(),
  settings: z.record(z.any()).optional(),
  rateLimits: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

// List sites
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { platform, isActive } = req.query;
    const sites = await siteService.list(req.user!.organizationId, {
      platform: platform as PlatformType | undefined,
      isActive: isActive ? isActive === 'true' : undefined,
    });
    res.json({ sites });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single site
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const site = await siteService.getById(req.params.id, req.user!.organizationId);
    res.json({ site });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Create site
router.post('/', validate(createSiteSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const site = await siteService.create(req.body, req.user!.organizationId);
    res.status(201).json({ site });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Update site
router.patch('/:id', validate(updateSiteSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const site = await siteService.update(req.params.id, req.body, req.user!.organizationId);
    res.json({ site });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Delete site
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await siteService.delete(req.params.id, req.user!.organizationId);
    res.json({ message: 'Site deleted' });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Get site stats
router.get('/:id/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await siteService.getStats(req.params.id, req.user!.organizationId);
    res.json({ stats });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

export default router;
