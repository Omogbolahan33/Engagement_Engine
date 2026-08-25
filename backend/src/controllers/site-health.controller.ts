import { Router, Response } from 'express';
import { siteHealthService } from '../services/site-health.service';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// Get health summary for all sites
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const health = await siteHealthService.getOrganizationHealth(req.user!.organizationId);
    res.json(health);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Check health of a specific site
router.post('/:siteId/check', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await siteHealthService.checkSite(req.params.siteId);
    res.json(result);
  } catch (error: any) {
    res.status(error.message === 'Site not found' ? 404 : 500).json({ error: error.message });
  }
});

// Get cached health status for a site
router.get('/:siteId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await siteHealthService.getStatus(req.params.siteId);
    if (!status) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Check all sites
router.post('/check-all', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const results = await siteHealthService.checkAllSites(req.user!.organizationId);
    res.json({ results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
