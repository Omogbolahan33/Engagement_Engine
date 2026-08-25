import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  apiPrefix: '/api/v1',

  // Database
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/engagement_platform',
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production-use-64-chars-minimum-xxxxxxxxxxxxxxxx',
    accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    issuer: 'engagement-platform',
  },

  // Encryption (for credentials at rest)
  encryption: {
    key: process.env.ENCRYPTION_KEY || 'change-me-32-byte-key-for-aes-256!!',
    algorithm: 'aes-256-gcm',
    // Version new ciphertext is written with. Bump this (and move the outgoing
    // key into ENCRYPTION_KEYS) to rotate.
    keyVersion: parseInt(process.env.ENCRYPTION_KEY_VERSION || '1', 10),
    // Retired keys still needed to read old rows: {"1":"<old key>"}
    previousKeys: process.env.ENCRYPTION_KEYS || '',
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },

  // Worker
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
    maxRetries: parseInt(process.env.WORKER_MAX_RETRIES || '3', 10),
    retryDelayMs: parseInt(process.env.WORKER_RETRY_DELAY_MS || '5000', 10),
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
  },

  // Email (for notifications)
  email: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@engagement-platform.com',
  },

  // Security
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
    lockoutDurationMs: parseInt(process.env.LOCKOUT_DURATION_MS || '900000', 10),
    sessionExpiryMs: parseInt(process.env.SESSION_EXPIRY_MS || '86400000', 10),
  },

  // Puppeteer
  puppeteer: {
    headless: process.env.PUPPETEER_HEADLESS !== 'false',
    executablePath: process.env.PUPPETEER_EXECUTABLE || undefined,
    proxyServer: process.env.PUPPETEER_PROXY || undefined,
  },
} as const;

export type Config = typeof config;
