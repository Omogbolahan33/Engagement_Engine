import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { webhookService, WEBHOOK_EVENTS } from '../services/webhook.service';
import { encrypt } from '../utils/encryption';
import { validate } from '../middleware/validation';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';

const router = Router();
router.use(authenticate);

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  secret: z.string().optional(),
});

// List webhooks
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { organizationId: req.user!.organizationId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ webhooks });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get available event types
router.get('/events', async (req: AuthenticatedRequest, res: Response) => {
  res.json({ events: WEBHOOK_EVENTS });
});

// Create webhook
router.post('/', validate(createWebhookSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const webhook = await prisma.webhook.create({
      data: {
        organizationId: req.user!.organizationId,
        url: req.body.url,
        events: req.body.events,
        encryptedSecret: req.body.secret ? encrypt(req.body.secret) : null,
      },
    });

    await auditLog(req.user!.organizationId, req.user!.id, {
      action: 'WEBHOOK_CREATED',
      resource: 'webhook',
      resourceId: webhook.id,
    });

    res.status(201).json({ webhook });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Test webhook
router.post('/:id/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await webhookService.test(req.params.id, req.user!.organizationId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete webhook
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.webhook.deleteMany({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });
    res.json({ message: 'Webhook deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
