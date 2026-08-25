import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import { emailService } from '../services/email.service';
import { validate } from '../middleware/validation';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';
import { generateToken, hash } from '../utils/encryption';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  organizationName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

// Routes
router.post('/register', rateLimiter(5, 60000), validate(registerSchema), async (req: Request, res: Response) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post('/login', rateLimiter(10, 60000), validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const result = await authService.login({
      ...req.body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json(result);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Second leg of an MFA login. The password step returns { mfaRequired, mfaToken };
// the client posts that token back here together with the TOTP or backup code.
const mfaLoginSchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().min(6).max(12),
});

router.post(
  '/login/2fa',
  rateLimiter(10, 60000),
  validate(mfaLoginSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await authService.completeMfaLogin({
        mfaToken: req.body.mfaToken,
        code: req.body.code,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
);

router.post('/refresh', validate(refreshTokenSchema), async (req: Request, res: Response) => {
  try {
    const tokens = await authService.refreshToken(req.body.refreshToken);
    res.json(tokens);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post('/logout', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Extract session ID from token
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.substring(7);
      const decoded = jwt.decode(token) as any;
      if (decoded?.sessionId) {
        await authService.logout(decoded.sessionId);
      }
    }
    res.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ user: req.user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Password reset request
router.post('/forgot-password', rateLimiter(3, 300000), async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.json({ message: 'If an account exists, a reset email has been sent' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetHash = hash(resetToken);

      // Store reset token in Redis with 1 hour TTL
      const { redis } = await import('../config/redis');
      await redis.set(`password-reset:${resetHash}`, user.id, 'EX', 3600);

      await emailService.sendPasswordReset(user.email, resetToken, user.firstName || undefined);
    }

    // Always return success to prevent email enumeration
    res.json({ message: 'If an account exists, a reset email has been sent' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Password reset confirmation
router.post('/reset-password', rateLimiter(5, 300000), async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      res.status(400).json({ error: 'Token and password are required' });
      return;
    }

    const resetHash = hash(token);
    const { redis } = await import('../config/redis');
    const userId = await redis.get(`password-reset:${resetHash}`);

    if (!userId) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Delete used token
    await redis.del(`password-reset:${resetHash}`);

    // Invalidate all sessions
    await prisma.userSession.deleteMany({ where: { userId } });

    res.json({ message: 'Password reset successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Email verification
router.post('/verify-email', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { redis } = await import('../config/redis');
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyHash = hash(verifyToken);

    await redis.set(`email-verify:${verifyHash}`, req.user!.id, 'EX', 86400);

    await emailService.sendEmailVerification(req.user!.email, verifyToken, req.user!.firstName || undefined);

    res.json({ message: 'Verification email sent' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Confirm email verification
router.get('/verify-email/confirm', async (req: Request, res: Response) => {
  try {
    const { token } = req.query;
    if (!token) {
      res.status(400).json({ error: 'Token required' });
      return;
    }

    const verifyHash = hash(token as string);
    const { redis } = await import('../config/redis');
    const userId = await redis.get(`email-verify:${verifyHash}`);

    if (!userId) {
      res.status(400).json({ error: 'Invalid or expired verification token' });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    await redis.del(`email-verify:${verifyHash}`);

    res.json({ message: 'Email verified successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Change password (authenticated)
router.post('/change-password', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current and new password are required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const bcrypt = await import('bcryptjs');
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
