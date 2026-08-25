import { prisma } from '../config/database';
import { EngagementType } from '@prisma/client';

/**
 * Engagement Templates Service
 * Pre-built templates for common engagement patterns
 * Users can start from templates instead of building from scratch
 */

export interface EngagementTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  platform?: string;
  engagementType: EngagementType;
  targetConfig: Record<string, any>;
  config: Record<string, any>;
  frequency: Record<string, any>;
  tags: string[];
}

export const ENGAGEMENT_TEMPLATES: EngagementTemplate[] = [
  // ============================================================
  // SOCIAL MEDIA - LIKES & REACTIONS
  // ============================================================
  {
    id: 'twitter-like-hashtag',
    name: 'Like tweets by hashtag',
    description: 'Automatically like tweets containing specific hashtags',
    category: 'Social Media',
    platform: 'TWITTER',
    engagementType: 'LIKE',
    targetConfig: { hashtags: ['#tech', '#programming'] },
    config: { minLikes: 10, maxLikes: 10000 },
    frequency: { maxPerMinute: 1, maxPerHour: 15, maxPerDay: 200, cooldownMs: 60000, jitterMs: 5000 },
    tags: ['twitter', 'like', 'hashtag'],
  },
  {
    id: 'reddit-upvote-subreddit',
    name: 'Upvote posts in subreddit',
    description: 'Upvote new posts in specific subreddits',
    category: 'Forums',
    platform: 'REDDIT',
    engagementType: 'UPVOTE',
    targetConfig: { subreddits: ['r/programming', 'r/webdev'], sortBy: 'new', minScore: 1 },
    config: {},
    frequency: { maxPerMinute: 1, maxPerHour: 10, maxPerDay: 100, cooldownMs: 90000, jitterMs: 8000 },
    tags: ['reddit', 'upvote', 'subreddit'],
  },
  {
    id: 'instagram-like-explore',
    name: 'Like posts from explore',
    description: 'Like posts from Instagram explore page',
    category: 'Social Media',
    platform: 'INSTAGRAM',
    engagementType: 'LIKE',
    targetConfig: { source: 'explore', niches: ['tech', 'coding'] },
    config: {},
    frequency: { maxPerMinute: 1, maxPerHour: 20, maxPerDay: 300, cooldownMs: 45000, jitterMs: 10000 },
    tags: ['instagram', 'like', 'explore'],
  },

  // ============================================================
  // FOLLOWERS & CONNECTIONS
  // ============================================================
  {
    id: 'twitter-follow-interests',
    name: 'Follow users by interest',
    description: 'Follow users who tweet about specific topics',
    category: 'Social Media',
    platform: 'TWITTER',
    engagementType: 'FOLLOW_USER',
    targetConfig: { source: 'hashtag', hashtags: ['#startup', '#saas'], minFollowers: 100 },
    config: {},
    frequency: { maxPerMinute: 1, maxPerHour: 5, maxPerDay: 50, cooldownMs: 120000, jitterMs: 15000 },
    tags: ['twitter', 'follow', 'growth'],
  },
  {
    id: 'linkedin-connect-industry',
    name: 'Connect with industry professionals',
    description: 'Send connection requests to professionals in your industry',
    category: 'Social Media',
    platform: 'LINKEDIN',
    engagementType: 'FOLLOW_USER',
    targetConfig: { industry: 'Technology', title: 'Engineer', location: 'San Francisco' },
    config: { message: 'Hi, I\'d like to connect!' },
    frequency: { maxPerMinute: 1, maxPerHour: 3, maxPerDay: 25, cooldownMs: 300000, jitterMs: 30000 },
    tags: ['linkedin', 'connect', 'networking'],
  },

  // ============================================================
  // COMMENTS & ENGAGEMENT
  // ============================================================
  {
    id: 'reddit-comment-discussions',
    name: 'Comment on discussions',
    description: 'Leave thoughtful comments on Reddit discussions',
    category: 'Forums',
    platform: 'REDDIT',
    engagementType: 'CREATE_COMMENT',
    targetConfig: { subreddits: ['r/programming'], sortBy: 'hot', minComments: 5 },
    config: {
      templates: [
        'Great point! I\'ve had a similar experience with {topic}.',
        'This is really helpful, thanks for sharing!',
        'Interesting perspective. Have you considered {alternative}?',
      ],
    },
    frequency: { maxPerMinute: 1, maxPerHour: 3, maxPerDay: 20, cooldownMs: 300000, jitterMs: 60000 },
    tags: ['reddit', 'comment', 'engagement'],
  },
  {
    id: 'quora-answer-questions',
    name: 'Answer questions on Quora',
    description: 'Provide answers to questions in your area of expertise',
    category: 'Q&A',
    platform: 'QUORA',
    engagementType: 'CREATE_COMMENT',
    targetConfig: { topics: ['technology', 'programming'], minFollowers: 10 },
    config: {},
    frequency: { maxPerMinute: 1, maxPerHour: 2, maxPerDay: 10, cooldownMs: 600000, jitterMs: 120000 },
    tags: ['quora', 'answer', 'authority'],
  },
  {
    id: 'nairaland-comment-threads',
    name: 'Comment on Nairaland threads',
    description: 'Engage in discussions on Nairaland forum threads',
    category: 'Forums',
    platform: 'NAIRALAND',
    engagementType: 'CREATE_COMMENT',
    targetConfig: { sections: ['technology', 'programming'], sortBy: 'recent' },
    config: {},
    frequency: { maxPerMinute: 1, maxPerHour: 3, maxPerDay: 15, cooldownMs: 300000, jitterMs: 60000 },
    tags: ['nairaland', 'comment', 'nigeria', 'forum'],
  },

  // ============================================================
  // CONTENT CREATION
  // ============================================================
  {
    id: 'wordpress-blog-comment',
    name: 'Comment on blog posts',
    description: 'Leave comments on WordPress blog posts',
    category: 'Content',
    platform: 'WORDPRESS',
    engagementType: 'CREATE_COMMENT',
    targetConfig: { postUrls: [], author: '' },
    config: { templates: ['Great article!', 'Very informative, thanks!'] },
    frequency: { maxPerMinute: 1, maxPerHour: 3, maxPerDay: 15, cooldownMs: 300000, jitterMs: 60000 },
    tags: ['wordpress', 'comment', 'blog'],
  },
  {
    id: 'medium-clap-article',
    name: 'Clap for Medium articles',
    description: 'Clap for articles in specific topics on Medium',
    category: 'Content',
    platform: 'MEDIUM',
    engagementType: 'LIKE',
    targetConfig: { topics: ['technology', 'programming'], minReadTime: 3 },
    config: { clapCount: 50 },
    frequency: { maxPerMinute: 1, maxPerHour: 10, maxPerDay: 50, cooldownMs: 120000, jitterMs: 15000 },
    tags: ['medium', 'clap', 'content'],
  },

  // ============================================================
  // FORUMS
  // ============================================================
  {
    id: 'discourse-topic-reply',
    name: 'Reply to Discourse topics',
    description: 'Reply to topics in Discourse forums',
    category: 'Forums',
    platform: 'DISCOURSE',
    engagementType: 'REPLY_TO_COMMENT',
    targetConfig: { categories: ['general'], minReplies: 2 },
    config: {},
    frequency: { maxPerMinute: 1, maxPerHour: 3, maxPerDay: 15, cooldownMs: 300000, jitterMs: 60000 },
    tags: ['discourse', 'reply', 'forum'],
  },
  {
    id: 'phpbb-post-reply',
    name: 'Reply to phpBB threads',
    description: 'Reply to threads in phpBB forums',
    category: 'Forums',
    platform: 'PHPBB',
    engagementType: 'REPLY_TO_COMMENT',
    targetConfig: { forums: ['general'], sortBy: 'recent' },
    config: {},
    frequency: { maxPerMinute: 1, maxPerHour: 2, maxPerDay: 10, cooldownMs: 600000, jitterMs: 120000 },
    tags: ['phpbb', 'reply', 'forum'],
  },

  // ============================================================
  // REVIEWS
  // ============================================================
  {
    id: 'trustpilot-review',
    name: 'Leave a Trustpilot review',
    description: 'Leave reviews for businesses on Trustpilot',
    category: 'Reviews',
    platform: 'TRUSTPILOT',
    engagementType: 'CREATE_REVIEW',
    targetConfig: { businessUrl: '' },
    config: { rating: 5 },
    frequency: { maxPerMinute: 1, maxPerHour: 1, maxPerDay: 3, cooldownMs: 3600000, jitterMs: 600000 },
    tags: ['trustpilot', 'review'],
  },

  // ============================================================
  // MESSAGING
  // ============================================================
  {
    id: 'discord-send-message',
    name: 'Send Discord message',
    description: 'Send messages to Discord channels',
    category: 'Messaging',
    platform: 'DISCORD',
    engagementType: 'SEND_MESSAGE',
    targetConfig: { channelId: '' },
    config: {},
    frequency: { maxPerMinute: 1, maxPerHour: 5, maxPerDay: 30, cooldownMs: 120000, jitterMs: 30000 },
    tags: ['discord', 'message'],
  },
  {
    id: 'telegram-send-message',
    name: 'Send Telegram message',
    description: 'Send messages to Telegram groups/channels',
    category: 'Messaging',
    platform: 'TELEGRAM',
    engagementType: 'SEND_MESSAGE',
    targetConfig: { chatId: '' },
    config: {},
    frequency: { maxPerMinute: 1, maxPerHour: 5, maxPerDay: 30, cooldownMs: 120000, jitterMs: 30000 },
    tags: ['telegram', 'message'],
  },

  // ============================================================
  // SCRAPING & MONITORING
  // ============================================================
  {
    id: 'monitor-mentions',
    name: 'Monitor brand mentions',
    description: 'Track mentions of your brand across platforms',
    category: 'Analytics',
    engagementType: 'MONITOR_MENTIONS',
    targetConfig: { keywords: ['your-brand'], platforms: ['twitter', 'reddit'] },
    config: {},
    frequency: { maxPerMinute: 1, maxPerHour: 6, maxPerDay: 100, cooldownMs: 600000, jitterMs: 60000 },
    tags: ['monitoring', 'mentions', 'analytics'],
  },
];

