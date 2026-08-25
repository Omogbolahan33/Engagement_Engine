import { Router, Response } from 'express';
import { z } from 'zod';
import { engagementFeatures } from '../services/engagement-features.service';
import { robustLogger } from '../services/robust-logger.service';
import { validate } from '../middleware/validation';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// ============================================================
// SCHEDULING WINDOWS
// ============================================================

router.post('/scheduling/check', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = engagementFeatures.isWithinSchedule(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// CONTENT ROTATION
// ============================================================

router.post('/content/next', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { engagementId, contents } = req.body;
    if (!engagementId || !contents?.length) {
      res.status(400).json({ error: 'engagementId and contents array required' });
      return;
    }
    const content = await engagementFeatures.getNextContent(engagementId, contents);
    res.json({ content });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// TARGET COOLDOWNS
// ============================================================

router.post('/cooldown/check', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { engagementId, targetId } = req.body;
    const result = await engagementFeatures.isTargetOnCooldown(engagementId, targetId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/cooldown/set', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { engagementId, targetId, cooldownHours } = req.body;
    await engagementFeatures.setTargetCooldown(engagementId, targetId, cooldownHours);
    res.json({ message: 'Cooldown set' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/cooldown/:engagementId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targets = await engagementFeatures.getCooldownTargets(req.params.engagementId);
    res.json({ targets });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ENGAGEMENT GROUPS
// ============================================================

router.post('/groups', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, engagementIds, settings } = req.body;
    const groupId = await engagementFeatures.createGroup(
      req.user!.organizationId,
      name,
      engagementIds,
      settings
    );
    res.status(201).json({ groupId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/groups/:groupId/next', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const engagementId = await engagementFeatures.getNextFromGroup(req.params.groupId);
    res.json({ engagementId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// HEALTH SCORING
// ============================================================

router.get('/health-score/:engagementId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const score = await engagementFeatures.calculateHealthScore(req.params.engagementId);
    res.json(score);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// A/B TESTING
// ============================================================

router.post('/ab-test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, engagementAId, engagementBId, splitPercent, durationHours, successMetric } = req.body;
    const testId = await engagementFeatures.createABTest(
      req.user!.organizationId,
      name,
      engagementAId,
      engagementBId,
      { splitPercent, durationHours, successMetric }
    );
    res.status(201).json({ testId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/ab-test/:testId/variant', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const engagementId = await engagementFeatures.getABVariant(req.params.testId);
    res.json({ engagementId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ab-test/:testId/conclude', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await engagementFeatures.concludeABTest(req.params.testId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// BLACKLISTS
// ============================================================

router.get('/blacklist', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const blacklist = await engagementFeatures.getBlacklist(req.user!.organizationId);
    res.json(blacklist);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/blacklist', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, entries } = req.body;
    await engagementFeatures.addToBlacklist(req.user!.organizationId, type, entries);
    res.json({ message: 'Added to blacklist' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/blacklist', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, entries } = req.body;
    await engagementFeatures.removeFromBlacklist(req.user!.organizationId, type, entries);
    res.json({ message: 'Removed from blacklist' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/blacklist/check', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await engagementFeatures.isBlacklisted(req.user!.organizationId, req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// CONDITIONS
// ============================================================

router.post('/conditions/evaluate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { engagementId, conditions, context } = req.body;
    const result = await engagementFeatures.evaluateConditions(engagementId, conditions, context);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// LOGS
// ============================================================

router.get('/logs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await robustLogger.search(req.user!.organizationId, {
      engagementId: req.query.engagementId as string,
      siteId: req.query.siteId as string,
      level: req.query.level as any,
      search: req.query.search as string,
      dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
      dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/logs/:engagementId/recent', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await robustLogger.getRecentLogs(req.params.engagementId, limit);
    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/logs/:engagementId/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const stats = await robustLogger.getLogStats(req.params.engagementId, hours);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
