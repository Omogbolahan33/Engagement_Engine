import { Router, Response } from 'express';
import { z } from 'zod';
import { metaOAuthService } from '../services/oauth/meta-oauth.service';
import { credentialService } from '../services/credential.service';
import { validate } from '../middleware/validation';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../config/database';
import { auditLog } from '../middleware/audit';
import { createContextLogger } from '../utils/logger';
import { encrypt, decrypt, currentKeyVersion } from '../utils/encryption';

const log = createContextLogger('oauth-controller');

const router = Router();
router.use(authenticate);

/**
 * Meta OAuth Configuration
 * In production, these come from environment variables or per-organization settings
 */
const getMetaConfig = (req: AuthenticatedRequest) => ({
  appId: process.env.META_APP_ID || '',
  appSecret: process.env.META_APP_SECRET || '',
  redirectUri: process.env.META_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/v1/oauth/meta/callback`,
  apiVersion: 'v21.0',
});

// ============================================================
// META OAUTH FLOW
// ============================================================

/**
 * Step 1: Get Meta OAuth authorization URL
 * Frontend redirects user to this URL to grant permissions
 */
router.get('/meta/authorize', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const platform = (req.query.platform as string) || 'facebook';
    const scopePreset = (req.query.scope_preset as string) || 'full_access';
    const siteId = req.query.site_id as string;

    if (!['facebook', 'instagram', 'threads'].includes(platform)) {
      res.status(400).json({ error: 'Invalid platform. Must be facebook, instagram, or threads' });
      return;
    }

    const config = getMetaConfig(req);

    if (!config.appId || !config.appSecret) {
      res.status(500).json({
        error: 'Meta OAuth not configured. Set META_APP_ID and META_APP_SECRET environment variables.',
      });
      return;
    }

    // Generate state parameter for CSRF protection
    const state = Buffer.from(JSON.stringify({
      userId: req.user!.id,
      orgId: req.user!.organizationId,
      siteId,
      platform,
      scopePreset,
      nonce: Math.random().toString(36).substring(2),
    })).toString('base64');

    const { url, scopes } = metaOAuthService.getAuthorizationUrl(config, scopePreset, state, platform as any);

    log.info('Meta OAuth authorization initiated', {
      userId: req.user!.id,
      platform,
      scopePreset,
    });

    res.json({
      authorizationUrl: url,
      scopes,
      platform,
      state,
    });
  } catch (error: any) {
    log.error('Meta OAuth authorize error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Step 2: Meta OAuth callback
 * Meta redirects back here after user grants permissions
 * This exchanges the code for tokens and stores credentials
 */
router.get('/meta/callback', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      log.warn('Meta OAuth denied by user', { error: oauthError });
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/credentials?error=denied`);
      return;
    }

    if (!code || !state) {
      res.status(400).json({ error: 'Missing code or state parameter' });
      return;
    }

    // Decode and validate state
    let stateData: any;
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    } catch {
      res.status(400).json({ error: 'Invalid state parameter' });
      return;
    }

    const config = getMetaConfig(req);

    // Complete the OAuth flow
    const oauthResult = await metaOAuthService.completeOAuthFlow(
      config,
      code as string,
      stateData.platform
    );

    // Build credential data
    const credentialData = metaOAuthService.buildCredentialData(oauthResult);

    // Store as credential
    const credential = await credentialService.create(
      {
        siteId: stateData.siteId,
        name: `Meta ${stateData.platform} - ${oauthResult.user.name}`,
        authType: stateData.platform === 'instagram' ? 'LINKEDIN_OAUTH2' : 'FACEBOOK_LOGIN',
        credentialData,
        metadata: {
          platform: stateData.platform,
          userName: oauthResult.user.name,
          userId: oauthResult.user.id,
          pages: oauthResult.pages,
          instagramAccounts: oauthResult.instagramAccounts,
          threadsProfile: oauthResult.threadsProfile,
          expiresAt: oauthResult.expiresAt.toISOString(),
        },
        expiresAt: oauthResult.expiresAt,
        refreshStrategy: 'OAUTH2_REFRESH_TOKEN',
      },
      stateData.orgId
    );

    await auditLog(stateData.orgId, stateData.userId, {
      action: 'META_OAUTH_COMPLETED',
      resource: 'credential',
      resourceId: credential.id,
      details: {
        platform: stateData.platform,
        userId: oauthResult.user.id,
        pagesCount: oauthResult.pages.length,
        instagramAccountsCount: oauthResult.instagramAccounts.length,
      },
    });

    log.info('Meta OAuth completed', {
      credentialId: credential.id,
      platform: stateData.platform,
      user: oauthResult.user.name,
    });

    // Redirect to frontend with success
    res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:3000'}/credentials?success=true&credential_id=${credential.id}`
    );
  } catch (error: any) {
    log.error('Meta OAuth callback error', { error: error.message });
    res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:3000'}/credentials?error=${encodeURIComponent(error.message)}`
    );
  }
});

/**
 * Refresh a Meta credential's token
 */
router.post('/meta/refresh/:credentialId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const credential = await prisma.credential.findFirst({
      where: {
        id: req.params.credentialId,
        site: { organizationId: req.user!.organizationId },
      },
    });

    if (!credential) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }

    const data = JSON.parse(decrypt(credential.encryptedData));
    const config = getMetaConfig(req);

    const refreshed = await metaOAuthService.refreshLongLivedToken(config, data.accessToken);

    // Update credential with new token
    const updatedData = {
      ...data,
      accessToken: refreshed.access_token,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    };

    await prisma.credential.update({
      where: { id: credential.id },
      data: {
        encryptedData: encrypt(JSON.stringify(updatedData)),
        keyVersion: currentKeyVersion(),
        lastRefreshAt: new Date(),
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });

    await auditLog(req.user!.organizationId, req.user!.id, {
      action: 'META_TOKEN_REFRESHED',
      resource: 'credential',
      resourceId: credential.id,
    });

    log.info('Meta token refreshed', { credentialId: credential.id });

    res.json({
      message: 'Token refreshed successfully',
      expiresAt: updatedData.expiresAt,
    });
  } catch (error: any) {
    log.error('Meta token refresh error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get Meta scope presets (for UI)
 */
router.get('/meta/scopes', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const presets = metaOAuthService.getScopePresets();
    res.json({ presets });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Debug a Meta token (check validity, expiry, scopes)
 */
router.post('/meta/debug-token', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { credentialId } = req.body;

    const credential = await prisma.credential.findFirst({
      where: {
        id: credentialId,
        site: { organizationId: req.user!.organizationId },
      },
    });

    if (!credential) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }

    const data = JSON.parse(decrypt(credential.encryptedData));
    const config = getMetaConfig(req);

    // Use the app token to debug the user token
    const appTokenUrl = `https://graph.facebook.com/oauth/access_token?client_id=${config.appId}&client_secret=${config.appSecret}&grant_type=client_credentials`;
    const appTokenResp = await fetch(appTokenUrl);
    const appTokenData = await appTokenResp.json() as any;

    const tokenInfo = await metaOAuthService.debugToken(appTokenData.access_token, data.accessToken);

    res.json({
      isValid: tokenInfo.is_valid,
      expiresAt: new Date(tokenInfo.expires_at * 1000).toISOString(),
      scopes: tokenInfo.scopes,
      appId: tokenInfo.app_id,
      userId: tokenInfo.user_id,
      type: tokenInfo.type,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
