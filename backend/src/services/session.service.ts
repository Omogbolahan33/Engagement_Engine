import { prisma } from '../config/database';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('session');

/**
 * Session Management Service
 * View, revoke, and manage user sessions
 * Supports multi-device session tracking
 */

export interface SessionInfo {
  id: string;
  device: string;
  browser: string;
  os: string;
  ipAddress: string;
  lastActive: Date;
  createdAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

export class SessionService {
  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string, currentSessionId?: string): Promise<SessionInfo[]> {
    const sessions = await prisma.userSession.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
        revokedAt: null,
      },
      orderBy: { lastActiveAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      ...this.parseUserAgent(s.userAgent || ''),
      ipAddress: s.ipAddress || 'Unknown',
      lastActive: s.lastActiveAt,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: s.id === currentSessionId,
    }));
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(sessionId: string, userId: string): Promise<boolean> {
    // Scoped by userId so one user cannot revoke another's session.
    const { count } = await prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count === 0) return false;

    log.info('Session revoked', { sessionId, userId });
    return true;
  }

  /**
   * Revoke all sessions except current
   */
  async revokeAllOtherSessions(userId: string, currentSessionId: string): Promise<number> {
    const { count } = await prisma.userSession.updateMany({
      where: {
        userId,
        id: { not: currentSessionId },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    log.info('All other sessions revoked', { userId, revoked: count });
    return count;
  }

  /**
   * Revoke all sessions (logout everywhere)
   */
  async revokeAllSessions(userId: string): Promise<number> {
    const { count } = await prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    log.info('All sessions revoked', { userId, revoked: count });
    return count;
  }

  /**
   * Hard-delete sessions that are expired or were revoked long enough ago that
   * they no longer have audit value. Revocation itself is a soft delete so the
   * auth middleware can answer "revoked" rather than "unknown session".
   */
  async cleanExpiredSessions(revokedRetentionDays = 30): Promise<number> {
    const revokedCutoff = new Date(Date.now() - revokedRetentionDays * 86400000);

    const { count } = await prisma.userSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { lt: revokedCutoff } },
        ],
      },
    });
    return count;
  }

  /**
   * Parse user agent string
   */
  private parseUserAgent(ua: string): { device: string; browser: string; os: string } {
    let device = 'Desktop';
    let browser = 'Unknown';
    let os = 'Unknown';

    // Device
    if (/mobile|android|iphone|ipad/i.test(ua)) device = 'Mobile';
    else if (/tablet|ipad/i.test(ua)) device = 'Tablet';

    // Browser
    if (/chrome/i.test(ua)) browser = 'Chrome';
    else if (/firefox/i.test(ua)) browser = 'Firefox';
    else if (/safari/i.test(ua)) browser = 'Safari';
    else if (/edge/i.test(ua)) browser = 'Edge';
    else if (/opera|opr/i.test(ua)) browser = 'Opera';

    // OS
    if (/windows/i.test(ua)) os = 'Windows';
    else if (/macintosh|mac os/i.test(ua)) os = 'macOS';
    else if (/linux/i.test(ua)) os = 'Linux';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';

    return { device, browser, os };
  }
}

export const sessionService = new SessionService();
