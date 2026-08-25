import { prisma } from '../../config/database';
import { decrypt } from '../../utils/encryption';
import { llmProviderService, LLMProviderConfig, GenerateResult } from './llm-provider.service';
import { createContextLogger } from '../../utils/logger';
import { AppError } from '../../middleware/errorHandler';

const log = createContextLogger('content-generator');

/**
 * Content Generation Service
 * Manages three content sources:
 * 1. User-provided text (direct input)
 * 2. Reusable templates with variable substitution
 * 3. AI-generated content via configurable LLM providers
 *
 * Each engagement can specify which source to use, and AI generation
 * can be scoped to specific engagement types.
 */

// ============================================================
// TYPES
// ============================================================

export type ContentSource = 'user_input' | 'template' | 'ai_generate' | 'ai_from_template';

export type EngagementScope =
  | 'comments'
  | 'replies'
  | 'posts'
  | 'messages'
  | 'reviews'
  | 'articles'
  | 'threads'
  | 'bios'
  | 'descriptions'
  | 'titles'
  | 'summaries'
  | 'custom';

export interface ContentRequest {
  source: ContentSource;
  // For user_input
  text?: string;
  // For template
  templateId?: string;
  templateText?: string;
  variables?: Record<string, string>;
  // For ai_generate / ai_from_template
  llmConfigId?: string;
  aiPrompt?: string;
  aiSystemPrompt?: string;
  scope?: EngagementScope;
  tone?: 'professional' | 'casual' | 'friendly' | 'formal' | 'humorous' | 'technical' | 'persuasive' | 'neutral';
  language?: string;
  maxLength?: number;
  minLength?: number;
  // Context for AI
  context?: {
    platform?: string;
    engagementType?: string;
    targetUrl?: string;
    targetContent?: string;
    userProfile?: string;
    brandVoice?: string;
    keywords?: string[];
  };
}

export interface ContentResult {
  text: string;
  source: ContentSource;
  templateId?: string;
  llmProvider?: string;
  llmModel?: string;
  tokensUsed?: number;
  generatedAt: Date;
}

// ============================================================
// AI PROMPT TEMPLATES PER SCOPE
// ============================================================

const SCOPE_PROMPTS: Record<EngagementScope, string> = {
  comments: `Write a comment for a social media post. The comment should be:
- Engaging and relevant to the post
- Natural-sounding, as if written by a real person
- {tone} in tone
- Between {minLength} and {maxLength} characters
- On the topic of: {topic}
{keywords}
{brandVoice}
Platform: {platform}
Post content: {targetContent}
Respond with ONLY the comment text, nothing else.`,

  replies: `Write a reply to a comment. The reply should be:
- Directly addressing what was said
- Natural conversational flow
- {tone} in tone
- Between {minLength} and {maxLength} characters
{keywords}
{brandVoice}
Platform: {platform}
Original comment: {targetContent}
Respond with ONLY the reply text, nothing else.`,

  posts: `Write a social media post. The post should be:
- Engaging and attention-grabbing
- Optimized for {platform}
- {tone} in tone
- Between {minLength} and {maxLength} characters
- About: {topic}
{keywords}
{brandVoice}
Respond with ONLY the post text, nothing else.`,

  messages: `Write a direct message. The message should be:
- Personal and relevant
- Not spammy or salesy
- {tone} in tone
- Between {minLength} and {maxLength} characters
- Context: {topic}
{brandVoice}
Platform: {platform}
Respond with ONLY the message text, nothing else.`,

  reviews: `Write a product/service review. The review should be:
- Authentic and detailed
- Balanced (mention pros and cons if appropriate)
- {tone} in tone
- Between {minLength} and {maxLength} characters
- About: {topic}
{keywords}
{brandVoice}
Platform: {platform}
Respond with ONLY the review text, nothing else.`,

  articles: `Write an article or blog post. The article should be:
- Well-structured with clear paragraphs
- Informative and valuable
- {tone} in tone
- Between {minLength} and {maxLength} characters
- About: {topic}
{keywords}
{brandVoice}
Platform: {platform}
Respond with ONLY the article text, nothing else.`,

  threads: `Write a forum thread post. The post should be:
- Relevant to the forum topic
- Contributing value to the discussion
- {tone} in tone
- Between {minLength} and {maxLength} characters
- About: {topic}
{keywords}
{brandVoice}
Platform: {platform}
Respond with ONLY the post text, nothing else.`,

  bios: `Write a profile bio. The bio should be:
- Concise and memorable
- Highlighting key aspects
- {tone} in tone
- Between {minLength} and {maxLength} characters
- About: {topic}
{keywords}
{brandVoice}
Platform: {platform}
Respond with ONLY the bio text, nothing else.`,

  descriptions: `Write a description. The description should be:
- Clear and informative
- SEO-friendly if applicable
- {tone} in tone
- Between {minLength} and {maxLength} characters
- About: {topic}
{keywords}
{brandVoice}
Respond with ONLY the description text, nothing else.`,

  titles: `Write a title. The title should be:
- Attention-grabbing
- Clear and concise
- {tone} in tone
- Between {minLength} and {maxLength} characters
- About: {topic}
{keywords}
Respond with ONLY the title text, nothing else.`,

  summaries: `Write a summary. The summary should be:
- Capturing the key points
- Concise but complete
- {tone} in tone
- Between {minLength} and {maxLength} characters
- Of: {topic}
{brandVoice}
Respond with ONLY the summary text, nothing else.`,

  custom: `{aiPrompt}`,
};

