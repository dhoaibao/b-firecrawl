# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Hybrid Firecrawl Gateway** — an Express.js + TypeScript API gateway that routes Firecrawl API requests between a local self-hosted instance and Firecrawl Cloud. It includes a React admin dashboard for monitoring, user management, and virtual API key management.

The project is deployed as a Docker Compose stack alongside official Firecrawl container images.

## Commands

### Gateway Backend (`gateway/`)

```bash
cd gateway
npm install          # Install dependencies
npm run build        # Compile TypeScript (output to dist/)
npm run dev          # Run with ts-node (development)
npm start            # Run compiled output (production)
npm run typecheck    # Type check without emitting
```

### Admin UI (`gateway/admin-ui/`)

```bash
cd gateway/admin-ui
npm install          # Install dependencies
npm run dev          # Start Vite dev server
npm run build        # Build for production (output to dist/)
npm run lint         # Run ESLint
```

### Docker / Full Stack

```bash
# Start everything (builds gateway from source)
docker compose up -d --build

# Rebuild only gateway after code changes
docker compose up -d --build gateway

# Restart gateway without rebuild
docker compose restart gateway

# Use pre-built image (no clone/build needed)
docker compose -f docker-compose.prebuilt.yaml up -d

# View logs
docker compose logs gateway
docker compose logs api
```

## Architecture

### High-Level Request Flow

```
Client → Hybrid Gateway → local Firecrawl OR Firecrawl Cloud
                               ↑
                    fallback on eligible failures
```

The gateway listens on port 8080 and proxies `/v1/*` and `/v2/*` requests to either the local Firecrawl instance (port 3002) or Firecrawl Cloud (`api.firecrawl.dev`). The decision is driven by **routing policy** (`gateway/src/policy.ts`), not simple URL matching.

### Routing Modes

Set globally via `DEFAULT_ROUTE_MODE` env var as the initial seed, or override per-request via `X-Firecrawl-Route-Mode` header. The live default is managed in the Admin UI (Configure page) and stored in the database; the env var is only used when no Admin UI value has been saved.

- **`local-first`** (default): Try local first; fallback to Cloud on eligible failures
- **`local-only`**: Never route to Cloud
- **`cloud-first`**: Always route to Cloud

### Routing Policy (`gateway/src/policy.ts`)

The policy engine inspects both the request path and the JSON body to decide if a request **requires** Firecrawl Cloud:

**Always cloud-only** (path patterns):
- `/v*/agent/*`, `/v*/browser/*`, `/v*/monitor/*`, `/v*/research/*`
- `/v*/scrape/*/interact`, `/v*/search/*/feedback`

**Always cloud-only** (body inspection):
- `actions` array present
- `agent` field present
- `formats` containing `screenshot`, `branding`, or `changeTracking`
- `proxy` set to `stealth` or `enhanced`

**Fallback eligibility** (`isFallbackEligible`): Network errors, 5xx responses, or 4xx responses whose body contains keywords like "fire-engine", "not configured", "unsupported", "actions", "screenshot", or "branding".

**Fallback is blocked** when: route mode is `local-only`, request has sensitive headers (`Authorization`, `Cookie`, tokens, secrets), or target URL is private/local (localhost, 127.x, 10.x, 192.168.x, etc.).

### Proxy Handler (`gateway/src/proxy.ts`)

The core proxy logic:

1. Validates the virtual API key (if auth is enabled) against the database
2. Reads and inspects the request body (max 5MB)
3. Determines the initial backend via policy
4. Proxies the request using `fetch()` with an AbortController timeout (default 120s)
5. If local fails and fallback is allowed/eligible, retries against Cloud
6. Writes an audit entry and returns the response with `x-hybrid-firecrawl-*` headers

The virtual API key is stripped before forwarding to local; only the Cloud backend receives the real Firecrawl API key configured in Settings.

### Authentication System

The gateway has two auth modes controlled by `AUTH_ENABLED`:

