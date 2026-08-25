import { Router, Response } from 'express';
import { platformService } from '../services/platform.service';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// List all platforms (built-in + custom)
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category } = req.query;
    let platforms = await platformService.getAllPlatforms(req.user!.organizationId);
    if (category) {
      platforms = platforms.filter((p) => p.category === category);
    }
    res.json({ platforms });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get platform categories
router.get('/categories', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const categories = platformService.getCategories();
    res.json({ categories });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single platform definition
router.get('/:type', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const platform = platformService.getPlatform(req.params.type);
    if (!platform) {
      res.status(404).json({ error: 'Platform not found' });
      return;
    }
    res.json({ platform });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
