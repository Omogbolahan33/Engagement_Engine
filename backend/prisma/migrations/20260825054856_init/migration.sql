-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('TWITTER', 'FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'REDDIT', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'THREADS', 'MASTODON', 'BLUESKY', 'DISCOURSE', 'PHPBB', 'VBBULLETIN', 'NODEBB', 'FLARUM', 'NAIRALAND', 'VOAT', 'LEMMY', 'MINDS', 'STEEMIT', 'FOURCHAN', 'QUORA', 'STACKOVERFLOW', 'WORDPRESS', 'MEDIUM', 'SUBSTACK', 'GHOST', 'DEVTO', 'HASHNODE', 'BLOGGER', 'TUMBLR', 'TRUSTPILOT', 'GLASSDOOR', 'YELP', 'G2', 'CAPTERRA', 'PRODUCTHUNT', 'AMAZON', 'EBAY', 'SHOPIFY', 'ETSY', 'ALIEXPRESS', 'HACKERNEWS', 'SLASHDOT', 'DIGG', 'VOX', 'REDDIT_NEWS', 'DISCORD', 'SLACK', 'TELEGRAM', 'WHATSAPP', 'SIGNAL', 'WEIBO', 'VK', 'OK_RU', 'LINE', 'KAKAOTALK', 'CUSTOM_API', 'CUSTOM_BROWSER', 'CUSTOM_WEBHOOK');

-- CreateEnum
CREATE TYPE "AuthType" AS ENUM ('API_KEY', 'BEARER_TOKEN', 'SESSION_TOKEN', 'JWT_TOKEN', 'OAUTH2_CLIENT_CREDENTIALS', 'OAUTH2_AUTHORIZATION_CODE', 'OAUTH2_DEVICE_CODE', 'PERSONAL_ACCESS_TOKEN', 'BASIC_AUTH', 'FORM_LOGIN', 'DIGEST_AUTH', 'NTLM_AUTH', 'KERBEROS', 'COOKIE_AUTH', 'SESSION_COOKIE', 'CSRF_TOKEN_PLUS_SESSION', 'CUSTOM_HEADER', 'HMAC_SIGNATURE', 'REQUEST_SIGNING', 'MTLS_CERTIFICATE', 'CLIENT_CERTIFICATE', 'TWITTER_OAUTH1', 'TWITTER_OAUTH2', 'GOOGLE_OAUTH2', 'FACEBOOK_LOGIN', 'GITHUB_APP', 'SLACK_BOT_TOKEN', 'DISCORD_BOT_TOKEN', 'REDDIT_OAUTH2', 'LINKEDIN_OAUTH2', 'PUPPETEER_LOGIN', 'SELENIUM_LOGIN', 'BROWSER_COOKIE_IMPORT', 'WEBHOOK_SECRET', 'HMAC_WEBHOOK', 'SAML_SSO', 'OIDC_SSO', 'LDAP_AUTH', 'CUSTOM_SCRIPT', 'MULTI_STEP_AUTH');

-- CreateEnum
CREATE TYPE "RefreshStrategy" AS ENUM ('NONE', 'AUTO_REFRESH', 'REFRESH_BEFORE_EXPIRY', 'REAUTH_ON_FAILURE', 'ROTATE_TOKENS', 'OAUTH2_REFRESH_TOKEN');

-- CreateEnum
CREATE TYPE "EngagementType" AS ENUM ('LIKE', 'DISLIKE', 'UPVOTE', 'DOWNVOTE', 'LOVE', 'HAHA', 'WOW', 'SAD', 'ANGRY', 'REACT_EMOJI', 'CREATE_POST', 'CREATE_COMMENT', 'REPLY_TO_COMMENT', 'CREATE_THREAD', 'CREATE_REVIEW', 'CREATE_ARTICLE', 'CREATE_POLL', 'SHARE_POST', 'RETWEET', 'REPOST', 'QUOTE_POST', 'BOOKMARK', 'SAVE_POST', 'PIN_POST', 'FOLLOW_USER', 'UNFOLLOW_USER', 'FOLLOW_TOPIC', 'JOIN_GROUP', 'LEAVE_GROUP', 'SUBSCRIBE_CHANNEL', 'UNSUBSCRIBE_CHANNEL', 'CREATE_ACCOUNT', 'UPDATE_PROFILE', 'UPDATE_AVATAR', 'UPDATE_BIO', 'VERIFY_EMAIL', 'FLAG_CONTENT', 'REPORT_CONTENT', 'BLOCK_USER', 'MUTE_USER', 'SEND_MESSAGE', 'SEND_DM', 'SEND_INVITE', 'SCRAPE_CONTENT', 'SCRAPE_USER_DATA', 'SCRAPE_ANALYTICS', 'MONITOR_MENTIONS', 'CUSTOM_ACTION', 'MULTI_STEP_ACTION', 'WORKFLOW');

-- CreateEnum
CREATE TYPE "EngagementStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BackoffStrategy" AS ENUM ('NONE', 'LINEAR', 'EXPONENTIAL', 'FIBONACCI');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'RETRYING', 'CANCELLED', 'TIMEOUT', 'RATE_LIMITED', 'AUTH_EXPIRED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL');

