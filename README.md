# Engagement Platform

Production SaaS platform for multi-site engagement automation. Manage engagements across multiple platforms with configurable authentication, scheduling, rate limiting, and comprehensive analytics.

## Features

### Core Capabilities
- **Multi-Platform Support**: Twitter, Facebook, Instagram, LinkedIn, Reddit, YouTube, Discord, WordPress, Medium, StackOverflow, and 40+ more platforms
- **Engagement Types**: Likes, comments, shares, follows, posts, reviews, messages, scraping, and 30+ engagement types
- **Configurable Authentication**: 35+ auth types including OAuth2, API keys, session tokens, browser automation, SSO, LDAP, and more
- **Scheduling & Frequency Control**: Per-minute/hour/day/week limits with cooldown, jitter, and backoff strategies
- **Credential Encryption**: AES-256-GCM encryption for all stored credentials
- **Proxy Support**: HTTP, HTTPS, SOCKS4/5, residential, mobile, and datacenter proxies

### Management Portal
- **Dashboard**: Real-time overview of all engagements, success rates, and activity
- **Site Management**: Add, configure, and monitor target platforms
- **Engagement Builder**: Create and configure engagements with visual forms
- **Credential Manager**: Securely store and manage authentication credentials
- **Analytics**: Charts, performance metrics, and audit logs
- **Settings**: Profile, organization, API keys, and notification preferences

### Security
- JWT-based authentication with refresh tokens
- Role-based access control (Owner, Admin, Manager, Member, Viewer)
- API key authentication for programmatic access
- Rate limiting on all endpoints
- Audit logging for all actions
- Credential encryption at rest
- CSRF protection
- Security headers (Helmet.js)

### Architecture
- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + TypeScript + Tailwind CSS
- **Database**: PostgreSQL with Prisma ORM
- **Queue**: BullMQ with Redis
- **Deployment**: Docker + Nginx reverse proxy

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis 7+

### Development Setup

1. **Clone and install dependencies**:
```bash
cd engagement-platform
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

2. **Set up environment**:
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your database and Redis credentials
```

3. **Set up database**:
```bash
cd backend
npx prisma migrate dev
npx prisma db seed
cd ..
```

4. **Start development servers**:
```bash
npm run dev
```

This starts:
- Backend API at http://localhost:3001
- Frontend at http://localhost:3000

### Docker Setup

```bash
cd docker
cp ../backend/.env.example ../backend/.env
# Edit .env with production secrets
docker-compose up -d
```

## API Documentation

### Authentication
```bash
# Register
POST /api/v1/auth/register
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "organizationName": "My Company"
}

# Login
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

# Use token
Authorization: Bearer <access_token>

# Or use API key
X-API-Key: <api_key>
```

### Sites
```bash
# Create site
POST /api/v1/sites
{
  "name": "My Twitter",
  "url": "https://twitter.com",
  "platform": "TWITTER",
  "description": "Main Twitter account"
}

# List sites
GET /api/v1/sites

# Get site
GET /api/v1/sites/:id
```

### Engagements
```bash
# Create engagement
POST /api/v1/engagements
{
  "siteId": "uuid",
  "name": "Like trending posts",
  "engagementType": "LIKE",
  "targetConfig": { "postId": "123" },
  "frequency": {
    "maxPerMinute": 1,
    "maxPerHour": 10,
    "maxPerDay": 100
  }
}

# Activate engagement
POST /api/v1/engagements/:id/activate

# Execute now
POST /api/v1/engagements/:id/execute

# Schedule with cron
POST /api/v1/engagements/:id/schedule
{
  "cronExpression": "0 */2 * * *"
}
```

### Credentials
```bash
# Get auth type schemas
GET /api/v1/credentials/auth-schemas

# Create credential
POST /api/v1/credentials
{
  "siteId": "uuid",
  "name": "Production API Key",
  "authType": "API_KEY",
  "credentialData": {
    "apiKey": "your-secret-api-key"
  }
}
```

## Supported Auth Types

| Category | Types |
|----------|-------|
| Token-Based | API Key, Bearer Token, Session Token, JWT, Personal Access Token |
| OAuth 2.0 | Client Credentials, Authorization Code, Device Code |
| Username/Password | Basic Auth, Form Login, Digest Auth, NTLM, Kerberos |
| Cookie/Session | Cookie Auth, Session Cookie, CSRF + Session |
| Header-Based | Custom Header, HMAC Signature, Request Signing |
| Certificate | mTLS, Client Certificate (PFX) |
| Platform-Specific | Twitter OAuth1/2, Google, Facebook, GitHub App, Slack, Discord, Reddit, LinkedIn |
| Browser-Based | Puppeteer Login, Selenium Login, Browser Cookie Import |
| SSO | SAML, OIDC, LDAP |
| Custom | Custom Script, Multi-Step Auth |

## Supported Platforms

Social Media, Forums, Content Platforms, Q&A Sites, Review Sites, E-commerce, News, Messaging, and Custom API/Browser/Webhook integrations.

## License

Proprietary - All rights reserved
