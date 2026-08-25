import { Router, Response } from 'express';
import { z } from 'zod';
import { keyRotationService } from '../services/key-rotation.service';
import { validate } from '../middleware/validation';
import { authenticate, authorize, AuthenticatedRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';

const router = Router();

router.use(authenticate);
// Key material affects every tenant, so this is owner-only.
router.use(authorize('OWNER'));

/**
 * GET /security/rotation-status — how much data is still on an old key.
 */
router.get('/rotation-status', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await keyRotationService.getStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const rotateSchema = z.object({
  batchSize: z.number().int().min(1).max(1000).optional(),
  /** Loop until nothing is left rather than doing a single batch. */
  all: z.boolean().optional(),
});

/**
 * POST /security/rotate-keys — re-wrap stored credentials with the active key.
 *
 * Incremental and resumable: call repeatedly (or pass `all`) until `remaining`
 * reaches 0, then retire the old key from ENCRYPTION_KEYS.
 */
router.post('/rotate-keys', validate(rotateSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const batchSize = req.body.batchSize ?? 100;

    const result = req.body.all
      ? await keyRotationService.rotateAll(batchSize)
      : await keyRotationService.rotateCredentials(batchSize);

    await auditLog(req.user!.organizationId, req.user!.id, {
      action: 'ENCRYPTION_KEYS_ROTATED',
      resource: 'security',
      details: {
        rotated: result.rotated,
        failed: result.failed,
        remaining: result.remaining,
      },
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /security/verify-keys — confirm every stored credential is still
 * readable with the keys this process holds. Run before dropping an old key.
 */
router.post('/verify-keys', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await keyRotationService.verifyAll();
    res.json({
      ...result,
      ok: result.unreadable.length === 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
