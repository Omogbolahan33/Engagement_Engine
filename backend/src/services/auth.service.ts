import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { config } from '../config';
import { generateToken, hash } from '../utils/encryption';
import { UnauthorizedError, ConflictError, NotFoundError, ForbiddenError } from '../middleware/errorHandler';
import { auditLog } from '../middleware/audit';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('auth-service');

/** How long a half-completed (password-verified, MFA-pending) login stays valid. */
const MFA_CHALLENGE_TTL_SECONDS = 300;
/** Code guesses allowed per challenge before it is burned. */
const MFA_MAX_ATTEMPTS = 5;

interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  organizationName?: string;
}

interface LoginInput {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Login either completes, or halts on an MFA challenge. The challenge carries an
 * opaque, short-lived token instead of the real session tokens — password alone
 * must never mint a usable session when 2FA is on.
 */
export type LoginResult =
  | { mfaRequired: true; mfaToken: string; expiresInSeconds: number }
  | { mfaRequired?: false; user: any; tokens: TokenPair };

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export class AuthService {
  /**
   * Register a new user and organization
   */
  async register(input: RegisterInput) {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, config.security.bcryptRounds);
    const orgSlug = (input.organizationName || input.email.split('@')[0])
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-');

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: input.organizationName || `${input.firstName || 'User'}'s Organization`,
          slug: orgSlug,
        },
      });

      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          email: input.email.toLowerCase(),
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          role: 'OWNER',
        },
      });

      return { user, organization: org };
    });

    log.info('User registered', { userId: result.user.id, orgId: result.organization.id });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role,
      },
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
      },
    };
  }

  /**
   * Login with email/password
   */
  async login(input: LoginInput): Promise<LoginResult> {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.isActive) {
      throw new ForbiddenError('Account is disabled');
    }

    // Check account lockout
    const lockoutKey = `lockout:${user.id}`;
    const { redis } = await import('../config/redis');
    const lockoutData = await redis.get(lockoutKey);

    if (lockoutData) {
      const { attempts, lockedUntil } = JSON.parse(lockoutData);
      if (lockedUntil && new Date(lockedUntil) > new Date()) {
        const minutesLeft = Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000);
        throw new ForbiddenError(`Account locked. Try again in ${minutesLeft} minutes.`);
      }
    }

    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValidPassword) {
      // Track failed attempts
      const attempts = lockoutData ? JSON.parse(lockoutData).attempts + 1 : 1;
      const maxAttempts = config.security.maxLoginAttempts;

      if (attempts >= maxAttempts) {
        const lockedUntil = new Date(Date.now() + config.security.lockoutDurationMs);
        await redis.setex(lockoutKey, Math.ceil(config.security.lockoutDurationMs / 1000),
          JSON.stringify({ attempts, lockedUntil: lockedUntil.toISOString() })
        );
        throw new ForbiddenError(`Account locked after ${maxAttempts} failed attempts. Try again in ${Math.ceil(config.security.lockoutDurationMs / 60000)} minutes.`);
      }

      await redis.setex(lockoutKey, 3600, JSON.stringify({ attempts, lockedUntil: null }));
      throw new UnauthorizedError(`Invalid credentials. ${maxAttempts - attempts} attempts remaining.`);
    }

    // Clear lockout on successful login
    await redis.del(lockoutKey).catch(() => {});

    // Password is correct — but if 2FA is on, stop here and issue a challenge.
    if (user.mfaEnabled) {
      const mfaToken = generateToken(48);
      await redis.setex(
        `mfa:pending:${hash(mfaToken)}`,
        MFA_CHALLENGE_TTL_SECONDS,
        JSON.stringify({
          userId: user.id,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        })
      );

      log.info('MFA challenge issued', { userId: user.id });
      return {
        mfaRequired: true,
        mfaToken,
        expiresInSeconds: MFA_CHALLENGE_TTL_SECONDS,
      };
    }

    return this.issueSession(user, input.ipAddress, input.userAgent);
  }

  /**
   * Second leg of an MFA login: exchange the challenge token + TOTP/backup code
   * for a real session.
   */
  async completeMfaLogin(input: {
    mfaToken: string;
    code: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<LoginResult> {
    const { redis } = await import('../config/redis');
    const challengeKey = `mfa:pending:${hash(input.mfaToken)}`;
    const raw = await redis.get(challengeKey);

    if (!raw) {
      throw new UnauthorizedError('MFA challenge expired or invalid. Please log in again.');
    }

    const { userId } = JSON.parse(raw) as { userId: string };

    // Rate-limit code guesses against this challenge.
    const attemptsKey = `mfa:attempts:${hash(input.mfaToken)}`;
    const attempts = await redis.incr(attemptsKey);
    await redis.expire(attemptsKey, MFA_CHALLENGE_TTL_SECONDS);

    if (attempts > MFA_MAX_ATTEMPTS) {
      await redis.del(challengeKey);
      log.warn('MFA challenge burned after too many attempts', { userId });
      throw new ForbiddenError('Too many incorrect codes. Please log in again.');
    }

    const { twoFactorService } = await import('./two-factor.service');
    const { valid, usedBackupCode } = await twoFactorService.verify(userId, input.code);

    if (!valid) {
      throw new UnauthorizedError(
        `Invalid code. ${Math.max(0, MFA_MAX_ATTEMPTS - attempts)} attempts remaining.`
      );
    }

    // Single-use: burn the challenge as soon as it succeeds.
    await redis.del(challengeKey, attemptsKey);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (usedBackupCode) {
      log.warn('Login completed with a backup code', { userId });
    }

    return this.issueSession(user, input.ipAddress, input.userAgent);
  }

  /**
   * Create the session row, mint tokens, and record the login. Shared by the
   * plain and MFA login paths so both stay identical.
   */
  private async issueSession(
    user: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResult> {
    const session = await prisma.userSession.create({
      data: {
        userId: user.id,
        token: generateToken(64),
        ipAddress,
        userAgent,
        expiresAt: new Date(Date.now() + config.security.sessionExpiryMs),
      },
    });

    const tokens = this.generateTokenPair(user.id, session.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await auditLog(user.organizationId, user.id, {
      action: 'USER_LOGIN',
      resource: 'auth',
      details: { ipAddress, mfa: user.mfaEnabled === true },
    });

    log.info('User logged in', { userId: user.id });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
        organization: {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
          plan: user.organization.plan,
        },
      },
      tokens,
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<TokenPair> {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.secret, {
        issuer: config.jwt.issuer,
      }) as { userId: string; sessionId: string; type: string };

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedError('Invalid token type');
      }

      const session = await prisma.userSession.findUnique({
        where: { id: decoded.sessionId },
      });

      if (!session || session.expiresAt < new Date()) {
        throw new UnauthorizedError('Session expired');
      }

      return this.generateTokenPair(decoded.userId, decoded.sessionId);
    } catch (error) {
      throw new UnauthorizedError('Invalid refresh token');
    }
  }

  /**
   * Logout (invalidate session)
   */
  async logout(sessionId: string): Promise<void> {
    await prisma.userSession.delete({
      where: { id: sessionId },
    });
  }

  /**
   * Generate token pair
   */
  private generateTokenPair(userId: string, sessionId: string): TokenPair {
    const accessToken = jwt.sign(
      { userId, sessionId, type: 'access' },
      config.jwt.secret,
      {
        expiresIn: config.jwt.accessTokenExpiry,
        issuer: config.jwt.issuer,
      } as jwt.SignOptions
    );

    const refreshToken = jwt.sign(
      { userId, sessionId, type: 'refresh' },
      config.jwt.secret,
      {
        expiresIn: config.jwt.refreshTokenExpiry,
        issuer: config.jwt.issuer,
      } as jwt.SignOptions
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: config.jwt.accessTokenExpiry,
    };
  }
}

export const authService = new AuthService();