-- CreateEnum
CREATE TYPE "ProxyType" AS ENUM ('HTTP', 'HTTPS', 'SOCKS4', 'SOCKS5', 'RESIDENTIAL', 'MOBILE', 'DATACENTER');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'RETRYING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "mfaBackupCodes" JSONB NOT NULL DEFAULT '[]',
    "mfaEnabledAt" TIMESTAMP(3),
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "rateLimit" INTEGER NOT NULL DEFAULT 1000,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "platform" "PlatformType" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "rateLimits" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "authType" "AuthType" NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastRefreshAt" TIMESTAMP(3),
    "refreshStrategy" "RefreshStrategy",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagements" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "engagementType" "EngagementType" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "targetConfig" JSONB NOT NULL DEFAULT '{}',
    "schedule" JSONB NOT NULL DEFAULT '{}',
    "frequency" JSONB NOT NULL DEFAULT '{"maxPerMinute":1,"maxPerHour":10,"maxPerDay":100,"maxPerWeek":500,"cooldownMs":60000,"jitterMs":5000,"backoffStrategy":"LINEAR"}',
    "expiresAt" TIMESTAMP(3),
    "status" "EngagementStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "retryConfig" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engagements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_runs" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "credentialId" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "result" JSONB,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagement_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_logs" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "runId" TEXT,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagement_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proxy_configs" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "proxyType" "ProxyType" NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT,
    "encryptedPassword" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxConcurrent" INTEGER NOT NULL DEFAULT 5,
    "currentLoad" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proxy_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "dimensions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "encryptedSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 6,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "statusCode" INTEGER,
    "error" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "encryptedApiKey" TEXT,
    "baseUrl" TEXT,
    "maxTokens" INTEGER NOT NULL DEFAULT 500,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "topP" DOUBLE PRECISION,
    "frequencyPenalty" DOUBLE PRECISION,
    "presencePenalty" DOUBLE PRECISION,
    "systemPrompt" TEXT,
    "timeout" INTEGER NOT NULL DEFAULT 60000,
    "azureEndpoint" TEXT,
    "azureApiVersion" TEXT,
    "requestsPerMinute" INTEGER,
    "tokensPerMinute" INTEGER,
    "allowedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "language" TEXT NOT NULL DEFAULT 'English',
    "variables" JSONB NOT NULL DEFAULT '[]',
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "llmConfigId" TEXT,

    CONSTRAINT "content_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_key" ON "user_sessions"("token");

-- CreateIndex
CREATE INDEX "user_sessions_userId_idx" ON "user_sessions"("userId");

-- CreateIndex
CREATE INDEX "user_sessions_token_idx" ON "user_sessions"("token");

-- CreateIndex
CREATE INDEX "user_sessions_userId_revokedAt_idx" ON "user_sessions"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_organizationId_idx" ON "api_keys"("organizationId");

-- CreateIndex
CREATE INDEX "sites_organizationId_idx" ON "sites"("organizationId");

-- CreateIndex
CREATE INDEX "sites_platform_idx" ON "sites"("platform");

