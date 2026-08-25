import { prisma } from '../../config/database';
import { encrypt, decrypt } from '../../utils/encryption';
import { createContextLogger } from '../../utils/logger';
import { AppError } from '../../middleware/errorHandler';

const log = createContextLogger('meta-oauth');

/**
 * Meta (Facebook/Instagram/Threads) OAuth 2.0 Service
 *
 * Meta uses OAuth 2.0 with platform-specific scopes and endpoints.
 * This handles the complete flow:
 * 1. Generate authorization URL
 * 2. Exchange authorization code for access token
 * 3. Exchange short-lived token for long-lived token (60 days)
 * 4. Refresh long-lived token before expiry
 * 5. Page token exchange (for page management)
 * 6. Instagram Business account token exchange
 *
 * Token lifetimes:
 * - Short-lived: ~1-2 hours
 * - Long-lived: ~60 days
 * - Page tokens: Never expire (if from long-lived user token)
 *
 * IMPORTANT: Meta requires HTTPS redirect URIs in production.
 * Development mode allows http://localhost but only for app admins/developers/testers.
 */

interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  apiVersion?: string; // e.g., 'v19.0'
}

interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds
  refresh_token?: string;
}

interface MetaLongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds (5184000 = 60 days)
}

interface MetaPageTokenResponse {
  access_token: string;
  id: string;
  name: string;
  category: string;
}

interface MetaUserInfo {
  id: string;
  name: string;
  email?: string;
  picture?: { data: { url: string } };
}

interface MetaPageInfo {
  id: string;
  name: string;
  access_token: string;
  category: string;
  tasks: string[];
}

interface InstagramAccountInfo {
  id: string;
  name: string;
  username: string;
  profile_picture_url: string;
  followers_count: number;
  media_count: number;
}

const META_SCOPES: Record<string, string[]> = {
  // Facebook scopes
  facebook_basic: ['public_profile', 'email'],
  facebook_pages: ['pages_manage_posts', 'pages_read_engagement', 'pages_read_user_content', 'pages_show_list'],
  facebook_pages_publish: ['pages_manage_posts', 'pages_read_engagement', 'publish_video'],
  facebook_ads: ['ads_management', 'ads_read'],
  facebook_events: ['pages_manage_events'],
  facebook_groups: ['groups_access_member_info'],

  // Instagram scopes
  instagram_basic: ['instagram_basic', 'instagram_content_publish'],
  instagram_manage: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_comments', 'instagram_manage_messages'],
  instagram_insights: ['instagram_basic', 'instagram_manage_insights'],

  // Threads scopes (as of 2024)
  threads_basic: ['threads_basic', 'threads_content_publish'],
  threads_manage: ['threads_basic', 'threads_content_publish', 'threads_manage_replies', 'threads_manage_insights'],

  // Combined presets
  full_access: [
    'public_profile', 'email',
    'pages_manage_posts', 'pages_read_engagement', 'pages_read_user_content', 'pages_show_list',
    'instagram_basic', 'instagram_content_publish', 'instagram_manage_comments',
    'threads_basic', 'threads_content_publish',
  ],
};

export class MetaOAuthService {
  private apiVersion: string;

  constructor() {
    this.apiVersion = 'v21.0'; // Latest stable as of 2024
  }

  /**
   * Get the authorization URL for Meta OAuth
   * User visits this URL to grant permissions
   */
  getAuthorizationUrl(
    config: MetaOAuthConfig,
    scopePreset: string = 'full_access',
    state?: string,
    platform: 'facebook' | 'instagram' | 'threads' = 'facebook'
  ): { url: string; scopes: string[] } {
    const scopes = META_SCOPES[scopePreset] || META_SCOPES['full_access'];
    const scopeString = scopes.join(',');

    const baseUrl = platform === 'threads'
      ? 'https://threads.net/oauth/authorize'
      : 'https://www.facebook.com/v21.0/dialog/oauth';

    const params = new URLSearchParams({
      client_id: config.appId,
      redirect_uri: config.redirectUri,
      scope: scopeString,
      response_type: 'code',
      state: state || Math.random().toString(36).substring(2),
    });

    // For Instagram, we use Facebook's OAuth with Instagram scopes
    if (platform === 'instagram') {
      params.set('scope', [...scopes, 'instagram_basic'].join(','));
    }

    return {
      url: `${baseUrl}?${params.toString()}`,
      scopes,
    };
  }

