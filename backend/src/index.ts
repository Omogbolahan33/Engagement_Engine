import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config';
import { connectDatabase, disconnectDatabase } from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { logger } from './utils/logger';

// Import routes
import authRoutes from './controllers/auth.controller';
import siteRoutes from './controllers/site.controller';
import engagementRoutes from './controllers/engagement.controller';
import credentialRoutes from './controllers/credential.controller';
import analyticsRoutes from './controllers/analytics.controller';
import metricsRoutes from './controllers/metrics.controller';
import oauthRoutes from './controllers/oauth.controller';
import templateRoutes from './controllers/template.controller';
import webhookRoutes from './controllers/webhook.controller';
import aiRoutes from './controllers/ai.controller';
import bulkRoutes from './controllers/bulk.controller';
import siteHealthRoutes from './controllers/site-health.controller';
import platformRoutes from './controllers/platform.controller';
import engagementFeaturesRoutes from './controllers/engagement-features.controller';
import sessionRoutes from './controllers/session.controller';
import gdprRoutes from './controllers/gdpr.controller';
import eventsRoutes from './controllers/events.controller';
import securityRoutes from './controllers/security.controller';
import { openApiSpec } from './docs/openapi';
import { idempotency } from './middleware/idempotency';
import { correlationId } from './middleware/correlation';
import { orgRateLimiter } from './middleware/org-rate-limiter';
import { authenticate } from './middleware/auth';
import { realtimeService } from './services/realtime.service';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors(config.cors));
app.use(compression());

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined', {
  stream: { write: (message: string) => logger.info(message.trim()) },
}));

// Correlation IDs for request tracing
app.use(correlationId());

// Global rate limiting
app.use(rateLimiter());

// Per-organization rate limiting
app.use(orgRateLimiter());

// Idempotency for mutating requests
app.use(idempotency());

// Health checks
import { healthService } from './services/health.service';

app.get('/health', async (req, res) => {
  const result = await healthService.check();
  const statusCode = result.status === 'unhealthy' ? 503 : 200;
  res.status(statusCode).json(result);
});

app.get('/health/live', async (req, res) => {
  res.json(await healthService.liveness());
});

app.get('/health/ready', async (req, res) => {
  const result = await healthService.readiness();
  res.status(result.ready ? 200 : 503).json(result);
});

// API routes
app.use(`${config.apiPrefix}/auth`, authRoutes);
app.use(`${config.apiPrefix}/sites`, siteRoutes);
app.use(`${config.apiPrefix}/engagements`, engagementRoutes);
app.use(`${config.apiPrefix}/credentials`, credentialRoutes);
app.use(`${config.apiPrefix}/analytics`, analyticsRoutes);
app.use(`${config.apiPrefix}/metrics`, metricsRoutes);
app.use(`${config.apiPrefix}/oauth`, oauthRoutes);
app.use(`${config.apiPrefix}/templates`, templateRoutes);
app.use(`${config.apiPrefix}/webhooks`, webhookRoutes);
app.use(`${config.apiPrefix}/ai`, aiRoutes);
app.use(`${config.apiPrefix}/bulk`, bulkRoutes);
app.use(`${config.apiPrefix}/site-health`, siteHealthRoutes);
app.use(`${config.apiPrefix}/platforms`, platformRoutes);
app.use(`${config.apiPrefix}/engagement-features`, engagementFeaturesRoutes);
app.use(`${config.apiPrefix}/sessions`, sessionRoutes);
app.use(`${config.apiPrefix}/gdpr`, gdprRoutes);
app.use(`${config.apiPrefix}/events`, eventsRoutes);
app.use(`${config.apiPrefix}/security`, securityRoutes);

// Circuit breaker status
app.get(`${config.apiPrefix}/system/circuit-breakers`, authenticate, async (req, res) => {
  const { getAllCircuitBreakers } = await import('./utils/circuit-breaker');
  res.json({ breakers: getAllCircuitBreakers() });
});

