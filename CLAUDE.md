# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

The tree builds, typechecks, lints, and tests clean. Verify with `npm run typecheck`,
`npm run lint`, `npm test`, `npm run build`.

Things worth knowing that are not obvious from the code:

- **`backend/prisma/migrations/` is gitignored**, so there are no committed migrations.
  After schema changes run `npm run db:migrate` locally.
- **`prisma generate` must succeed before `tsc` will typecheck the backend** — most of
  the type surface comes from the generated client, so a schema error presents as a
  hundred unrelated "has no exported member" errors.
- **`shared/types/index.ts` is dead.** The `@shared/*` alias exists but nothing imports
  it; backend and frontend each declare their own types.
- **Lint reports ~45 warnings**, all unused imports left over from the original
  scaffold. They are warnings by design; zero errors is the bar.

## Running the whole system

Three backend processes, not one:

| Process | Command | Without it |
|---|---|---|
| API | `npm run dev:backend` | nothing serves HTTP |
| Workers | `cd backend && npm run worker` | engagements queue but never execute |
| Scheduler | `cd backend && npm run cron` | webhook retries, session cleanup, credential refresh, and retention never run |

`npm run dev` starts only the API and frontend. The worker and scheduler are separate
because they have different scaling rules: workers scale horizontally, the scheduler
must be a single instance or its sweeps double-run.

## Commands

Run from the repo root unless noted.

```bash
npm run dev                # backend (3001) + frontend (3000) via concurrently
npm run build              # backend tsc, then frontend tsc + vite build
npm run typecheck          # both halves, no emit
npm run lint               # eslint 9 flat config (eslint.config.js) over both halves
npm test                   # backend jest
npm run db:migrate         # cd backend && npx prisma migrate dev
npm run db:seed            # cd backend && npx prisma db seed
npm run docker:up          # docker/docker-compose.yml -d
```

Backend-only (from `backend/`):

```bash
npm run dev                # tsx watch src/index.ts
npm run worker             # BullMQ workers — required for engagements to execute
npx prisma generate        # must succeed before tsc will typecheck
npx tsc --noEmit           # typecheck without emitting
```

First-time setup: `scripts/setup.sh` (checks node/npm/psql/redis-cli, installs both workspaces, copies `.env`, generates Prisma client). `frontend/` needs `npm install` separately — the root `package.json` has no workspaces config, so root `npm install` only installs `concurrently`.

There is no working single-test command yet; adding one means creating a jest config in `backend/` first (`ts-jest` preset, `roots: ['<rootDir>/src']`), after which `npx jest path/to/file.test.ts -t "name"` applies.

## Architecture

Two-process backend over shared PostgreSQL + Redis:

- **API** (`backend/src/index.ts`) — Express, serves `/api/v1/*`. Enqueues work; never executes engagements inline except via the explicit `POST /engagements/:id/execute` path.
- **Workers** (`backend/src/workers/index.ts`) — BullMQ consumers for the `engagement-execution` and `engagement-scheduled` queues. Without this process running, engagements queue but never fire.

### Controllers *are* routers

There is no `routes/` directory. Each file in `backend/src/controllers/` builds its own `express.Router()`, applies `router.use(authenticate)` at the top, defines Zod schemas inline, and `export default router`. `index.ts` mounts them under `${config.apiPrefix}/<name>`. To add an endpoint group: create the controller, then add the import + `app.use()` pair in `index.ts`.

A handful of endpoints (`/system/circuit-breakers`, `/ai/usage`, `/ai/pricing`, `/ai/budget`, `/engagements/:id/guard`) are defined inline in `index.ts` with dynamic `await import()` of their service, bypassing the controller pattern. `/engagements/:id/guard` is registered *after* the engagements router is mounted, so the router wins for that path shape unless it declines.

### Request pipeline

`helmet → cors → compression → morgan → correlationId → rateLimiter (global) → orgRateLimiter (per-org) → idempotency (mutating requests) → routers → errorHandler`.

