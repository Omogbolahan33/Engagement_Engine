import { Router, Response } from 'express';
import { gdprService } from '../services/gdpr.service';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';

const router = Router();
router.use(authenticate);

// Export all user data
router.get('/export', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await gdprService.exportUserData(req.user!.id, req.user!.organizationId);

    await auditLog(req.user!.organizationId, req.user!.id, {
      action: 'GDPR_DATA_EXPORT',
      resource: 'user',
      resourceId: req.user!.id,
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="gdpr-export-${Date.now()}.json"`);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get data summary
router.get('/data-summary', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const summary = await gdprService.getDataSummary(req.user!.organizationId);
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user account
router.post('/delete-account', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const result = await gdprService.deleteAccount(req.user!.id, password);
    if (!result.success) {
      res.status(400).json({ error: result.message });
      return;
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete organization (owner only)
router.post('/delete-organization', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await gdprService.deleteOrganization(req.user!.organizationId, req.user!.id);
    if (!result.success) {
      res.status(400).json({ error: result.message });
      return;
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