  /**
   * Exchange authorization code for short-lived access token
   */
  async exchangeCodeForToken(
    config: MetaOAuthConfig,
    code: string
  ): Promise<MetaTokenResponse> {
    const url = `https://graph.facebook.com/${this.apiVersion}/oauth/access_token`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.appId,
        client_secret: config.appSecret,
        redirect_uri: config.redirectUri,
        code,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      log.error('Meta token exchange failed', { error });
      throw new AppError(400, `Meta OAuth failed: ${error.error?.message || 'Unknown error'}`, 'META_OAUTH_ERROR');
    }

    const data = await response.json() as any;
    log.info('Meta short-lived token obtained', { expiresIn: data.expires_in });

    return data;
  }

  /**
   * Exchange short-lived token for long-lived token (60 days)
   * CRITICAL: This must be called within the short-lived token's lifetime
   */
  async exchangeForLongLivedToken(
    config: MetaOAuthConfig,
    shortLivedToken: string
  ): Promise<MetaLongLivedTokenResponse> {
    const url = `https://graph.facebook.com/${this.apiVersion}/oauth/access_token`;

    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: shortLivedToken,
    });

    const response = await fetch(`${url}?${params.toString()}`);

    if (!response.ok) {
      const error = await response.json() as any;
      log.error('Meta long-lived token exchange failed', { error });
      throw new AppError(400, `Long-lived token exchange failed: ${error.error?.message}`, 'META_TOKEN_ERROR');
    }

    const data = await response.json() as any;
    log.info('Meta long-lived token obtained', { expiresIn: data.expires_in });

    return data;
  }

  /**
   * Get user info from Meta
   */
  async getUserInfo(accessToken: string): Promise<MetaUserInfo> {
    const url = `https://graph.facebook.com/${this.apiVersion}/me?fields=id,name,email,picture&access_token=${accessToken}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new AppError(400, 'Failed to get Meta user info', 'META_API_ERROR');
    }

    return response.json() as any;
  }

  /**
   * Get user's Facebook Pages with page access tokens
   * Page tokens from long-lived user tokens don't expire
   */
  async getUserPages(accessToken: string): Promise<MetaPageInfo[]> {
    const url = `https://graph.facebook.com/${this.apiVersion}/me/accounts?fields=id,name,access_token,category,tasks&access_token=${accessToken}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new AppError(400, 'Failed to get Facebook pages', 'META_API_ERROR');
    }

    const data = await response.json() as any;
    return data.data || [];
  }

  /**
   * Get Instagram Business accounts connected to Facebook Pages
   */
  async getInstagramAccounts(accessToken: string, pageId: string): Promise<InstagramAccountInfo[]> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${pageId}?fields=instagram_business_account{id,name,username,profile_picture_url,followers_count,media_count}&access_token=${accessToken}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new AppError(400, 'Failed to get Instagram accounts', 'META_API_ERROR');
    }

    const data = await response.json() as any;
    const igAccount = data.instagram_business_account;
    return igAccount ? [igAccount] : [];
  }

  /**
   * Get Threads profile
   */
  async getThreadsProfile(accessToken: string): Promise<any> {
    const url = `https://graph.threads.net/v1.0/me?fields=id,username,name,threads_profile_picture_url,threads_biography&access_token=${accessToken}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new AppError(400, 'Failed to get Threads profile', 'META_API_ERROR');
    }

    return response.json() as any;
  }

  /**
   * Debug token - get info about a token (expiry, scopes, etc.)
   */
  async debugToken(accessToken: string, inputToken: string): Promise<any> {
    const url = `https://graph.facebook.com/${this.apiVersion}/debug_token?input_token=${inputToken}&access_token=${accessToken}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new AppError(400, 'Failed to debug token', 'META_API_ERROR');
    }

    const data = await response.json() as any;
    return data.data;
  }

  /**
   * Refresh a long-lived token (must be done before expiry)
   * Meta allows refreshing tokens that have > 24 hours remaining
   */
  async refreshLongLivedToken(
    config: MetaOAuthConfig,
    currentToken: string
  ): Promise<MetaLongLivedTokenResponse> {
    // First check if token can be refreshed
    const tokenInfo = await this.debugToken(
      currentToken,
      currentToken
    );

    if (!tokenInfo.is_valid) {
      throw new AppError(400, 'Token is invalid or expired', 'META_TOKEN_EXPIRED');
    }

    const expiresAt = new Date(tokenInfo.expires_at * 1000);
    const hoursRemaining = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursRemaining < 24) {
      log.warn('Token has less than 24 hours remaining, may not be refreshable', {
        hoursRemaining: Math.round(hoursRemaining),
      });
    }

    // Exchange for new long-lived token
    return this.exchangeForLongLivedToken(config, currentToken);
  }

  /**
   * Complete OAuth flow - exchange code, get long-lived token, fetch user info
   * Returns everything needed to store as credentials
   */
  async completeOAuthFlow(
    config: MetaOAuthConfig,
    code: string,
    platform: 'facebook' | 'instagram' | 'threads' = 'facebook'
  ) {
    // Step 1: Exchange code for short-lived token
    const shortLived = await this.exchangeCodeForToken(config, code);

    // Step 2: Exchange for long-lived token
    const longLived = await this.exchangeForLongLivedToken(config, shortLived.access_token);

    // Step 3: Get user info
    const user = await this.getUserInfo(longLived.access_token);

    // Step 4: Get pages (for Facebook/Instagram)
    let pages: MetaPageInfo[] = [];
    const instagramAccounts: any[] = [];

    if (platform === 'facebook' || platform === 'instagram') {
      pages = await this.getUserPages(longLived.access_token);

      // Get Instagram accounts for each page
      for (const page of pages) {
        const igAccounts = await this.getInstagramAccounts(page.access_token, page.id);
        instagramAccounts.push(...igAccounts.map((acc) => ({
          ...acc,
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: page.access_token,
        })));
      }
    }

    // Step 5: Get Threads profile
    let threadsProfile: any = null;
    if (platform === 'threads') {
      try {
        threadsProfile = await this.getThreadsProfile(longLived.access_token);
      } catch (e) {
        log.warn('Failed to get Threads profile', { error: e });
      }
    }

    // Calculate expiry
    const expiresAt = new Date(Date.now() + longLived.expires_in * 1000);

    return {
      user,
      accessToken: longLived.access_token,
      expiresIn: longLived.expires_in,
      expiresAt,
      pages: pages.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        accessToken: p.access_token,
        tasks: p.tasks,
      })),
      instagramAccounts,
      threadsProfile,
      platform,
    };
  }

  /**
   * Build credential data for storage
   * This is what gets encrypted and stored
   */
  buildCredentialData(
    oauthResult: Awaited<ReturnType<typeof this.completeOAuthFlow>>,
    selectedPageId?: string
  ): Record<string, any> {
    const data: Record<string, any> = {
      platform: oauthResult.platform,
      userId: oauthResult.user.id,
      userName: oauthResult.user.name,
      accessToken: oauthResult.accessToken,
      expiresAt: oauthResult.expiresAt.toISOString(),
    };

    // If a specific page is selected, use page token
    if (selectedPageId) {
      const page = oauthResult.pages.find((p) => p.id === selectedPageId);
      if (page) {
        data.pageId = page.id;
        data.pageName = page.name;
        data.pageAccessToken = page.accessToken;
      }
    }

    // Include Instagram accounts
    if (oauthResult.instagramAccounts.length > 0) {
      data.instagramAccounts = oauthResult.instagramAccounts.map((acc) => ({
        id: acc.id,
        username: acc.username,
        name: acc.name,
        pageId: acc.pageId,
        accessToken: acc.pageAccessToken,
      }));
    }

    // Include Threads profile
    if (oauthResult.threadsProfile) {
      data.threadsProfile = {
        id: oauthResult.threadsProfile.id,
        username: oauthResult.threadsProfile.username,
      };
    }

    return data;
  }

  /**
   * Get available scope presets
   */
  getScopePresets(): Record<string, { scopes: string[]; description: string }> {
    return Object.entries(META_SCOPES).reduce((acc, [key, scopes]) => {
      const descriptions: Record<string, string> = {
        facebook_basic: 'Basic Facebook access (profile, email)',
        facebook_pages: 'Facebook Page management',
        facebook_pages_publish: 'Publish to Facebook Pages',
        facebook_ads: 'Facebook Ads management',
        facebook_events: 'Facebook Events management',
        facebook_groups: 'Facebook Groups access',
        instagram_basic: 'Basic Instagram access',
        instagram_manage: 'Full Instagram management',
        instagram_insights: 'Instagram analytics/insights',
        threads_basic: 'Basic Threads access',
        threads_manage: 'Full Threads management',
        full_access: 'Full access to Facebook, Instagram, and Threads',
      };
      acc[key] = { scopes, description: descriptions[key] || key };
      return acc;
    }, {} as Record<string, { scopes: string[]; description: string }>);
  }
}

export const metaOAuthService = new MetaOAuthService();
