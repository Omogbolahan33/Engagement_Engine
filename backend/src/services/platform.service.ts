import { prisma } from '../config/database';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('platform');

/**
 * Dynamic Platform Service
 * Users can define custom platforms beyond the built-in types
 * No hardcoded limits on what websites can be connected
 */

export interface PlatformDefinition {
  id: string;
  name: string;
  url: string;
  category: string;
  apiBaseUrl?: string;
  authTypes: string[];
  engagementTypes: string[];
  rateLimits: {
    requestsPerMinute?: number;
    requestsPerHour?: number;
    requestsPerDay?: number;
  };
  headers: Record<string, string>;
  userAgent: string;
  features: {
    hasApi: boolean;
    hasBrowserAuth: boolean;
    hasOAuth: boolean;
    hasWebhooks: boolean;
    supportsScheduling: boolean;
  };
  metadata: Record<string, any>;
}

// Built-in platform presets (can be extended by users)
const BUILTIN_PLATFORMS: Record<string, Partial<PlatformDefinition>> = {
  CUSTOM_API: {
    name: 'Custom API',
    category: 'custom',
    authTypes: ['API_KEY', 'BEARER_TOKEN', 'BASIC_AUTH', 'CUSTOM_HEADER', 'OAUTH2_CLIENT_CREDENTIALS'],
    engagementTypes: ['CREATE_POST', 'CREATE_COMMENT', 'LIKE', 'SHARE_POST', 'SEND_MESSAGE', 'CUSTOM_ACTION'],
    features: { hasApi: true, hasBrowserAuth: false, hasOAuth: true, hasWebhooks: true, supportsScheduling: true },
  },
  CUSTOM_BROWSER: {
    name: 'Custom Browser Site',
    category: 'custom',
    authTypes: ['FORM_LOGIN', 'COOKIE_AUTH', 'SESSION_COOKIE', 'PUPPETEER_LOGIN', 'BROWSER_COOKIE_IMPORT'],
    engagementTypes: ['CREATE_POST', 'CREATE_COMMENT', 'LIKE', 'FOLLOW_USER', 'SHARE_POST', 'CUSTOM_ACTION'],
    features: { hasApi: false, hasBrowserAuth: true, hasOAuth: false, hasWebhooks: false, supportsScheduling: true },
  },
  CUSTOM_WEBHOOK: {
    name: 'Custom Webhook',
    category: 'custom',
    authTypes: ['WEBHOOK_SECRET', 'HMAC_WEBHOOK', 'CUSTOM_HEADER'],
    engagementTypes: ['CUSTOM_ACTION'],
    features: { hasApi: true, hasBrowserAuth: false, hasOAuth: false, hasWebhooks: true, supportsScheduling: false },
  },
  // Social Media
  TWITTER: {
    name: 'Twitter / X',
    category: 'social_media',
    url: 'https://api.twitter.com',
    authTypes: ['TWITTER_OAUTH1', 'TWITTER_OAUTH2', 'BEARER_TOKEN', 'API_KEY'],
    engagementTypes: ['LIKE', 'RETWEET', 'QUOTE_POST', 'FOLLOW_USER', 'UNFOLLOW_USER', 'CREATE_POST', 'SEND_DM', 'BOOKMARK'],
    rateLimits: { requestsPerMinute: 15, requestsPerHour: 300, requestsPerDay: 5000 },
    features: { hasApi: true, hasBrowserAuth: true, hasOAuth: true, hasWebhooks: true, supportsScheduling: true },
  },
  FACEBOOK: {
    name: 'Facebook',
    category: 'social_media',
    url: 'https://graph.facebook.com',
    authTypes: ['FACEBOOK_LOGIN', 'OAUTH2_AUTHORIZATION_CODE', 'BEARER_TOKEN'],
    engagementTypes: ['LIKE', 'CREATE_POST', 'CREATE_COMMENT', 'SHARE_POST', 'FOLLOW_USER', 'SEND_MESSAGE'],
    rateLimits: { requestsPerMinute: 20, requestsPerHour: 600, requestsPerDay: 10000 },
    features: { hasApi: true, hasBrowserAuth: true, hasOAuth: true, hasWebhooks: true, supportsScheduling: true },
  },
  INSTAGRAM: {
    name: 'Instagram',
    category: 'social_media',
    url: 'https://graph.instagram.com',
    authTypes: ['FACEBOOK_LOGIN', 'OAUTH2_AUTHORIZATION_CODE'],
    engagementTypes: ['LIKE', 'CREATE_COMMENT', 'FOLLOW_USER', 'UNFOLLOW_USER'],
    rateLimits: { requestsPerMinute: 10, requestsPerHour: 200, requestsPerDay: 5000 },
    features: { hasApi: true, hasBrowserAuth: true, hasOAuth: true, hasWebhooks: false, supportsScheduling: true },
  },
  LINKEDIN: {
    name: 'LinkedIn',
    category: 'social_media',
    url: 'https://api.linkedin.com',
    authTypes: ['LINKEDIN_OAUTH2', 'OAUTH2_AUTHORIZATION_CODE'],
    engagementTypes: ['LIKE', 'CREATE_POST', 'CREATE_COMMENT', 'FOLLOW_USER', 'SHARE_POST', 'SEND_MESSAGE'],
    rateLimits: { requestsPerMinute: 10, requestsPerHour: 100, requestsPerDay: 2000 },
    features: { hasApi: true, hasBrowserAuth: true, hasOAuth: true, hasWebhooks: false, supportsScheduling: true },
  },
  REDDIT: {
    name: 'Reddit',
    category: 'forums',
    url: 'https://oauth.reddit.com',
    authTypes: ['REDDIT_OAUTH2', 'BASIC_AUTH', 'BEARER_TOKEN'],
    engagementTypes: ['UPVOTE', 'DOWNVOTE', 'CREATE_POST', 'CREATE_COMMENT', 'REPLY_TO_COMMENT', 'FOLLOW_USER', 'JOIN_GROUP', 'SHARE_POST'],
    rateLimits: { requestsPerMinute: 10, requestsPerHour: 100, requestsPerDay: 1000 },
    features: { hasApi: true, hasBrowserAuth: true, hasOAuth: true, hasWebhooks: false, supportsScheduling: true },
  },
  NAIRALAND: {
    name: 'Nairaland',
    category: 'forums',
    url: 'https://www.nairaland.com',
    authTypes: ['FORM_LOGIN', 'COOKIE_AUTH', 'SESSION_COOKIE', 'PUPPETEER_LOGIN'],
    engagementTypes: ['CREATE_POST', 'CREATE_COMMENT', 'REPLY_TO_COMMENT', 'LIKE'],
    rateLimits: { requestsPerMinute: 5, requestsPerHour: 30, requestsPerDay: 200 },
    features: { hasApi: false, hasBrowserAuth: true, hasOAuth: false, hasWebhooks: false, supportsScheduling: true },
  },
  QUORA: {
    name: 'Quora',
    category: 'forums',
    url: 'https://www.quora.com',
    authTypes: ['FORM_LOGIN', 'COOKIE_AUTH', 'PUPPETEER_LOGIN'],
    engagementTypes: ['CREATE_POST', 'CREATE_COMMENT', 'UPVOTE', 'FOLLOW_USER'],
    rateLimits: { requestsPerMinute: 5, requestsPerHour: 30, requestsPerDay: 200 },
    features: { hasApi: false, hasBrowserAuth: true, hasOAuth: false, hasWebhooks: false, supportsScheduling: true },
  },
  DISCORD: {
    name: 'Discord',
    category: 'messaging',
    url: 'https://discord.com/api',
    authTypes: ['DISCORD_BOT_TOKEN', 'OAUTH2_AUTHORIZATION_CODE'],
    engagementTypes: ['SEND_MESSAGE', 'CREATE_POST', 'LIKE', 'FOLLOW_USER'],
    rateLimits: { requestsPerMinute: 50, requestsPerHour: 1000, requestsPerDay: 10000 },
    features: { hasApi: true, hasBrowserAuth: false, hasOAuth: true, hasWebhooks: true, supportsScheduling: true },
  },
  TELEGRAM: {
    name: 'Telegram',
    category: 'messaging',
    url: 'https://api.telegram.org',
    authTypes: ['BEARER_TOKEN', 'BOT_TOKEN'],
    engagementTypes: ['SEND_MESSAGE', 'CREATE_POST', 'LIKE'],
    rateLimits: { requestsPerMinute: 30, requestsPerHour: 500, requestsPerDay: 5000 },
    features: { hasApi: true, hasBrowserAuth: false, hasOAuth: false, hasWebhooks: true, supportsScheduling: true },
  },
  WORDPRESS: {
    name: 'WordPress',
    category: 'content',
    authTypes: ['BASIC_AUTH', 'API_KEY', 'JWT_TOKEN', 'OAUTH2_AUTHORIZATION_CODE'],
    engagementTypes: ['CREATE_POST', 'CREATE_COMMENT', 'REPLY_TO_COMMENT', 'LIKE'],
    rateLimits: { requestsPerMinute: 10, requestsPerHour: 100, requestsPerDay: 1000 },
    features: { hasApi: true, hasBrowserAuth: true, hasOAuth: true, hasWebhooks: true, supportsScheduling: true },
  },
  MEDIUM: {
    name: 'Medium',
    category: 'content',
    url: 'https://api.medium.com',
    authTypes: ['OAUTH2_AUTHORIZATION_CODE', 'BEARER_TOKEN'],
    engagementTypes: ['LIKE', 'CREATE_COMMENT', 'FOLLOW_USER', 'CREATE_POST'],
    rateLimits: { requestsPerMinute: 10, requestsPerHour: 100, requestsPerDay: 1000 },
    features: { hasApi: true, hasBrowserAuth: true, hasOAuth: true, hasWebhooks: false, supportsScheduling: true },
  },
  YOUTUBE: {
    name: 'YouTube',
    category: 'social_media',
    url: 'https://www.googleapis.com/youtube/v3',
    authTypes: ['GOOGLE_OAUTH2', 'API_KEY'],
    engagementTypes: ['LIKE', 'DISLIKE', 'CREATE_COMMENT', 'SUBSCRIBE_CHANNEL'],
    rateLimits: { requestsPerMinute: 10, requestsPerHour: 100, requestsPerDay: 10000 },
    features: { hasApi: true, hasBrowserAuth: true, hasOAuth: true, hasWebhooks: false, supportsScheduling: true },
  },
  TIKTOK: {
    name: 'TikTok',
    category: 'social_media',
    url: 'https://open.tiktokapis.com',
    authTypes: ['OAUTH2_AUTHORIZATION_CODE', 'BEARER_TOKEN'],
    engagementTypes: ['LIKE', 'FOLLOW_USER', 'CREATE_COMMENT', 'SHARE_POST'],
    rateLimits: { requestsPerMinute: 10, requestsPerHour: 100, requestsPerDay: 5000 },
    features: { hasApi: true, hasBrowserAuth: true, hasOAuth: true, hasWebhooks: false, supportsScheduling: true },
  },
  THREADS: {
    name: 'Threads',
    category: 'social_media',
    url: 'https://graph.threads.net',
    authTypes: ['FACEBOOK_LOGIN', 'OAUTH2_AUTHORIZATION_CODE'],
    engagementTypes: ['LIKE', 'CREATE_POST', 'CREATE_COMMENT', 'FOLLOW_USER', 'REPOST'],
    rateLimits: { requestsPerMinute: 10, requestsPerHour: 100, requestsPerDay: 2000 },
    features: { hasApi: true, hasBrowserAuth: true, hasOAuth: true, hasWebhooks: false, supportsScheduling: true },
  },
  GITHUB: {
    name: 'GitHub',
    category: 'development',
    url: 'https://api.github.com',
    authTypes: ['PERSONAL_ACCESS_TOKEN', 'GITHUB_APP', 'OAUTH2_AUTHORIZATION_CODE'],
    engagementTypes: ['CREATE_POST', 'CREATE_COMMENT', 'LIKE', 'FOLLOW_USER'],
    rateLimits: { requestsPerMinute: 30, requestsPerHour: 1000, requestsPerDay: 5000 },
    features: { hasApi: true, hasBrowserAuth: false, hasOAuth: true, hasWebhooks: true, supportsScheduling: true },
  },
  STACKOVERFLOW: {
    name: 'Stack Overflow',
    category: 'forums',
    url: 'https://api.stackexchange.com',
    authTypes: ['OAUTH2_AUTHORIZATION_CODE', 'API_KEY'],
    engagementTypes: ['UPVOTE', 'DOWNVOTE', 'CREATE_COMMENT', 'CREATE_POST'],
    rateLimits: { requestsPerMinute: 10, requestsPerHour: 100, requestsPerDay: 10000 },
    features: { hasApi: true, hasBrowserAuth: true, hasOAuth: true, hasWebhooks: false, supportsScheduling: true },
  },
  TRUSTPILOT: {
    name: 'Trustpilot',
    category: 'reviews',
    url: 'https://api.trustpilot.com',
    authTypes: ['API_KEY', 'OAUTH2_CLIENT_CREDENTIALS'],
    engagementTypes: ['CREATE_REVIEW', 'LIKE'],
    rateLimits: { requestsPerMinute: 5, requestsPerHour: 50, requestsPerDay: 500 },
    features: { hasApi: true, hasBrowserAuth: true, hasOAuth: true, hasWebhooks: false, supportsScheduling: true },
  },
  WHATSAPP: {
    name: 'WhatsApp',
    category: 'messaging',
    url: 'https://graph.facebook.com/v18.0',
    authTypes: ['BEARER_TOKEN', 'OAUTH2_AUTHORIZATION_CODE'],
    engagementTypes: ['SEND_MESSAGE'],
    rateLimits: { requestsPerMinute: 20, requestsPerHour: 200, requestsPerDay: 5000 },
    features: { hasApi: true, hasBrowserAuth: false, hasOAuth: true, hasWebhooks: true, supportsScheduling: true },
  },
  SLACK: {
    name: 'Slack',
    category: 'messaging',
    url: 'https://slack.com/api',
    authTypes: ['SLACK_BOT_TOKEN', 'OAUTH2_AUTHORIZATION_CODE'],
    engagementTypes: ['SEND_MESSAGE', 'CREATE_POST', 'LIKE'],
    rateLimits: { requestsPerMinute: 50, requestsPerHour: 1000, requestsPerDay: 10000 },
    features: { hasApi: true, hasBrowserAuth: false, hasOAuth: true, hasWebhooks: true, supportsScheduling: true },
  },
};

