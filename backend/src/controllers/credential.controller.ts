import { Router, Response } from 'express';
import { z } from 'zod';
import { credentialService } from '../services/credential.service';
import { validate } from '../middleware/validation';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { AuthType } from '@prisma/client';

const router = Router();
router.use(authenticate);

const createCredentialSchema = z.object({
  siteId: z.string().uuid(),
  name: z.string().min(1).max(100),
  authType: z.nativeEnum(AuthType),
  credentialData: z.record(z.any()),
  metadata: z.record(z.any()).optional(),
  expiresAt: z.string().datetime().optional(),
  refreshStrategy: z.enum(['NONE', 'AUTO_REFRESH', 'REFRESH_BEFORE_EXPIRY', 'REAUTH_ON_FAILURE', 'ROTATE_TOKENS', 'OAUTH2_REFRESH_TOKEN']).optional(),
});

const updateCredentialSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  authType: z.nativeEnum(AuthType).optional(),
  credentialData: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  expiresAt: z.string().datetime().optional(),
  refreshStrategy: z.string().optional(),
});

// Get auth type schemas (for UI form generation)
router.get('/auth-schemas', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schemas = credentialService.getAuthTypeSchemas();
    res.json({ schemas });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List credentials for a site
router.get('/site/:siteId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const credentials = await credentialService.listBySite(
      req.params.siteId,
      req.user!.organizationId
    );
    res.json({ credentials });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Create credential
router.post('/', validate(createCredentialSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const credential = await credentialService.create(
      { ...req.body, expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined },
      req.user!.organizationId
    );
    res.status(201).json({ credential });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Update credential
router.patch('/:id', validate(updateCredentialSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const credential = await credentialService.update(
      req.params.id,
      { ...req.body, expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined },
      req.user!.organizationId
    );
    res.json({ credential });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Delete credential
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await credentialService.delete(req.params.id, req.user!.organizationId);
    res.json({ message: 'Credential deleted' });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

export default router;
