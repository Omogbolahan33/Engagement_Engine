// Shared types between frontend and backend

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
  details?: Array<{ field: string; message: string }>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface EngagementConfig {
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
  maxPerWeek?: number;
  maxTotal?: number;
  cooldownMs: number;
  jitterMs: number;
  backoffStrategy: 'NONE' | 'LINEAR' | 'EXPONENTIAL' | 'FIBONACCI';
}

export interface SiteSettings {
  customHeaders?: Record<string, string>;
  userAgent?: string;
  timeout?: number;
  followRedirects?: boolean;
  proxyRotation?: boolean;
}

export interface TargetConfig {
  postId?: string;
  commentId?: string;
  userId?: string;
  url?: string;
  subreddits?: string[];
  hashtags?: string[];
  userList?: string[];
  postUrls?: string[];
  [key: string]: any;
}

export type PlatformCategory =
  | 'SOCIAL_MEDIA'
  | 'FORUMS'
  | 'CONTENT'
  | 'QA'
  | 'REVIEWS'
  | 'ECOMMERCE'
  | 'NEWS'
  | 'MESSAGING'
  | 'CUSTOM';

export const PLATFORM_CATEGORIES: Record<PlatformCategory, string[]> = {
  SOCIAL_MEDIA: ['TWITTER', 'FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'REDDIT', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'THREADS', 'MASTODON', 'BLUESKY'],
  FORUMS: ['DISCOURSE', 'PHPBB', 'VBBULLETIN', 'NODEBB', 'FLARUM'],
  CONTENT: ['WORDPRESS', 'MEDIUM', 'SUBSTACK', 'GHOST', 'DEVTO', 'HASHNODE'],
  QA: ['STACKOVERFLOW', 'QUORA'],
  REVIEWS: ['TRUSTPILOT', 'GLASSDOOR', 'YELP', 'G2', 'CAPTERRA'],
  ECOMMERCE: ['AMAZON', 'EBAY', 'SHOPIFY', 'ETSY'],
  NEWS: ['HACKERNEWS', 'SLASHDOT', 'DIGG'],
  MESSAGING: ['DISCORD', 'SLACK', 'TELEGRAM'],
  CUSTOM: ['CUSTOM_API', 'CUSTOM_BROWSER', 'CUSTOM_WEBHOOK'],
};