// ============================================================
// CONTENT GENERATOR SERVICE
// ============================================================

export class ContentGeneratorService {
  /**
   * Generate content based on the request
   */
  async generate(request: ContentRequest): Promise<ContentResult> {
    switch (request.source) {
      case 'user_input':
        return this.fromUserInput(request);
      case 'template':
        return this.fromTemplate(request);
      case 'ai_generate':
        return this.fromAI(request);
      case 'ai_from_template':
        return this.fromAITemplate(request);
      default:
        throw new AppError(400, `Unknown content source: ${request.source}`, 'INVALID_SOURCE');
    }
  }

  /**
   * Generate multiple variations (for A/B testing or rotation)
   */
  async generateVariations(
    request: ContentRequest,
    count: number
  ): Promise<ContentResult[]> {
    if (request.source === 'user_input') {
      return [await this.fromUserInput(request)];
    }

    if (request.source === 'template' && !request.llmConfigId) {
      // Template with variable variations
      const results: ContentResult[] = [];
      for (let i = 0; i < count; i++) {
        results.push(await this.fromTemplate(request));
      }
      return results;
    }

    // AI generation — each call produces a different variation
    const results: ContentResult[] = [];
    for (let i = 0; i < count; i++) {
      const variationRequest = {
        ...request,
        aiPrompt: request.aiPrompt
          ? `${request.aiPrompt}\n\nProvide a unique variation (version ${i + 1} of ${count}). Be creative and different from previous versions.`
          : undefined,
      };
      results.push(await this.fromAI(variationRequest));
    }
    return results;
  }

  /**
   * Source 1: Direct user input
   */
  private async fromUserInput(request: ContentRequest): Promise<ContentResult> {
    if (!request.text) {
      throw new AppError(400, 'Text is required for user_input source', 'MISSING_TEXT');
    }

    return {
      text: request.text,
      source: 'user_input',
      generatedAt: new Date(),
    };
  }

  /**
   * Source 2: Template with variable substitution
   */
  private async fromTemplate(request: ContentRequest): Promise<ContentResult> {
    let templateText = request.templateText;

    // Load template from DB if ID provided
    if (request.templateId && !templateText) {
      const template = await prisma.contentTemplate.findUnique({
        where: { id: request.templateId },
      });
      if (!template) {
        throw new AppError(404, 'Content template not found', 'TEMPLATE_NOT_FOUND');
      }
      templateText = template.content;
    }

    if (!templateText) {
      throw new AppError(400, 'Template text or templateId is required', 'MISSING_TEMPLATE');
    }

    // Variable substitution: replace {variable} with values
    let text = templateText;
    if (request.variables) {
      for (const [key, value] of Object.entries(request.variables)) {
        text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }
    }

    // Handle random selection: {option1|option2|option3}
    text = text.replace(/\{([^{}]*\|[^{}]*)\}/g, (match, options) => {
      const choices = options.split('|');
      return choices[Math.floor(Math.random() * choices.length)];
    });

    return {
      text,
      source: 'template',
      templateId: request.templateId,
      generatedAt: new Date(),
    };
  }

