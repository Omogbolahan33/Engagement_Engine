import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../config/database';
import { hash } from '../utils/encryption';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('auth');

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    organizationId: string;
    firstName?: string | null;
    lastName?: string | null;
  };
  /** Session backing this request — lets handlers flag the caller's own session. */
  sessionId?: string;
  apiKey?: {
    id: string;
    organizationId: string;
    permissions: string[];
  };
}

/**
 * lastActiveAt is written at most once per session per this interval.
 * Without the throttle every authenticated request would issue a write.
 */
const ACTIVITY_WRITE_INTERVAL_MS = 60_000;

/**
 * JWT Authentication middleware
 */
export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check for API key first
    const apiKeyHeader = req.headers['x-api-key'] as string;
    if (apiKeyHeader) {
      return authenticateApiKey(req, res, next, apiKeyHeader);
    }

    // Check for Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
    }) as { userId: string; sessionId: string };

    // Verify session exists and is valid
    const session = await prisma.userSession.findUnique({
      where: { id: decoded.sessionId },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      res.status(401).json({ error: 'Session expired' });
      return;
    }

    // Explicitly revoked from the session manager — reject even though the JWT
    // itself is still within its lifetime.
    if (session.revokedAt) {
      res.status(401).json({ error: 'Session revoked' });
      return;
    }

    if (!session.user.isActive) {
      res.status(401).json({ error: 'Account disabled' });
      return;
    }

    req.user = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
      organizationId: session.user.organizationId,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
    };
    req.sessionId = session.id;

    // Refresh activity timestamp, throttled. Fire-and-forget: a failed
    // bookkeeping write must not fail the request.
    if (Date.now() - session.lastActiveAt.getTime() > ACTIVITY_WRITE_INTERVAL_MS) {
      prisma.userSession
        .update({ where: { id: session.id }, data: { lastActiveAt: new Date() } })
        .catch((error) => log.warn('Failed to update session activity', { error }));
    }

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    log.error('Auth middleware error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * API Key Authentication middleware
 */
async function authenticateApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  apiKey: string
): Promise<void> {
  try {
    const keyHash = hash(apiKey);

    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { organization: true },
    });

    if (!apiKeyRecord || !apiKeyRecord.isActive) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
      res.status(401).json({ error: 'API key expired' });
      return;
    }

    // Update last used
    await prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    });

    req.apiKey = {
      id: apiKeyRecord.id,
      organizationId: apiKeyRecord.organizationId,
      permissions: apiKeyRecord.permissions as string[],
    };

    next();
  } catch (error) {
    log.error('API key auth error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Role-based authorization middleware
 */
export function authorize(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Permission-based authorization for API keys
 */
export function requirePermission(...permissions: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (req.apiKey) {
      const hasPermission = permissions.some((p) =>
        req.apiKey!.permissions.includes(p) || req.apiKey!.permissions.includes('*')
      );
      if (!hasPermission) {
        res.status(403).json({ error: 'Insufficient API key permissions' });
        return;
      }
    }
    next();
  };
}