Auth ([middleware/auth.ts](backend/src/middleware/auth.ts)) accepts two credentials on the same middleware: `X-API-Key` short-circuits to `authenticateApiKey` (SHA-256 hash lookup); otherwise a `Bearer` JWT is verified *and* its `sessionId` is looked up in the `UserSession` table — so JWT validity alone is not sufficient, sessions are revocable server-side. Handlers read `req.user!.organizationId` and pass it into every service call; **org scoping is enforced in the service layer, not by a global filter** — a service method that forgets its `organizationId` argument is a tenant-isolation leak.

Authorization helpers are `authorize(...roles)` and `requirePermission(...perms)` from the same module.

### Execution path

`enqueueEngagement()` ([queue.service.ts](backend/src/services/queue.service.ts)) deduplicates via a `job:dedupe:<engagementId>` Redis key before adding to the queue, then a worker calls `executorService.execute(context)`:

1. Load `Site`; decrypt the `Credential` if one is attached.
2. `buildAuthHeaders()` switches over ~35 `AuthType` enum values to produce request headers — this switch is the extension point for new auth types, alongside the enum in `schema.prisma` and the schema registry in `credential.service.ts`.
3. Wrap the call in a per-hostname circuit breaker (`getCircuitBreaker('site:<hostname>')`, 10 failures / 120s reset).
4. `executeByType()` dispatches on `EngagementType` to build the actual HTTP request.
5. `engagementGuard.recordResult()` then `logRun()` write an `EngagementRun` + `EngagementLog`.

Four independent throttles stack, and they are *not* the same mechanism — check which one you are changing:

| Layer | Where | Backed by |
|---|---|---|
| Global HTTP | `middleware/rateLimiter.ts` | express-rate-limit |
| Per-organization | `middleware/org-rate-limiter.ts` | Redis |
| Per-engagement frequency | `services/rate-limit.service.ts` | Redis sliding window (minute/hour/day/week/total + cooldown + jitter) |
| Failure circuit | `utils/circuit-breaker.ts` | in-process, per target hostname |

`engagement-guard.service.ts` sits on top of those: auto-pauses an engagement after 5 consecutive failures in a 60-minute window, detects credential expiry and platform blocks, and dedupes content within 24h.

### Credentials

Plaintext never leaves the service layer. [utils/encryption.ts](backend/src/utils/encryption.ts) does AES-256-GCM and stores `base64(JSON{iv, tag, data})`. The key is derived by truncating `ENCRYPTION_KEY` to its first 32 **bytes as UTF-8** — a key with multi-byte characters silently yields a different key than intended, and changing `ENCRYPTION_KEY` renders every stored credential undecryptable.

`GET /credentials/auth-schemas` drives the frontend's dynamic credential forms: the backend describes each auth type's required fields and the UI renders from that, so adding an auth type requires no frontend form work.

### Frontend

Vite + React 18. All pages are `lazy()`-loaded in [App.tsx](frontend/src/App.tsx) behind a single `ProtectedRoute` that checks `useAuthStore().isAuthenticated`. Server state is TanStack Query; auth state is Zustand persisted to `localStorage` under the key `auth-storage`.

[services/api.ts](frontend/src/services/api.ts) is the only axios instance. Note it reads the token by `JSON.parse`ing the raw `auth-storage` localStorage entry rather than calling the store — the persisted shape `{ state: { accessToken, refreshToken } }` is a hard contract between these two files, and its 401 interceptor writes refreshed tokens straight back into localStorage, bypassing the store. Changing `partialize` in [authStore.ts](frontend/src/store/authStore.ts) breaks the interceptor.

Dev requests go to a relative `/api/v1` and are proxied to `localhost:3001` by [vite.config.ts](frontend/vite.config.ts); in Docker, nginx does the same job.

`frontend/src/components/` contains only `common/` (Layout, ErrorBoundary) — page-specific UI currently lives inline in the page files.

## Security subsystems

**Two-factor.** Login is two-legged when `mfaEnabled` is set: `POST /auth/login` returns
`{ mfaRequired, mfaToken }` and mints no session; `POST /auth/login/2fa` exchanges that
challenge plus a TOTP or backup code for real tokens. The challenge lives in Redis under
`mfa:pending:<hash>` for 5 minutes and is burned after 5 wrong guesses. Backup codes are
hashed into `user.mfaBackupCodes` and are single-use. Anything that adds a login path must
go through `authService.issueSession`, or it will bypass 2FA.

