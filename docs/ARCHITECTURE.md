# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Nginx Reverse Proxy                       │
│                    (Rate Limiting, SSL, Headers)                  │
└───────────────┬─────────────────────────────┬───────────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────┐     ┌───────────────────────────┐
│   Frontend (React)    │     │    Backend API (Express)   │
│   - Dashboard         │     │    - Auth (JWT + API Key)  │
│   - Site Management   │     │    - CRUD Operations       │
│   - Engagement Builder│◄───►│    - Validation (Zod)      │
│   - Credentials       │     │    - Rate Limiting         │
│   - Analytics         │     │    - Audit Logging         │
│   - Settings          │     └──────────┬────────────────┘
└───────────────────────┘                │
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
          ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
          │  PostgreSQL   │    │    Redis      │    │  BullMQ      │
          │  - Users      │    │  - Sessions   │    │  - Job Queue │
          │  - Sites      │    │  - Rate Limits│    │  - Scheduling│
          │  - Engagements│    │  - Cache      │    │  - Retries   │
          │  - Credentials│    └──────────────┘    └──────┬───────┘
          │  - Audit Logs │                               │
          └──────────────┘                               ▼
                                                ┌──────────────┐
                                                │   Workers     │
                                                │  - Executor   │
                                                │  - Scheduler  │
                                                │  - Retries    │
                                                └──────┬───────┘
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │ Target Sites  │
                                                │ - APIs        │
                                                │ - Browser     │
                                                │ - Webhooks    │
                                                └──────────────┘
```

## Data Model

### Core Entities

1. **Organization** - Multi-tenant boundary
2. **User** - Platform users with roles
3. **Site** - Target platforms (Twitter, Reddit, etc.)
4. **Credential** - Encrypted auth credentials per site
5. **Engagement** - Configured engagement automation
6. **EngagementRun** - Individual execution record
7. **EngagementLog** - Execution logs
8. **ProxyConfig** - Proxy configurations per site
9. **AnalyticsSnapshot** - Aggregated metrics
10. **AuditLog** - Security audit trail

### Relationships

```
Organization 1──N User
Organization 1──N Site
Organization 1──N ApiKey
Site 1──N Credential
Site 1──N Engagement
Site 1──N ProxyConfig
Engagement 1──N EngagementRun
Engagement 1──N EngagementLog
EngagementRun N──1 Credential (optional)
```

## Security Architecture

### Authentication Flow

```
Client ──► POST /auth/login ──► Validate Credentials
                                      │
                                      ▼
                              Create Session (DB)
                              Generate JWT (Access + Refresh)
                                      │
                                      ▼
                              Return Tokens ──► Client
                                      │
                                      ▼
                              Subsequent Requests:
                              Authorization: Bearer <access_token>
                                      │
                                      ▼
                              Verify JWT ──► Check Session ──► Allow/Deny
```

### Credential Storage

```
User Input (plaintext)
        │
        ▼
AES-256-GCM Encryption
        │
        ▼
Base64(IV + AuthTag + Ciphertext)
        │
        ▼
PostgreSQL (encrypted at rest)
```

### API Key Flow

```
Generate: random(32 bytes) ──► SHA-256 Hash ──► Store Hash
Return: prefix_randomkey (shown once)

Verify: X-API-Key header ──► SHA-256 ──► Lookup Hash ──► Allow/Deny
```

## Execution Engine

### Job Processing Pipeline

```
1. User creates Engagement
2. Engagement queued to BullMQ
3. Worker picks up job
4. Check engagement status (active? expired?)
5. Load credentials (decrypt)
6. Build auth headers (per auth type)
7. Build API request (per engagement type)
8. Execute HTTP request to target
9. Handle response (success/retry/block)
10. Log result (EngagementRun + EngagementLog)
11. Update analytics
```

### Rate Limiting Strategy

- **Platform-level**: Global API rate limits (Nginx + Express)
- **Per-site**: Configurable per-site limits
- **Per-engagement**: maxPerMinute/Hour/Day/Week
- **Cooldown**: Minimum time between executions
- **Jitter**: Random delay to appear human
- **Backoff**: LINEAR/EXPONENTIAL/FIBONACCI on failures

### Retry Strategy

```
Attempt 1 ──► Fail ──► Wait (backoff delay)
Attempt 2 ──► Fail ──► Wait (backoff delay * 2)
Attempt 3 ──► Fail ──► Mark as FAILED
                      ──► Notify user
```

## Deployment

### Production Stack

- **Container Runtime**: Docker + Docker Compose
- **Reverse Proxy**: Nginx (SSL termination, rate limiting)
- **Database**: PostgreSQL 16 (managed or self-hosted)
- **Cache/Queue**: Redis 7 (managed or self-hosted)
- **Monitoring**: Winston logs + optional Grafana/Prometheus

### Scaling

- **Horizontal**: Add more worker containers
- **Vertical**: Increase worker concurrency
- **Database**: Read replicas for analytics
- **Redis**: Redis Cluster for high availability
