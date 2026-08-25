import { prisma } from '../config/database';
import { decrypt } from '../utils/encryption';
import { credentialService } from './credential.service';
import { getCircuitBreaker } from '../utils/circuit-breaker';
import { safeFetch } from '../utils/ssrf-protection';
import { engagementGuard } from './engagement-guard.service';
import { createContextLogger } from '../utils/logger';
import { EngagementType, RunStatus, AuthType } from '@prisma/client';

const log = createContextLogger('executor');

/**
 * Engagement Executor - Core engine that executes engagements
 * Supports multiple execution strategies based on platform and auth type
 */

interface ExecutionContext {
  engagementId: string;
  siteId: string;
  credentialId?: string;
  engagementType: EngagementType;
  targetConfig: Record<string, any>;
  config: Record<string, any>;
}

interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  statusCode?: number;
  responseTime?: number;
  requestUrl?: string;
  requestMethod?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: any;
  responseHeaders?: Record<string, string>;
  responseBody?: any;
}

export class ExecutorService {
  /**
   * Execute an engagement
   */
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();

    log.info('Executing engagement', {
      engagementId: context.engagementId,
      type: context.engagementType,
    });

    try {
      // Get site details
      const site = await prisma.site.findUnique({
        where: { id: context.siteId },
      });

      if (!site) {
        return { success: false, error: 'Site not found' };
      }

      // Get credentials if specified
      let authHeaders: Record<string, string> = {};
      if (context.credentialId) {
        authHeaders = await this.buildAuthHeaders(context.credentialId, site.url);
      }

      // Execute through circuit breaker
      const breaker = getCircuitBreaker(`site:${new URL(site.url).hostname}`, {
        failureThreshold: 10,
        resetTimeoutMs: 120000,
      });

      const result = await breaker.execute(() =>
        this.executeByType(
          context.engagementType,
          site.url,
          context.targetConfig,
          context.config,
          authHeaders
        )
      );

      const responseTime = Date.now() - startTime;

      // Record result with engagement guard
      await engagementGuard.recordResult(
        context.engagementId,
        result.success,
        result.statusCode,
        result.error
      );

      // Log the run
      await this.logRun(context, result, responseTime);

      return { ...result, responseTime };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const result = { success: false, error: error.message };
      await this.logRun(context, result, responseTime);
      return { ...result, responseTime };
    }
  }

  /**
   * Build authentication headers from credential
   */
  private async buildAuthHeaders(credentialId: string, siteUrl: string): Promise<Record<string, string>> {
    const credential = await prisma.credential.findUnique({
      where: { id: credentialId },
    });

    if (!credential || !credential.isActive) {
      throw new Error('Credential not found or inactive');
    }

    // Check expiry
    if (credential.expiresAt && credential.expiresAt < new Date()) {
      throw new Error('Credential has expired');
    }

    const data = JSON.parse(decrypt(credential.encryptedData));

    // Mark credential as used
    await credentialService.markUsed(credentialId);

    return this.buildHeadersForAuthType(credential.authType, data, siteUrl);
  }

  /**
   * Build headers based on auth type
   */
  private buildHeadersForAuthType(
    authType: AuthType,
    data: Record<string, any>,
    siteUrl: string
  ): Record<string, string> {
    const headers: Record<string, string> = {};

    switch (authType) {
      // Token-based
      case 'API_KEY':
        headers['X-API-Key'] = data.apiKey;
        break;
      case 'BEARER_TOKEN':
        headers['Authorization'] = `Bearer ${data.token}`;
        break;
      case 'SESSION_TOKEN':
        headers['Cookie'] = `${data.cookieName || 'session'}=${data.sessionToken}`;
        break;
      case 'JWT_TOKEN':
        headers['Authorization'] = `Bearer ${data.jwt}`;
        break;
      case 'PERSONAL_ACCESS_TOKEN':
        headers['Authorization'] = `token ${data.token}`;
        break;

      // Basic Auth
      case 'BASIC_AUTH':
        headers['Authorization'] = `Basic ${Buffer.from(`${data.username}:${data.password}`).toString('base64')}`;
        break;

      // Digest Auth
      case 'DIGEST_AUTH':
        // Digest auth requires request-level computation
        headers['X-Auth-Type'] = 'digest';
        headers['X-Auth-Username'] = data.username;
        headers['X-Auth-Password'] = data.password;
        headers['X-Auth-Realm'] = data.realm || '';
        break;

      // Cookie-based
      case 'COOKIE_AUTH':
        headers['Cookie'] = data.cookies;
        break;
      case 'SESSION_COOKIE':
        headers['Cookie'] = `${data.cookieName || 'session'}=${data.sessionCookie}`;
        break;
      case 'CSRF_TOKEN_PLUS_SESSION':
        headers['Cookie'] = `${data.cookieName || 'session'}=${data.sessionCookie}`;
        if (data.csrfHeaderName) {
          headers[data.csrfHeaderName] = data.csrfToken;
        }
        break;

      // Custom Header
      case 'CUSTOM_HEADER':
        headers[data.headerName] = data.headerValue;
        break;

      // HMAC Signature
      case 'HMAC_SIGNATURE':
        headers['X-Auth-Type'] = 'hmac';
        headers['X-Auth-Secret'] = data.secretKey;
        headers['X-Auth-Algorithm'] = data.algorithm || 'sha256';
        headers['X-Auth-Header'] = data.headerName || 'X-Signature';
        break;

      // Platform-specific
      case 'TWITTER_OAUTH1':
        headers['X-Auth-Type'] = 'oauth1';
        headers['X-Consumer-Key'] = data.consumerKey;
        headers['X-Consumer-Secret'] = data.consumerSecret;
        headers['X-Access-Token'] = data.accessToken;
        headers['X-Access-Token-Secret'] = data.accessTokenSecret;
        break;
      case 'TWITTER_OAUTH2':
      case 'GOOGLE_OAUTH2':
      case 'LINKEDIN_OAUTH2':
        headers['Authorization'] = `Bearer ${data.accessToken}`;
        break;
      case 'FACEBOOK_LOGIN':
        headers['Authorization'] = `Bearer ${data.accessToken}`;
        break;
      case 'GITHUB_APP':
        headers['X-Auth-Type'] = 'github-app';
        headers['X-App-Id'] = data.appId;
        headers['X-Private-Key'] = data.privateKey;
        headers['X-Installation-Id'] = data.installationId;
        break;
      case 'SLACK_BOT_TOKEN':
        headers['Authorization'] = `Bearer ${data.botToken}`;
        break;
      case 'DISCORD_BOT_TOKEN':
        headers['Authorization'] = `Bot ${data.botToken}`;
        break;
      case 'REDDIT_OAUTH2':
        headers['Authorization'] = `Bearer ${data.accessToken}`;
        headers['User-Agent'] = data.userAgent || 'EngagementPlatform/1.0';
        break;

      // Webhook
      case 'WEBHOOK_SECRET':
      case 'HMAC_WEBHOOK':
        headers['X-Webhook-Secret'] = data.secret;
        break;

      // Certificate-based
      case 'MTLS_CERTIFICATE':
      case 'CLIENT_CERTIFICATE':
        headers['X-Auth-Type'] = 'certificate';
        headers['X-Certificate'] = data.certificatePem || data.certificatePfx;
        break;

      // Browser-based (handled separately)
      case 'PUPPETEER_LOGIN':
      case 'SELENIUM_LOGIN':
      case 'BROWSER_COOKIE_IMPORT':
        headers['X-Auth-Type'] = 'browser';
        headers['X-Login-Url'] = data.loginUrl || '';
        break;

      // SSO
      case 'SAML_SSO':
      case 'OIDC_SSO':
        headers['X-Auth-Type'] = 'sso';
        headers['X-SSO-Token'] = data.accessToken || data.samlResponse || '';
        break;

      // LDAP
      case 'LDAP_AUTH':
        headers['X-Auth-Type'] = 'ldap';
        headers['X-LDAP-Url'] = data.url;
        headers['X-LDAP-BindDn'] = data.bindDn;
        headers['X-LDAP-BindPassword'] = data.bindPassword;
        break;

      // Custom Script
      case 'CUSTOM_SCRIPT':
        headers['X-Auth-Type'] = 'custom-script';
        headers['X-Auth-Script'] = data.script;
        break;

      // Multi-step
      case 'MULTI_STEP_AUTH':
        headers['X-Auth-Type'] = 'multi-step';
        headers['X-Auth-Steps'] = JSON.stringify(data.steps);
        break;

      default:
        log.warn('Unknown auth type, no headers built', { authType });
    }

    return headers;
  }

  /**
   * Execute engagement by type
   */
  private async executeByType(
    type: EngagementType,
    siteUrl: string,
    targetConfig: Record<string, any>,
    config: Record<string, any>,
    authHeaders: Record<string, string>
  ): Promise<ExecutionResult> {
    const apiEndpoint = this.buildApiEndpoint(type, siteUrl, targetConfig);
    const method = this.getHttpMethod(type);
    const body = this.buildRequestBody(type, targetConfig, config);

    // Make the HTTP request through circuit breaker
    const breaker = getCircuitBreaker(`site:${new URL(siteUrl).hostname}`, {
      failureThreshold: 10,
      resetTimeoutMs: 120000,
    });

    const response = await breaker.execute(() => this.makeRequest(apiEndpoint, method, authHeaders, body));

    return {
      success: response.ok,
      statusCode: response.status,
      data: response.data,
      error: response.ok ? undefined : response.error,
      requestUrl: response.requestUrl,
      requestMethod: response.requestMethod,
      requestHeaders: response.requestHeaders,
      requestBody: response.requestBody,
      responseHeaders: response.responseHeaders,
      responseBody: response.responseBody,
    };
  }

  /**
   * Build API endpoint based on engagement type
   */
  private buildApiEndpoint(type: EngagementType, siteUrl: string, target: Record<string, any>): string {
    const base = siteUrl.replace(/\/$/, '');
    const postId = target.postId || target.id;
    const commentId = target.commentId;
    const userId = target.userId;

    const endpoints: Partial<Record<EngagementType, string>> = {
      // Reactions
      LIKE: `${base}/api/posts/${postId}/like`,
      DISLIKE: `${base}/api/posts/${postId}/dislike`,
      UPVOTE: `${base}/api/posts/${postId}/upvote`,
      DOWNVOTE: `${base}/api/posts/${postId}/downvote`,

      // Content
      CREATE_POST: `${base}/api/posts`,
      CREATE_COMMENT: `${base}/api/posts/${postId}/comments`,
      REPLY_TO_COMMENT: `${base}/api/comments/${commentId}/replies`,
      CREATE_THREAD: `${base}/api/threads`,
      CREATE_REVIEW: `${base}/api/reviews`,
      CREATE_ARTICLE: `${base}/api/articles`,
      CREATE_POLL: `${base}/api/polls`,

      // Sharing
      SHARE_POST: `${base}/api/posts/${postId}/share`,
      RETWEET: `${base}/api/posts/${postId}/retweet`,
      REPOST: `${base}/api/posts/${postId}/repost`,
      QUOTE_POST: `${base}/api/posts/${postId}/quote`,
      BOOKMARK: `${base}/api/posts/${postId}/bookmark`,
      SAVE_POST: `${base}/api/posts/${postId}/save`,
      PIN_POST: `${base}/api/posts/${postId}/pin`,

      // Social
      FOLLOW_USER: `${base}/api/users/${userId}/follow`,
      UNFOLLOW_USER: `${base}/api/users/${userId}/unfollow`,
      FOLLOW_TOPIC: `${base}/api/topics/${target.topicId}/follow`,
      JOIN_GROUP: `${base}/api/groups/${target.groupId}/join`,
      LEAVE_GROUP: `${base}/api/groups/${target.groupId}/leave`,
      SUBSCRIBE_CHANNEL: `${base}/api/channels/${target.channelId}/subscribe`,
      UNSUBSCRIBE_CHANNEL: `${base}/api/channels/${target.channelId}/unsubscribe`,

      // Account
      CREATE_ACCOUNT: `${base}/api/accounts`,
      UPDATE_PROFILE: `${base}/api/profile`,
      UPDATE_AVATAR: `${base}/api/profile/avatar`,
      UPDATE_BIO: `${base}/api/profile/bio`,
      VERIFY_EMAIL: `${base}/api/auth/verify-email`,

      // Moderation
      FLAG_CONTENT: `${base}/api/content/${postId}/flag`,
      REPORT_CONTENT: `${base}/api/content/${postId}/report`,
      BLOCK_USER: `${base}/api/users/${userId}/block`,
      MUTE_USER: `${base}/api/users/${userId}/mute`,

      // Messaging
      SEND_MESSAGE: `${base}/api/messages`,
      SEND_DM: `${base}/api/users/${userId}/messages`,
      SEND_INVITE: `${base}/api/invites`,

      // Analytics
      SCRAPE_CONTENT: `${base}/api/content/${postId}`,
      SCRAPE_USER_DATA: `${base}/api/users/${userId}`,
      SCRAPE_ANALYTICS: `${base}/api/analytics`,
      MONITOR_MENTIONS: `${base}/api/mentions`,
    };

    return endpoints[type] || `${base}/api/engagement/${type.toLowerCase()}`;
  }

  /**
   * Get HTTP method for engagement type
   */
  private getHttpMethod(type: EngagementType): string {
    const getMethods = [
      'SCRAPE_CONTENT', 'SCRAPE_USER_DATA', 'SCRAPE_ANALYTICS', 'MONITOR_MENTIONS',
    ];

    const deleteMethods = ['UNFOLLOW_USER', 'LEAVE_GROUP', 'UNSUBSCRIBE_CHANNEL', 'BLOCK_USER', 'MUTE_USER'];

    if (getMethods.includes(type)) return 'GET';
    if (deleteMethods.includes(type)) return 'DELETE';
    return 'POST';
  }

  /**
   * Build request body
   */
  private buildRequestBody(
    type: EngagementType,
    target: Record<string, any>,
    config: Record<string, any>
  ): Record<string, any> | undefined {
    const bodyMethods = [
      'CREATE_POST', 'CREATE_COMMENT', 'REPLY_TO_COMMENT', 'CREATE_THREAD',
      'CREATE_REVIEW', 'CREATE_ARTICLE', 'CREATE_POLL', 'CREATE_ACCOUNT',
      'UPDATE_PROFILE', 'UPDATE_AVATAR', 'UPDATE_BIO', 'SEND_MESSAGE',
      'SEND_DM', 'SEND_INVITE', 'FLAG_CONTENT', 'REPORT_CONTENT',
      'QUOTE_POST',
    ];

    if (!bodyMethods.includes(type)) return undefined;

    return {
      ...target,
      ...config,
    };
  }

  /**
   * Make HTTP request with full request/response capture for metrics
   */
  private async makeRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: Record<string, any>
  ): Promise<{
    ok: boolean;
    status: number;
    data?: any;
    error?: string;
    requestUrl: string;
    requestMethod: string;
    requestHeaders: Record<string, string>;
    requestBody: any;
    responseHeaders: Record<string, string>;
    responseBody: any;
  }> {
    // Sanitize headers for logging (remove sensitive auth data)
    const sanitizedHeaders = { ...headers };
    if (sanitizedHeaders['Authorization']) sanitizedHeaders['Authorization'] = 'Bearer ***';
    if (sanitizedHeaders['Cookie']) sanitizedHeaders['Cookie'] = '***';
    Object.keys(sanitizedHeaders).forEach((key) => {
      if (key.toLowerCase().includes('secret') || key.toLowerCase().includes('password') || key.toLowerCase().includes('token')) {
        sanitizedHeaders[key] = '***';
      }
    });

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'EngagementPlatform/1.0',
          ...headers,
        },
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await safeFetch(url, fetchOptions);
      let data: any;

      try {
        data = await response.json();
      } catch {
        data = await response.text();
      }

      // Capture response headers
      const respHeaders: Record<string, string> = {};
      response.headers.forEach((value: string, key: string) => {
        respHeaders[key] = value;
      });

      return {
        ok: response.ok,
        status: response.status,
        data,
        error: response.ok ? undefined : `HTTP ${response.status}: ${JSON.stringify(data)}`,
        requestUrl: url,
        requestMethod: method,
        requestHeaders: sanitizedHeaders,
        requestBody: body || null,
        responseHeaders: respHeaders,
        responseBody: data,
      };
    } catch (error: any) {
      return {
        ok: false,
        status: 0,
        error: error.message,
        requestUrl: url,
        requestMethod: method,
        requestHeaders: sanitizedHeaders,
        requestBody: body || null,
        responseHeaders: {},
        responseBody: null,
      };
    }
  }

  /**
   * Log engagement run with full request/response details
   */
  private async logRun(
    context: ExecutionContext,
    result: ExecutionResult & {
      requestUrl?: string;
      requestMethod?: string;
      requestHeaders?: Record<string, string>;
      requestBody?: any;
      responseHeaders?: Record<string, string>;
      responseBody?: any;
    },
    responseTime: number
  ): Promise<void> {
    try {
      await prisma.engagementRun.create({
        data: {
          engagementId: context.engagementId,
          siteId: context.siteId,
          credentialId: context.credentialId,
          status: result.success ? 'SUCCESS' : 'FAILED',
          startedAt: new Date(Date.now() - responseTime),
          completedAt: new Date(),
          result: result.data || null,
          errorMessage: result.error || null,
          metadata: {
            statusCode: result.statusCode,
            responseTime,
            requestUrl: result.requestUrl,
            requestMethod: result.requestMethod,
            requestHeaders: result.requestHeaders,
            requestBody: result.requestBody,
            responseHeaders: result.responseHeaders,
            responseBody: result.responseBody,
            errorCode: result.statusCode ? `HTTP_${result.statusCode}` : 'NETWORK_ERROR',
          },
        },
      });

      // Update engagement log
      await prisma.engagementLog.create({
        data: {
          engagementId: context.engagementId,
          level: result.success ? 'INFO' : 'ERROR',
          message: result.success
            ? `✓ ${result.requestMethod} ${result.requestUrl} → ${result.statusCode} (${responseTime}ms)`
            : `✗ ${result.requestMethod} ${result.requestUrl} → ${result.statusCode || 'ERR'}: ${result.error}`,
          data: {
            statusCode: result.statusCode,
            responseTime,
            requestUrl: result.requestUrl,
            requestMethod: result.requestMethod,
            errorCategory: this.categorizeError(result.error, result.statusCode),
          },
        },
      });
    } catch (error) {
      log.error('Failed to log engagement run', { error });
    }
  }

  /**
   * Categorize errors for analysis
   */
  private categorizeError(message: string | undefined, statusCode?: number): string {
    if (!message && !statusCode) return 'Unknown';
    const msg = (message || '').toLowerCase();
    const code = statusCode || 0;
    if (code === 429 || msg.includes('rate limit')) return 'Rate Limited';
    if (code === 401 || code === 403 || msg.includes('auth')) return 'Authentication';
    if (code === 404 || msg.includes('not found')) return 'Not Found';
    if (code >= 500 || msg.includes('server')) return 'Server Error';
    if (msg.includes('timeout')) return 'Timeout';
    if (msg.includes('network') || msg.includes('econnrefused')) return 'Network';
    if (msg.includes('blocked') || msg.includes('captcha')) return 'Blocked';
    return 'Other';
  }
}

export const executorService = new ExecutorService();