// LLM cost tracking
app.get(`${config.apiPrefix}/ai/usage`, authenticate, async (req: any, res) => {
  const { llmCostTracker } = await import('./services/ai/llm-cost-tracker.service');
  const days = parseInt(req.query.days as string) || 30;
  const usage = await llmCostTracker.getUsageSummary(req.user.organizationId, days);
  res.json(usage);
});

app.get(`${config.apiPrefix}/ai/pricing`, authenticate, async (req, res) => {
  const { llmCostTracker } = await import('./services/ai/llm-cost-tracker.service');
  res.json({ pricing: llmCostTracker.getModelPricing() });
});

// Token budget status
app.get(`${config.apiPrefix}/ai/budget`, authenticate, async (req: any, res) => {
  const { tokenBudgetService } = await import('./services/ai/token-budget.service');
  const status = await tokenBudgetService.getBudgetStatus(req.user.organizationId);
  res.json(status);
});

// Engagement guard status
app.get(`${config.apiPrefix}/engagements/:id/guard`, authenticate, async (req: any, res) => {
  const { engagementGuard } = await import('./services/engagement-guard.service');
  const status = await engagementGuard.getStatus(req.params.id);
  res.json(status);
});

// OpenAPI spec endpoint
app.get(`${config.apiPrefix}/docs/openapi.json`, (req, res) => {
  res.json(openApiSpec);
});

// API documentation
app.get(`${config.apiPrefix}/docs`, (req, res) => {
  res.json({
    name: 'Engagement Platform API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /auth/register': 'Register a new user',
        'POST /auth/login': 'Login',
        'POST /auth/refresh': 'Refresh access token',
        'POST /auth/logout': 'Logout',
        'GET /auth/me': 'Get current user',
      },
      sites: {
        'GET /sites': 'List all sites',
        'GET /sites/:id': 'Get site details',
        'POST /sites': 'Create a site',
        'PATCH /sites/:id': 'Update a site',
        'DELETE /sites/:id': 'Delete a site',
        'GET /sites/:id/stats': 'Get site statistics',
      },
      engagements: {
        'GET /engagements': 'List engagements',
        'GET /engagements/:id': 'Get engagement details',
        'POST /engagements': 'Create an engagement',
        'PATCH /engagements/:id': 'Update an engagement',
        'DELETE /engagements/:id': 'Delete an engagement',
        'POST /engagements/:id/activate': 'Activate engagement',
        'POST /engagements/:id/pause': 'Pause engagement',
        'POST /engagements/:id/execute': 'Execute engagement now',
        'POST /engagements/:id/schedule': 'Schedule engagement',
        'GET /engagements/:id/stats': 'Get engagement stats',
      },
      credentials: {
        'GET /credentials/auth-schemas': 'Get auth type schemas',
        'GET /credentials/site/:siteId': 'List credentials for site',
        'POST /credentials': 'Create credential',
        'PATCH /credentials/:id': 'Update credential',
        'DELETE /credentials/:id': 'Delete credential',
      },
      analytics: {
        'GET /analytics/overview': 'Dashboard overview',
        'GET /analytics/runs-over-time': 'Runs over time',
        'GET /analytics/by-type': 'Breakdown by engagement type',
        'GET /analytics/site-performance': 'Site performance',
        'GET /analytics/recent-activity': 'Recent activity',
        'GET /analytics/audit-logs': 'Audit logs',
      },
    },
  });
});

// Error handling
app.use(errorHandler);

// Start server
async function start() {
  try {
    await connectDatabase();
    await connectRedis();
    await realtimeService.init();

    app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
      logger.info(`API docs: http://localhost:${config.port}${config.apiPrefix}/docs`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await realtimeService.close();
  await disconnectDatabase();
  await disconnectRedis();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await realtimeService.close();
  await disconnectDatabase();
  await disconnectRedis();
  process.exit(0);
});

start();

export default app;
