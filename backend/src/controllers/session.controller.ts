import { Router, Response } from 'express';
import { sessionService } from '../services/session.service';
import { twoFactorService } from '../services/two-factor.service';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';

const router = Router();
router.use(authenticate);

// ============================================================
// SESSION MANAGEMENT
// ============================================================

// List all active sessions
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessions = await sessionService.getUserSessions(req.user!.id, req.sessionId);
    res.json({ sessions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Revoke a specific session
router.delete('/:sessionId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const revoked = await sessionService.revokeSession(req.params.sessionId, req.user!.id);
    if (!revoked) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    await auditLog(req.user!.organizationId, req.user!.id, {
      action: 'SESSION_REVOKED',
      resource: 'session',
      resourceId: req.params.sessionId,
    });
    res.json({ message: 'Session revoked' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Revoke all other sessions
router.post('/revoke-others', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.sessionId) {
      res.status(400).json({ error: 'This action requires a session token, not an API key' });
      return;
    }
    const count = await sessionService.revokeAllOtherSessions(req.user!.id, req.sessionId);
    await auditLog(req.user!.organizationId, req.user!.id, {
      action: 'ALL_OTHER_SESSIONS_REVOKED',
      resource: 'session',
      details: { revokedCount: count },
    });
    res.json({ message: `${count} sessions revoked` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// TWO-FACTOR AUTHENTICATION
// ============================================================

// Get 2FA status
router.get('/2fa/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const enabled = await twoFactorService.isEnabled(req.user!.id);
    res.json({ enabled });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Generate 2FA secret (returns QR code data)
router.post('/2fa/setup', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await twoFactorService.generateSecret(req.user!.id);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Verify and enable 2FA
router.post('/2fa/verify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ error: 'Code is required' });
      return;
    }
    const valid = await twoFactorService.verifyAndEnable(req.user!.id, code);
    if (!valid) {
      res.status(400).json({ error: 'Invalid code' });
      return;
    }
    await auditLog(req.user!.organizationId, req.user!.id, {
      action: '2FA_ENABLED',
      resource: 'user',
      resourceId: req.user!.id,
    });
    res.json({ message: '2FA enabled successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Disable 2FA
router.post('/2fa/disable', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }
    const disabled = await twoFactorService.disable(req.user!.id, password);
    if (!disabled) {
      res.status(400).json({ error: 'Invalid password' });
      return;
    }
    await auditLog(req.user!.organizationId, req.user!.id, {
      action: '2FA_DISABLED',
      resource: 'user',
      resourceId: req.user!.id,
    });
    res.json({ message: '2FA disabled' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Regenerate backup codes
router.post('/2fa/backup-codes', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const codes = await twoFactorService.regenerateBackupCodes(req.user!.id);
    res.json({ backupCodes: codes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