**Sessions.** Revocation is a soft delete (`revokedAt`), so the auth middleware can answer
"revoked" rather than "unknown session"; `cleanExpiredSessions` hard-deletes later.
`lastActiveAt` is refreshed at most once per minute per session (`ACTIVITY_WRITE_INTERVAL_MS`)
to avoid a write per request. `req.sessionId` identifies the caller's own session — pass it,
not `req.user.id`, to anything that takes a session id.

**Encryption key rotation.** Ciphertext is a versioned envelope (`{iv, tag, data, v}`).
`ENCRYPTION_KEY` + `ENCRYPTION_KEY_VERSION` write; `ENCRYPTION_KEYS` (a JSON version→key
map) keeps retired keys readable. Rotate by adding the new key at a higher version, then
`POST /security/rotate-keys` until `remaining` is 0, then dropping the old key —
`POST /security/verify-keys` confirms it is safe to drop. **Version 1 uses the original
weak derivation** (truncate the passphrase to 32 UTF-8 bytes) because data already at rest
depends on it; version 2+ hashes, accepting any passphrase length. Every write path that
produces ciphertext must also stamp `keyVersion`, or the rotation sweep treats the row as
permanently stale.

**Webhooks.** Each event becomes a `WebhookDelivery` row before the first attempt, so a
delivery survives a crash. Failures back off exponentially with jitter (30s base, 1h cap,
6 attempts); 4xx other than 408/429 is treated as permanent and not retried. The scheduler's
minute sweep (`processDueRetries`) is what actually drives retries — without the cron
process, a failed delivery is only ever attempted once.

**Realtime.** SSE, not WebSocket, since every event is server→client. Events publish
through Redis pub/sub (`realtime:events`) so a worker-raised event reaches clients on any
API instance. `EventSource` cannot set headers, so `/events/stream` also accepts
`?token=`. nginx needs `proxy_buffering off` on that route or events arrive in batches.

## Frontend architecture notes

**Theming.** The `dark-*` Tailwind scale resolves to CSS variables defined in `index.css`,
so a theme is a variable swap and every existing `bg-dark-900` adapts without edits. The
scale is named for dark mode — low numbers are text, high numbers are surfaces — and light
mode inverts that. `initTheme()` runs before render to avoid a flash of the wrong palette.

**Loading and errors.** `Skeleton.tsx` provides shape-matched placeholders; `ErrorState`
renders a failure with a retry button. The query client retries transient failures three
times with backoff but never retries a 4xx other than 408/429 — those fail identically
every time.

**Long lists.** `VirtualTable` windows rows only past `VIRTUALIZE_THRESHOLD` (100),
using spacer `<tr>`s rather than a wrapper div so table semantics survive. Row height is
fixed and must match what `renderRow` renders.

## Conventions

- Services are classes exported as a pre-instantiated singleton at the bottom of the file (`export const siteService = new SiteService()`); controllers import the singleton, never the class.
- Logging is `createContextLogger('<scope>')` from `utils/logger`, not raw `winston`.
- Validation is Zod at the controller boundary via `validate(schema)` (joi is in `package.json` but unused).
- Controllers wrap each handler in try/catch and respond `res.status(error.statusCode || 500)`, so services throw errors carrying a `statusCode`. The `errorHandler` middleware is a last resort, not the primary path.
- User-supplied outbound URLs go through `utils/ssrf-protection.ts` — currently applied in `site-health.service.ts` and `webhook.service.ts`; anything new that fetches a user-controlled URL should use it too.

`docs/ARCHITECTURE.md` has the system diagram and data-model relationships; `docs/DEPLOYMENT.md` covers the Docker stack. The API surface is also summarized at runtime by `GET /api/v1/docs` and as OpenAPI at `GET /api/v1/docs/openapi.json` ([src/docs/openapi.ts](backend/src/docs/openapi.ts)) — both are hand-maintained and already drift from the mounted routes.