export class PlatformService {
  /**
   * Get all available platforms (built-in + custom)
   */
  async getAllPlatforms(organizationId?: string): Promise<PlatformDefinition[]> {
    const builtin = Object.entries(BUILTIN_PLATFORMS).map(([key, def]) => ({
      id: key,
      name: def.name || key,
      url: def.url || '',
      category: def.category || 'other',
      apiBaseUrl: def.url,
      authTypes: def.authTypes || [],
      engagementTypes: def.engagementTypes || [],
      rateLimits: def.rateLimits || {},
      headers: def.headers || {},
      userAgent: `EngagementPlatform/1.0 (${key})`,
      features: def.features || { hasApi: false, hasBrowserAuth: false, hasOAuth: false, hasWebhooks: false, supportsScheduling: true },
      metadata: { builtin: true },
    }));

    // Load custom platforms from DB
    let custom: PlatformDefinition[] = [];
    if (organizationId) {
      const sites = await prisma.site.findMany({
        where: {
          organizationId,
          platform: { in: ['CUSTOM_API', 'CUSTOM_BROWSER', 'CUSTOM_WEBHOOK'] },
        },
        distinct: ['url'],
      });

      custom = sites.map((site) => ({
        id: `custom:${site.id}`,
        name: site.name,
        url: site.url,
        category: 'custom',
        apiBaseUrl: site.url,
        authTypes: ['API_KEY', 'BEARER_TOKEN', 'BASIC_AUTH', 'FORM_LOGIN', 'COOKIE_AUTH'],
        engagementTypes: ['CREATE_POST', 'CREATE_COMMENT', 'LIKE', 'FOLLOW_USER', 'SHARE_POST', 'CUSTOM_ACTION'],
        rateLimits: (site.settings as any)?.rateLimits || {},
        headers: (site.settings as any)?.headers || {},
        userAgent: (site.settings as any)?.userAgent || 'EngagementPlatform/1.0',
        features: {
          hasApi: (site.settings as any)?.hasApi ?? true,
          hasBrowserAuth: (site.settings as any)?.hasBrowserAuth ?? false,
          hasOAuth: (site.settings as any)?.hasOAuth ?? false,
          hasWebhooks: (site.settings as any)?.hasWebhooks ?? false,
          supportsScheduling: true,
        },
        metadata: { builtin: false, siteId: site.id },
      }));
    }

    return [...builtin, ...custom];
  }

