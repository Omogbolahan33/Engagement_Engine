/**
 * OpenAPI 3.0 Specification for Engagement Platform API
 * Used by the built-in Swagger UI sandbox
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Engagement Platform API',
    version: '1.0.0',
    description: `
# Engagement Platform API

Production SaaS API for multi-site engagement automation.

## Authentication

All endpoints require authentication via one of:
- **Bearer Token**: \`Authorization: Bearer <access_token>\`
- **API Key**: \`X-API-Key: <api_key>\`

## Rate Limits

- Default: 100 requests per 15 minutes per IP
- Login/Register: 5-10 requests per minute
- API Key endpoints: Configurable per key

## Error Responses

All errors follow this format:
\`\`\`json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": [{ "field": "fieldName", "message": "validation error" }]
}
\`\`\`
    `,
    contact: {
      name: 'Engagement Platform Support',
      email: 'support@engagement-platform.com',
    },
  },
  servers: [
    { url: '/api/v1', description: 'Current server' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: { type: 'string' },
          details: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          role: { type: 'string', enum: ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'] },
          organization: { $ref: '#/components/schemas/Organization' },
        },
      },
      Organization: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          slug: { type: 'string' },
          plan: { type: 'string', enum: ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] },
        },
      },
      Site: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          url: { type: 'string', format: 'uri' },
          platform: { type: 'string' },
          description: { type: 'string' },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          _count: {
            type: 'object',
            properties: {
              engagements: { type: 'integer' },
              credentials: { type: 'integer' },
              engagementRuns: { type: 'integer' },
            },
          },
        },
      },
      Engagement: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string' },
          engagementType: { type: 'string' },
          status: { type: 'string', enum: ['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED', 'EXPIRED', 'ARCHIVED'] },
          priority: { type: 'integer', minimum: 1, maximum: 10 },
          targetConfig: { type: 'object' },
          config: { type: 'object' },
          frequency: { $ref: '#/components/schemas/FrequencyConfig' },
          expiresAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      FrequencyConfig: {
        type: 'object',
        properties: {
          maxPerMinute: { type: 'integer' },
          maxPerHour: { type: 'integer' },
          maxPerDay: { type: 'integer' },
          maxPerWeek: { type: 'integer' },
          maxTotal: { type: 'integer' },
          cooldownMs: { type: 'integer' },
          jitterMs: { type: 'integer' },
          backoffStrategy: { type: 'string', enum: ['NONE', 'LINEAR', 'EXPONENTIAL', 'FIBONACCI'] },
        },
      },
      Credential: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          authType: { type: 'string' },
          isActive: { type: 'boolean' },
          expiresAt: { type: 'string', format: 'date-time' },
          lastUsedAt: { type: 'string', format: 'date-time' },
          maskedData: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      EngagementRun: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          engagementName: { type: 'string' },
          engagementType: { type: 'string' },
          siteName: { type: 'string' },
          platform: { type: 'string' },
          status: { type: 'string' },
          startedAt: { type: 'string', format: 'date-time' },
          completedAt: { type: 'string', format: 'date-time' },
          durationMs: { type: 'integer' },
          httpStatusCode: { type: 'integer' },
          errorMessage: { type: 'string' },
          errorCategory: { type: 'string' },
          retryCount: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      RunDetail: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          engagementId: { type: 'string' },
          engagementName: { type: 'string' },
          engagementType: { type: 'string' },
          siteName: { type: 'string' },
          platform: { type: 'string' },
          status: { type: 'string' },
          startedAt: { type: 'string', format: 'date-time' },
          completedAt: { type: 'string', format: 'date-time' },
          durationMs: { type: 'integer' },
          httpStatusCode: { type: 'integer' },
          requestUrl: { type: 'string' },
          requestMethod: { type: 'string' },
          requestBody: { type: 'object' },
          responseStatus: { type: 'integer' },
          responseBody: { type: 'object' },
          errorMessage: { type: 'string' },
          errorCode: { type: 'string' },
          errorCategory: { type: 'string' },
          retryCount: { type: 'integer' },
          credentialName: { type: 'string' },
          proxyUsed: { type: 'string' },
          metadata: { type: 'object' },
        },
      },
      Metrics: {
        type: 'object',
        properties: {
          totalRuns: { type: 'integer' },
          successfulRuns: { type: 'integer' },
          failedRuns: { type: 'integer' },
          successRate: { type: 'number' },
          avgResponseTimeMs: { type: 'integer' },
          p50ResponseTimeMs: { type: 'integer' },
          p95ResponseTimeMs: { type: 'integer' },
          p99ResponseTimeMs: { type: 'integer' },
          runsByStatus: { type: 'object' },
          topErrors: { type: 'array', items: { type: 'object' } },
          timeline: { type: 'array', items: { type: 'object' } },
        },
      },
      FailureAnalysis: {
        type: 'object',
        properties: {
          totalFailures: { type: 'integer' },
          byCategory: { type: 'array', items: { type: 'object' } },
          byErrorCode: { type: 'array', items: { type: 'object' } },
          byPlatform: { type: 'array', items: { type: 'object' } },
          recentFailures: { type: 'array', items: { $ref: '#/components/schemas/RunDetail' } },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
  paths: {
    // ============================================================
    // AUTH
    // ============================================================
    '/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new user',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  organizationName: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'User created successfully' },
          '400': { description: 'Validation error' },
          '409': { description: 'Email already registered' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login with email and password',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: { $ref: '#/components/schemas/User' },
                    tokens: {
                      type: 'object',
                      properties: {
                        accessToken: { type: 'string' },
                        refreshToken: { type: 'string' },
                        expiresIn: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Authentication'],
        summary: 'Refresh access token',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Tokens refreshed' },
          '401': { description: 'Invalid refresh token' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current user info',
        responses: {
          '200': { description: 'Current user info' },
        },
      },
    },

    // ============================================================
    // SITES
    // ============================================================
    '/sites': {
      get: {
        tags: ['Sites'],
        summary: 'List all sites',
        parameters: [
          { name: 'platform', in: 'query', schema: { type: 'string' } },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          '200': {
            description: 'List of sites',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sites: { type: 'array', items: { $ref: '#/components/schemas/Site' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Sites'],
        summary: 'Create a new site',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'url', 'platform'],
                properties: {
                  name: { type: 'string' },
                  url: { type: 'string', format: 'uri' },
                  platform: { type: 'string' },
                  description: { type: 'string' },
                  settings: { type: 'object' },
                  rateLimits: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Site created' },
          '400': { description: 'Validation error' },
        },
      },
    },
    '/sites/{id}': {
      get: {
        tags: ['Sites'],
        summary: 'Get site details',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Site details' },
          '404': { description: 'Site not found' },
        },
      },
      patch: {
        tags: ['Sites'],
        summary: 'Update a site',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Site updated' } },
      },
      delete: {
        tags: ['Sites'],
        summary: 'Delete a site',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Site deleted' } },
      },
    },

    // ============================================================
    // ENGAGEMENTS
    // ============================================================
    '/engagements': {
      get: {
        tags: ['Engagements'],
        summary: 'List all engagements',
        parameters: [
          { name: 'siteId', in: 'query', schema: { type: 'string' } },
          { name: 'engagementType', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'List of engagements',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    engagements: { type: 'array', items: { $ref: '#/components/schemas/Engagement' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Engagements'],
        summary: 'Create a new engagement',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['siteId', 'name', 'engagementType', 'targetConfig'],
                properties: {
                  siteId: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  engagementType: { type: 'string' },
                  targetConfig: { type: 'object' },
                  config: { type: 'object' },
                  frequency: { $ref: '#/components/schemas/FrequencyConfig' },
                  expiresAt: { type: 'string', format: 'date-time' },
                  priority: { type: 'integer', minimum: 1, maximum: 10 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Engagement created' },
        },
      },
    },
    '/engagements/{id}': {
      get: {
        tags: ['Engagements'],
        summary: 'Get engagement details with runs and logs',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Engagement details' } },
      },
      patch: {
        tags: ['Engagements'],
        summary: 'Update an engagement',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Engagement updated' } },
      },
      delete: {
        tags: ['Engagements'],
        summary: 'Delete an engagement',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Engagement deleted' } },
      },
    },
    '/engagements/{id}/activate': {
      post: {
        tags: ['Engagements'],
        summary: 'Activate an engagement',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Engagement activated' } },
      },
    },
    '/engagements/{id}/pause': {
      post: {
        tags: ['Engagements'],
        summary: 'Pause an engagement',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Engagement paused' } },
      },
    },
    '/engagements/{id}/execute': {
      post: {
        tags: ['Engagements'],
        summary: 'Execute an engagement immediately',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  credentialId: { type: 'string' },
                  priority: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Engagement queued' } },
      },
    },
    '/engagements/{id}/schedule': {
      post: {
        tags: ['Engagements'],
        summary: 'Schedule an engagement with cron',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['cronExpression'],
                properties: {
                  cronExpression: { type: 'string', example: '0 */2 * * *' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Engagement scheduled' } },
      },
    },

    // ============================================================
    // CREDENTIALS
    // ============================================================
    '/credentials/auth-schemas': {
      get: {
        tags: ['Credentials'],
        summary: 'Get all auth type schemas (for dynamic form generation)',
        responses: {
          '200': {
            description: 'Auth type schemas',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    properties: {
                      fields: { type: 'array', items: { type: 'string' } },
                      sensitive: { type: 'array', items: { type: 'string' } },
                      description: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/credentials/site/{siteId}': {
      get: {
        tags: ['Credentials'],
        summary: 'List credentials for a site (masked)',
        parameters: [{ name: 'siteId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'List of credentials',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    credentials: { type: 'array', items: { $ref: '#/components/schemas/Credential' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/credentials': {
      post: {
        tags: ['Credentials'],
        summary: 'Create a new credential',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['siteId', 'name', 'authType', 'credentialData'],
                properties: {
                  siteId: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  authType: { type: 'string' },
                  credentialData: { type: 'object' },
                  metadata: { type: 'object' },
                  expiresAt: { type: 'string', format: 'date-time' },
                  refreshStrategy: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Credential created' } },
      },
    },

    // ============================================================
    // OAUTH - META
    // ============================================================
    '/oauth/meta/authorize': {
      get: {
        tags: ['OAuth - Meta'],
        summary: 'Get Meta OAuth authorization URL',
        description: 'Generates the URL where the user should be redirected to grant Meta permissions. Supports Facebook, Instagram, and Threads.',
        parameters: [
          { name: 'platform', in: 'query', required: true, schema: { type: 'string', enum: ['facebook', 'instagram', 'threads'] } },
          { name: 'scope_preset', in: 'query', schema: { type: 'string', default: 'full_access' } },
          { name: 'site_id', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Authorization URL',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    authorizationUrl: { type: 'string' },
                    scopes: { type: 'array', items: { type: 'string' } },
                    platform: { type: 'string' },
                    state: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/oauth/meta/callback': {
      get: {
        tags: ['OAuth - Meta'],
        summary: 'Meta OAuth callback',
        description: 'Callback endpoint that Meta redirects to after user grants permissions. Exchanges code for tokens and stores credentials.',
        parameters: [
          { name: 'code', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'state', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '302': { description: 'Redirect to frontend with success/error' },
        },
      },
    },
    '/oauth/meta/refresh/{credentialId}': {
      post: {
        tags: ['OAuth - Meta'],
        summary: 'Refresh a Meta credential token',
        parameters: [{ name: 'credentialId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Token refreshed' } },
      },
    },
    '/oauth/meta/scopes': {
      get: {
        tags: ['OAuth - Meta'],
        summary: 'Get available Meta scope presets',
        responses: { '200': { description: 'Scope presets' } },
      },
    },

    // ============================================================
    // METRICS & ANALYTICS
    // ============================================================
    '/metrics': {
      get: {
        tags: ['Metrics & Analytics'],
        summary: 'Get comprehensive engagement metrics',
        parameters: [
          { name: 'siteId', in: 'query', schema: { type: 'string' } },
          { name: 'engagementId', in: 'query', schema: { type: 'string' } },
          { name: 'engagementType', in: 'query', schema: { type: 'string' } },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: {
          '200': {
            description: 'Comprehensive metrics',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    metrics: { $ref: '#/components/schemas/Metrics' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/metrics/runs': {
      get: {
        tags: ['Metrics & Analytics'],
        summary: 'Get paginated run history with filters',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'engagementId', in: 'query', schema: { type: 'string' } },
          { name: 'siteId', in: 'query', schema: { type: 'string' } },
          { name: 'engagementType', in: 'query', schema: { type: 'string' } },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string' } },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: {
          '200': {
            description: 'Paginated run history',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    runs: { type: 'array', items: { $ref: '#/components/schemas/EngagementRun' } },
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    totalPages: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/metrics/runs/{runId}': {
      get: {
        tags: ['Metrics & Analytics'],
        summary: 'Get detailed run information with full request/response data',
        parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Run detail',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    run: { $ref: '#/components/schemas/RunDetail' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/metrics/failures': {
      get: {
        tags: ['Metrics & Analytics'],
        summary: 'Get failure analysis with categorized errors',
        parameters: [
          { name: 'siteId', in: 'query', schema: { type: 'string' } },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: {
          '200': {
            description: 'Failure analysis',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    analysis: { $ref: '#/components/schemas/FailureAnalysis' },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ============================================================
    // ANALYTICS (Legacy)
    // ============================================================
    '/analytics/overview': {
      get: {
        tags: ['Analytics'],
        summary: 'Dashboard overview statistics',
        responses: { '200': { description: 'Overview stats' } },
      },
    },
    '/analytics/runs-over-time': {
      get: {
        tags: ['Analytics'],
        summary: 'Runs over time',
        parameters: [{ name: 'days', in: 'query', schema: { type: 'integer', default: 30 } }],
        responses: { '200': { description: 'Time series data' } },
      },
    },
    '/analytics/by-type': {
      get: {
        tags: ['Analytics'],
        summary: 'Breakdown by engagement type',
        responses: { '200': { description: 'Type breakdown' } },
      },
    },
    '/analytics/site-performance': {
      get: {
        tags: ['Analytics'],
        summary: 'Site performance comparison',
        responses: { '200': { description: 'Site performance' } },
      },
    },
    '/analytics/recent-activity': {
      get: {
        tags: ['Analytics'],
        summary: 'Recent activity feed',
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }],
        responses: { '200': { description: 'Recent activity' } },
      },
    },
    '/analytics/audit-logs': {
      get: {
        tags: ['Analytics'],
        summary: 'Audit logs',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: { '200': { description: 'Audit logs' } },
      },
    },
  },
};