export class TemplateService {
  /**
   * Get all available templates
   */
  getAll(filters?: { category?: string; platform?: string; search?: string }): EngagementTemplate[] {
    let templates = [...ENGAGEMENT_TEMPLATES];

    if (filters?.category) {
      templates = templates.filter((t) => t.category === filters.category);
    }
    if (filters?.platform) {
      templates = templates.filter((t) => t.platform === filters.platform);
    }
    if (filters?.search) {
      const search = filters.search.toLowerCase();
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(search) ||
          t.description.toLowerCase().includes(search) ||
          t.tags.some((tag) => tag.includes(search))
      );
    }

    return templates;
  }

  /**
   * Get a single template by ID
   */
  getById(id: string): EngagementTemplate | undefined {
    return ENGAGEMENT_TEMPLATES.find((t) => t.id === id);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return [...new Set(ENGAGEMENT_TEMPLATES.map((t) => t.category))];
  }

  /**
   * Create an engagement from a template
   */
  async createFromTemplate(
    templateId: string,
    siteId: string,
    overrides?: {
      name?: string;
      targetConfig?: Record<string, any>;
      frequency?: Record<string, any>;
    }
  ) {
    const template = this.getById(templateId);
    if (!template) throw new Error('Template not found');

    return {
      siteId,
      name: overrides?.name || template.name,
      description: template.description,
      engagementType: template.engagementType,
      targetConfig: overrides?.targetConfig || template.targetConfig,
      config: template.config,
      frequency: overrides?.frequency || template.frequency,
    };
  }
}

export const templateService = new TemplateService();