  /**
   * Source 3: AI-generated content
   */
  private async fromAI(request: ContentRequest): Promise<ContentResult> {
    if (!request.llmConfigId) {
      throw new AppError(400, 'llmConfigId is required for AI generation', 'MISSING_LLM_CONFIG');
    }

    // Load LLM config
    const llmConfig = await this.loadLLMConfig(request.llmConfigId);
    if (!llmConfig) {
      throw new AppError(404, 'LLM configuration not found', 'LLM_CONFIG_NOT_FOUND');
    }

    // Build the prompt
    const prompt = this.buildPrompt(request);

    // Generate
    const result = await llmProviderService.generate(llmConfig, {
      prompt,
      systemPrompt: request.aiSystemPrompt || this.buildSystemPrompt(request),
      maxTokens: request.maxLength ? Math.ceil(request.maxLength * 1.5) : llmConfig.maxTokens,
      temperature: llmConfig.temperature,
    });

    // Clean up the response
    let text = result.content.trim();
    // Remove quotes if AI wrapped the response
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      text = text.slice(1, -1);
    }

    return {
      text,
      source: 'ai_generate',
      llmProvider: llmConfig.provider,
      llmModel: llmConfig.model,
      tokensUsed: result.tokensUsed.total,
      generatedAt: new Date(),
    };
  }

  /**
   * Source 4: AI-enhanced template (template as base, AI improves/varies it)
   */
  private async fromAITemplate(request: ContentRequest): Promise<ContentResult> {
    // First, generate from template
    const templateResult = await this.fromTemplate(request);

    if (!request.llmConfigId) {
      return templateResult; // No AI config, return template as-is
    }

    // Then, use AI to enhance/variate
    const llmConfig = await this.loadLLMConfig(request.llmConfigId);
    if (!llmConfig) {
      return templateResult; // No LLM config, return template as-is
    }

    const enhancePrompt = `Rewrite the following text to sound more natural and human-like while keeping the same meaning. Make it ${request.tone || 'natural'} in tone. Keep it between ${request.minLength || 50} and ${request.maxLength || 500} characters. Only output the rewritten text, nothing else.

Original text:
${templateResult.text}`;

    const result = await llmProviderService.generate(llmConfig, {
      prompt: enhancePrompt,
      temperature: 0.7,
    });

    return {
      text: result.content.trim(),
      source: 'ai_from_template',
      templateId: request.templateId,
      llmProvider: llmConfig.provider,
      llmModel: llmConfig.model,
      tokensUsed: result.tokensUsed.total,
      generatedAt: new Date(),
    };
  }

  /**
   * Build the prompt for AI generation
   */
  private buildPrompt(request: ContentRequest): string {
    // If custom prompt provided, use scope template or raw prompt
    if (request.aiPrompt && request.scope === 'custom') {
      return request.aiPrompt;
    }

    const scope = request.scope || 'comments';
    let promptTemplate = SCOPE_PROMPTS[scope] || SCOPE_PROMPTS.custom;

    // If AI prompt is provided directly, use it
    if (request.aiPrompt) {
      promptTemplate = request.aiPrompt;
    }

    // Fill in template variables
    const ctx = request.context || {};
    const keywords = ctx.keywords?.length
      ? `Include these keywords naturally: ${ctx.keywords.join(', ')}`
      : '';
    const brandVoice = ctx.brandVoice
      ? `Brand voice: ${ctx.brandVoice}`
      : '';

    return promptTemplate
      .replace('{tone}', request.tone || 'natural')
      .replace('{minLength}', String(request.minLength || 50))
      .replace('{maxLength}', String(request.maxLength || 500))
      .replace('{topic}', ctx.targetContent || request.aiPrompt || 'general topic')
      .replace('{platform}', ctx.platform || 'social media')
      .replace('{engagementType}', ctx.engagementType || 'post')
      .replace('{targetContent}', ctx.targetContent || '')
      .replace('{targetUrl}', ctx.targetUrl || '')
      .replace('{userProfile}', ctx.userProfile || '')
      .replace('{keywords}', keywords)
      .replace('{brandVoice}', brandVoice)
      .replace('{language}', request.language || 'English');
  }

  /**
   * Build system prompt for AI
   */
  private buildSystemPrompt(request: ContentRequest): string {
    const parts = [
      'You are a content writer creating authentic, engaging content.',
      'Write naturally, as a real person would. Avoid generic AI-sounding phrases.',
      'Do not include hashtags unless specifically asked.',
      'Do not include emojis unless the tone calls for it.',
      'Output ONLY the requested content, no explanations or meta-commentary.',
    ];

    if (request.language && request.language !== 'English') {
      parts.push(`Write in ${request.language}.`);
    }

    if (request.context?.brandVoice) {
      parts.push(`Brand voice: ${request.context.brandVoice}`);
    }

    return parts.join(' ');
  }

  /**
   * Load LLM config from database
   */
  private async loadLLMConfig(configId: string): Promise<LLMProviderConfig | null> {
    const config = await prisma.lLMConfig.findUnique({
      where: { id: configId },
    });

    if (!config || !config.isActive) return null;

    // Decrypt API key
    let apiKey: string | undefined;
    if (config.encryptedApiKey) {
      try {
        apiKey = decrypt(config.encryptedApiKey);
      } catch {
        log.error('Failed to decrypt API key for LLM config', { configId });
        return null;
      }
    }

    return {
      id: config.id,
      name: config.name,
      provider: config.provider as any,
      apiKey,
      baseUrl: config.baseUrl || undefined,
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      topP: config.topP || undefined,
      frequencyPenalty: config.frequencyPenalty || undefined,
      presencePenalty: config.presencePenalty || undefined,
      systemPrompt: config.systemPrompt || undefined,
      timeout: config.timeout || 60000,
      azureEndpoint: config.azureEndpoint || undefined,
      azureApiVersion: config.azureApiVersion || undefined,
      requestsPerMinute: config.requestsPerMinute || undefined,
      tokensPerMinute: config.tokensPerMinute || undefined,
    };
  }

  /**
   * Get available scopes with descriptions
   */
  getScopes(): Array<{ scope: EngagementScope; label: string; description: string; applicableEngagementTypes: string[] }> {
    return [
      {
        scope: 'comments',
        label: 'Comments',
        description: 'Social media comments on posts',
        applicableEngagementTypes: ['CREATE_COMMENT', 'CREATE_REVIEW'],
      },
      {
        scope: 'replies',
        label: 'Replies',
        description: 'Replies to comments and threads',
        applicableEngagementTypes: ['REPLY_TO_COMMENT'],
      },
      {
        scope: 'posts',
        label: 'Posts',
        description: 'Social media posts and updates',
        applicableEngagementTypes: ['CREATE_POST', 'CREATE_ARTICLE'],
      },
      {
        scope: 'messages',
        label: 'Messages',
        description: 'Direct messages and DMs',
        applicableEngagementTypes: ['SEND_MESSAGE', 'SEND_DM'],
      },
      {
        scope: 'reviews',
        label: 'Reviews',
        description: 'Product and service reviews',
        applicableEngagementTypes: ['CREATE_REVIEW'],
      },
      {
        scope: 'articles',
        label: 'Articles',
        description: 'Blog posts and long-form content',
        applicableEngagementTypes: ['CREATE_ARTICLE', 'CREATE_POST'],
      },
      {
        scope: 'threads',
        label: 'Forum Threads',
        description: 'Forum posts and thread replies',
        applicableEngagementTypes: ['CREATE_THREAD', 'CREATE_COMMENT', 'REPLY_TO_COMMENT'],
      },
      {
        scope: 'bios',
        label: 'Bios',
        description: 'Profile bios and descriptions',
        applicableEngagementTypes: ['UPDATE_PROFILE', 'UPDATE_BIO', 'CREATE_ACCOUNT'],
      },
      {
        scope: 'descriptions',
        label: 'Descriptions',
        description: 'Item/page/channel descriptions',
        applicableEngagementTypes: ['UPDATE_PROFILE'],
      },
      {
        scope: 'titles',
        label: 'Titles',
        description: 'Headlines and titles',
        applicableEngagementTypes: ['CREATE_POST', 'CREATE_ARTICLE', 'CREATE_THREAD'],
      },
      {
        scope: 'summaries',
        label: 'Summaries',
        description: 'Content summaries and abstracts',
        applicableEngagementTypes: ['CREATE_POST', 'SHARE_POST'],
      },
      {
        scope: 'custom',
        label: 'Custom',
        description: 'Custom prompt — full control',
        applicableEngagementTypes: [],
      },
    ];
  }
}

export const contentGeneratorService = new ContentGeneratorService();