-- CreateIndex
CREATE INDEX "sites_organizationId_isActive_idx" ON "sites"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "credentials_siteId_idx" ON "credentials"("siteId");

-- CreateIndex
CREATE INDEX "credentials_authType_idx" ON "credentials"("authType");

-- CreateIndex
CREATE INDEX "engagements_siteId_idx" ON "engagements"("siteId");

-- CreateIndex
CREATE INDEX "engagements_engagementType_idx" ON "engagements"("engagementType");

-- CreateIndex
CREATE INDEX "engagements_status_idx" ON "engagements"("status");

-- CreateIndex
CREATE INDEX "engagements_siteId_status_idx" ON "engagements"("siteId", "status");

-- CreateIndex
CREATE INDEX "engagements_status_createdAt_idx" ON "engagements"("status", "createdAt");

-- CreateIndex
CREATE INDEX "engagement_runs_engagementId_idx" ON "engagement_runs"("engagementId");

-- CreateIndex
CREATE INDEX "engagement_runs_siteId_idx" ON "engagement_runs"("siteId");

-- CreateIndex
CREATE INDEX "engagement_runs_status_idx" ON "engagement_runs"("status");

-- CreateIndex
CREATE INDEX "engagement_runs_createdAt_idx" ON "engagement_runs"("createdAt");

-- CreateIndex
CREATE INDEX "engagement_runs_siteId_status_idx" ON "engagement_runs"("siteId", "status");

-- CreateIndex
CREATE INDEX "engagement_runs_siteId_createdAt_idx" ON "engagement_runs"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "engagement_runs_engagementId_status_idx" ON "engagement_runs"("engagementId", "status");

-- CreateIndex
CREATE INDEX "engagement_runs_engagementId_createdAt_idx" ON "engagement_runs"("engagementId", "createdAt");

-- CreateIndex
CREATE INDEX "engagement_logs_engagementId_idx" ON "engagement_logs"("engagementId");

-- CreateIndex
CREATE INDEX "engagement_logs_runId_idx" ON "engagement_logs"("runId");

-- CreateIndex
CREATE INDEX "engagement_logs_level_idx" ON "engagement_logs"("level");

-- CreateIndex
CREATE INDEX "engagement_logs_createdAt_idx" ON "engagement_logs"("createdAt");

-- CreateIndex
CREATE INDEX "engagement_logs_engagementId_createdAt_idx" ON "engagement_logs"("engagementId", "createdAt");

-- CreateIndex
CREATE INDEX "proxy_configs_siteId_idx" ON "proxy_configs"("siteId");

-- CreateIndex
CREATE INDEX "analytics_snapshots_organizationId_date_idx" ON "analytics_snapshots"("organizationId", "date");

-- CreateIndex
CREATE INDEX "analytics_snapshots_siteId_metric_idx" ON "analytics_snapshots"("siteId", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_snapshots_organizationId_siteId_date_metric_key" ON "analytics_snapshots"("organizationId", "siteId", "date", "metric");

-- CreateIndex
CREATE INDEX "webhooks_organizationId_idx" ON "webhooks"("organizationId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhookId_idx" ON "webhook_deliveries"("webhookId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_nextAttemptAt_idx" ON "webhook_deliveries"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "llm_configs_organizationId_idx" ON "llm_configs"("organizationId");

-- CreateIndex
CREATE INDEX "content_templates_organizationId_idx" ON "content_templates"("organizationId");

-- CreateIndex
CREATE INDEX "content_templates_category_idx" ON "content_templates"("category");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_action_idx" ON "audit_logs"("organizationId", "action");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_runs" ADD CONSTRAINT "engagement_runs_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_runs" ADD CONSTRAINT "engagement_runs_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_runs" ADD CONSTRAINT "engagement_runs_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_logs" ADD CONSTRAINT "engagement_logs_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_logs" ADD CONSTRAINT "engagement_logs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "engagement_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proxy_configs" ADD CONSTRAINT "proxy_configs_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_configs" ADD CONSTRAINT "llm_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_templates" ADD CONSTRAINT "content_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_templates" ADD CONSTRAINT "content_templates_llmConfigId_fkey" FOREIGN KEY ("llmConfigId") REFERENCES "llm_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
