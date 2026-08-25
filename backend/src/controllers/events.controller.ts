import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../config/database';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { realtimeService, RealtimePayload } from '../services/realtime.service';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('events-controller');

const router = Router();

/** Comment line every 25s so proxies don't reap an idle stream. */
const HEARTBEAT_MS = 25_000;

/**
 * The browser's EventSource cannot set an Authorization header, so the SSE route
 * additionally accepts `?token=<accessToken>`. It is otherwise the same check as
 * the normal middleware: verify the JWT, then confirm the session behind it is
 * still live. The token stays out of shared logs because morgan logs the path
 * only — but treat it as short-lived regardless.
 */
async function authenticateStream(
  req: AuthenticatedRequest,
  res: Response,
  next: () => void
): Promise<void> {
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;

  if (!queryToken) {
    // No query token: fall back to the standard header-based path.
    return authenticate(req, res, next);
  }

  try {
    const decoded = jwt.verify(queryToken, config.jwt.secret, {
      issuer: config.jwt.issuer,
    }) as { userId: string; sessionId: string };

    const session = await prisma.userSession.findUnique({
      where: { id: decoded.sessionId },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date() || session.revokedAt) {
      res.status(401).json({ error: 'Session expired' });
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
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * GET /events/stream — live event feed for the caller's organization.
 */
router.get('/stream', authenticateStream, async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = req.user!.organizationId;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Tell nginx not to buffer, or events arrive in batches at flush time.
    'X-Accel-Buffering': 'no',
  });

  // Flush headers immediately so the client's connection opens.
  res.write(': connected\n\n');
  res.write(`retry: 5000\n\n`);

  const send = (payload: RealtimePayload) => {
    // If the socket has already gone away, drop rather than throw.
    if (res.writableEnded) return;
    res.write(`event: ${payload.event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const unsubscribe = realtimeService.subscribe(organizationId, send);

  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;
    res.write(': ping\n\n');
  }, HEARTBEAT_MS);

  log.debug('SSE stream opened', {
    organizationId,
    userId: req.user!.id,
    connections: realtimeService.connections,
  });

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
    log.debug('SSE stream closed', { organizationId, userId: req.user!.id });
  };

  req.on('close', cleanup);
  res.on('error', cleanup);
});

/**
 * GET /events/status — connection count on this instance, for diagnostics.
 */
router.get('/status', authenticate, async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ connections: realtimeService.connections });
});

export default router;
