import { prisma } from '../config/database';
import { decrypt, encrypt, currentKeyVersion } from '../utils/encryption';
import { metaOAuthService } from './oauth/meta-oauth.service';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('credential-refresh');

/**
 * Credential Auto-Refresh Service
 * Automatically refreshes tokens before they expire
 * Supports OAuth2 refresh tokens, Meta long-lived tokens, etc.
 */

export class CredentialRefreshService {
  /**
   * Check all credentials and refresh those nearing expiry
   * Should be called periodically (e.g., every hour via cron)
   */
  async refreshExpiringCredentials(): Promise<{ refreshed: number; failed: number }> {
    const now = new Date();
    const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

    // Find credentials expiring within 24 hours that have refresh strategy
    const expiring = await prisma.credential.findMany({
      where: {
        isActive: true,
        expiresAt: { lte: soon, gte: now },
        refreshStrategy: { not: 'NONE' },
      },
      include: { site: true },
    });

    log.info(`Found ${expiring.length} credentials needing refresh`);

    let refreshed = 0;
    let failed = 0;

    for (const credential of expiring) {
      try {
        await this.refreshCredential(credential);
        refreshed++;
        log.info('Credential refreshed', { credentialId: credential.id, name: credential.name });
      } catch (error: any) {
        failed++;
        log.error('Credential refresh failed', {
          credentialId: credential.id,
          error: error.message,
        });

        // Log the failure
        await prisma.engagementLog.create({
          data: {
            engagementId: '', // System-level log
            level: 'WARN',
            message: `Credential "${credential.name}" refresh failed: ${error.message}`,
            data: { credentialId: credential.id, error: error.message },
          },
        }).catch(() => {});
      }
    }

    return { refreshed, failed };
  }

  /**
   * Refresh a single credential based on its auth type and refresh strategy
   */
  async refreshCredential(credential: any): Promise<void> {
    const data = JSON.parse(decrypt(credential.encryptedData));
    const authType = credential.authType;

    let newData = { ...data };

    switch (authType) {
      // Meta OAuth tokens
      case 'FACEBOOK_LOGIN':
      case 'GOOGLE_OAUTH2':
      case 'LINKEDIN_OAUTH2':
        newData = await this.refreshOAuthToken(data);
        break;

      // Twitter OAuth 2.0
      case 'TWITTER_OAUTH2':
        newData = await this.refreshTwitterToken(data);
        break;

      // Generic OAuth2 with refresh token
      case 'OAUTH2_AUTHORIZATION_CODE':
      case 'OAUTH2_CLIENT_CREDENTIALS':
        newData = await this.refreshGenericOAuth2(data);
        break;

      // Session tokens - can't auto-refresh, just flag as expired
      case 'SESSION_TOKEN':
      case 'COOKIE_AUTH':
      case 'SESSION_COOKIE':
        log.warn('Session-based credential cannot be auto-refreshed', {
          credentialId: credential.id,
        });
        return;

      default:
        log.warn('No refresh handler for auth type', {
          credentialId: credential.id,
          authType,
        });
        return;
    }

    // Update credential with new data
    const newExpiresAt = newData.expiresAt ? new Date(newData.expiresAt) : null;

    await prisma.credential.update({
      where: { id: credential.id },
      data: {
        encryptedData: encrypt(JSON.stringify(newData)),
        keyVersion: currentKeyVersion(),
        lastRefreshAt: new Date(),
        expiresAt: newExpiresAt,
      },
    });
  }

  /**
   * Refresh Meta (Facebook/Instagram) OAuth token
   */
  private async refreshOAuthToken(data: Record<string, any>): Promise<Record<string, any>> {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error('Meta OAuth not configured (missing META_APP_ID or META_APP_SECRET)');
    }

    const result = await metaOAuthService.refreshLongLivedToken(
      { appId, appSecret, redirectUri: '' },
      data.accessToken
    );

    return {
      ...data,
      accessToken: result.access_token,
      expiresAt: new Date(Date.now() + result.expires_in * 1000).toISOString(),
    };
  }

  /**
   * Refresh Twitter OAuth 2.0 token
   */
  private async refreshTwitterToken(data: Record<string, any>): Promise<Record<string, any>> {
    if (!data.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${data.clientId}:${data.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: data.refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Twitter token refresh failed: ${response.status}`);
    }

    const result = await response.json() as any;

    return {
      ...data,
      accessToken: result.access_token,
      refreshToken: result.refresh_token || data.refreshToken,
      expiresAt: new Date(Date.now() + result.expires_in * 1000).toISOString(),
    };
  }

  /**
   * Refresh generic OAuth2 token
   */
  private async refreshGenericOAuth2(data: Record<string, any>): Promise<Record<string, any>> {
    if (!data.refreshToken || !data.tokenUrl) {
      throw new Error('Missing refreshToken or tokenUrl');
    }

    const response = await fetch(data.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: data.refreshToken,
        client_id: data.clientId,
        client_secret: data.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`OAuth2 refresh failed: ${response.status}`);
    }

    const result = await response.json() as any;

    return {
      ...data,
      accessToken: result.access_token,
      refreshToken: result.refresh_token || data.refreshToken,
      expiresAt: result.expires_in
        ? new Date(Date.now() + result.expires_in * 1000).toISOString()
        : data.expiresAt,
    };
  }

  /**
   * Check credential health for a site
   */
  async checkCredentialHealth(siteId: string) {
    const credentials = await prisma.credential.findMany({
      where: { siteId },
    });

    const now = new Date();

    return credentials.map((cred) => {
      const isExpired = cred.expiresAt && cred.expiresAt < now;
      const isExpiringSoon = cred.expiresAt && cred.expiresAt < new Date(now.getTime() + 48 * 60 * 60 * 1000);
      const canRefresh = cred.refreshStrategy && cred.refreshStrategy !== 'NONE';

      let status = 'healthy';
      if (isExpired) status = canRefresh ? 'expired_refreshable' : 'expired';
      else if (isExpiringSoon) status = canRefresh ? 'expiring_refreshable' : 'expiring';

      return {
        id: cred.id,
        name: cred.name,
        authType: cred.authType,
        isActive: cred.isActive,
        expiresAt: cred.expiresAt,
        lastUsedAt: cred.lastUsedAt,
        lastRefreshAt: cred.lastRefreshAt,
        refreshStrategy: cred.refreshStrategy,
        status,
        canRefresh,
      };
    });
  }
}

export const credentialRefreshService = new CredentialRefreshService();
