import { Router, Response } from 'express';
import { templateService } from '../services/template.service';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// List all templates
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category, platform, search } = req.query;
    const templates = templateService.getAll({
      category: category as string,
      platform: platform as string,
      search: search as string,
    });
    res.json({ templates });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get template categories
router.get('/categories', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const categories = templateService.getCategories();
    res.json({ categories });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single template
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const template = templateService.getById(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ template });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create engagement from template
router.post('/:id/create', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { siteId, name, targetConfig, frequency } = req.body;
    if (!siteId) {
      res.status(400).json({ error: 'siteId is required' });
      return;
    }
    const engagement = templateService.createFromTemplate(req.params.id, siteId, {
      name,
      targetConfig,
      frequency,
    });
    res.json({ engagement });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