- **Enabled** (default): API requests require a `Authorization: Bearer <virtual-key>` header. The admin UI requires login via Passport.js local strategy with session-based auth (stored in PostgreSQL via `connect-pg-simple`).
- **Disabled** (`AUTH_ENABLED=false`): Transparent proxy with no authentication.

**User model** (`users` table): `id`, `email`, `name`, `password_hash`, `is_admin`, `status` (`active`/`suspended`/`blocked`), `suspended_until`. Suspensions auto-reactivate when the period expires.

**Virtual API keys** (`api_keys` table): SHA-256 hashed, `fc_` prefix, plain key shown only once on creation. Key owners can only manage their own keys. Admin users can manage all users and keys.

**Admin user bootstrapping**: If `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set, an admin user is auto-created on first boot via `bcrypt` hashing.

### Database (`gateway/src/db/`)

PostgreSQL via `pg` pool. Schema is defined in `schema.sql` and auto-applied on startup via `runMigrations()`. The schema uses `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` for lightweight forward migrations. Tables: `users`, `api_keys`, `sessions` (managed by connect-pg-simple).

### Audit Logging (`gateway/src/audit-store.ts`)

JSONL file at `GATEWAY_LOG_FILE` (default `/data/hybrid-firecrawl-requests.jsonl`). Stores metadata only — no request/response bodies. Entries include: method, path, route mode, backend used, fallback info, status code, duration, target URL, user ID. Admin API exposes `/admin/api/logs` and `/admin/api/data` for querying.

### Admin UI (`gateway/admin-ui/`)

React 19 + Vite + Tailwind CSS 4 + shadcn/ui components. Router basename is `/admin`.

Pages:
- `/` — Dashboard with metrics, charts, request logs
- `/login` — Admin login
- `/users` — User management (admin only)
- `/api-keys` — API key management (any authenticated user)

The UI is served as a static SPA from `gateway/admin-ui/dist/` via Express static middleware with a fallback to `index.html`.

### Dockerfile

Multi-stage build:
1. **admin-builder**: Builds the React admin UI
2. **gateway-builder**: Compiles TypeScript gateway
3. **runtime**: Copies built artifacts, installs production deps, runs `dist/server.js`

### CI/CD (`.github/workflows/deploy.yml`)

Two-job workflow triggered on push to `main` (when `gateway/`, `docker-compose.prebuilt.yaml`, or the workflow itself changes):

1. **build**: Builds and pushes `dhoaibao/firecrawl-gateway:latest` to Docker Hub
2. **deploy**: SSHs to a Hetzner server, copies `docker-compose.prebuilt.yaml`, writes secrets to `.env`, and runs `docker compose up -d`

## Key Files

| File | Purpose |
|------|---------|
| `gateway/src/server.ts` | Express app setup, middleware stack, route registration, graceful shutdown |
| `gateway/src/proxy.ts` | Core request proxying, fallback logic, API key validation |
| `gateway/src/policy.ts` | Routing policy: cloud-vs-local decision, fallback eligibility |
| `gateway/src/config.ts` | Environment-based configuration |
| `gateway/src/middleware.ts` | Request logger and in-memory rate limiter (300 req/min/IP) |
| `gateway/src/audit-store.ts` | JSONL audit log read/write |
| `gateway/src/auth/` | Passport local strategy, session middleware, auth routes |
| `gateway/src/api-keys/` | Virtual API key CRUD and validation |
| `gateway/src/users/` | User CRUD, suspend/block/activate, access checking |
| `gateway/src/db/` | PostgreSQL pool, schema, migrations |
| `gateway/admin-ui/src/App.tsx` | React router and auth guards |
| `docker-compose.yaml` | Full stack with local gateway build |
| `docker-compose.prebuilt.yaml` | Stack using published gateway image |
| `.env.example` | All environment variables |

## Important Notes

- The `gateway/dist/` directory is **committed to git** — it contains the compiled TypeScript output.
- The gateway runs on **Node 22+**.
- TypeScript `strict` mode is enabled.
- The `BCRYPT_ROUNDS` env var controls password hashing cost (default 12).
- Graceful shutdown handles SIGTERM/SIGINT with a 10s connection drain and 15s hard timeout.