  /**
   * Get platform definition by type
   */
  getPlatform(platformType: string): PlatformDefinition | null {
    const def = BUILTIN_PLATFORMS[platformType];
    if (!def) return null;

    return {
      id: platformType,
      name: def.name || platformType,
      url: def.url || '',
      category: def.category || 'other',
      apiBaseUrl: def.url,
      authTypes: def.authTypes || [],
      engagementTypes: def.engagementTypes || [],
      rateLimits: def.rateLimits || {},
      headers: def.headers || {},
      userAgent: `EngagementPlatform/1.0 (${platformType})`,
      features: def.features || { hasApi: false, hasBrowserAuth: false, hasOAuth: false, hasWebhooks: false, supportsScheduling: true },
      metadata: { builtin: true },
    };
  }

  /**
   * Get platform categories
   */
  getCategories(): string[] {
    return [...new Set(Object.values(BUILTIN_PLATFORMS).map((p) => p.category || 'other'))];
  }

  /**
   * Get platforms by category
   */
  getByCategory(category: string): PlatformDefinition[] {
    return Object.entries(BUILTIN_PLATFORMS)
      .filter(([_, def]) => def.category === category)
      .map(([key, def]) => ({
        id: key,
        name: def.name || key,
        url: def.url || '',
        category: def.category || 'other',
        apiBaseUrl: def.url,
        authTypes: def.authTypes || [],
        engagementTypes: def.engagementTypes || [],
        rateLimits: def.rateLimits || {},
        headers: def.headers || {},
        userAgent: `EngagementPlatform/1.0 (${key})`,
        features: def.features || { hasApi: false, hasBrowserAuth: false, hasOAuth: false, hasWebhooks: false, supportsScheduling: true },
        metadata: { builtin: true },
      }));
  }
}

export const platformService = new PlatformService();
