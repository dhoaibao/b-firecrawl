<!-- b-init-managed:start -->
# Agent Instructions

## Repository Purpose

A Firecrawl Gateway — an Express.js + TypeScript API gateway that routes requests between externally hosted Firecrawl services and Firecrawl Cloud. Includes a React admin dashboard for monitoring, users, and virtual API keys. The repository deploys only the gateway; Firecrawl runtime services and PostgreSQL are external.

## Working Rules

- Make the smallest coherent change. Verify before claiming completion.
- Never expose secrets, API keys, session values, or internal URLs in outputs or public tools.
- Do not invent commands, paths, or release steps. Prefer repo facts over assumptions.
- Ask before broad refactors, dependency changes, migrations, destructive operations, commits, or PRs.
- Preserve the existing structure of `AGENTS.md` managed block and `CLAUDE.md` redirect shim.

## Verification Commands

Gateway backend (`gateway/`):

```bash
cd gateway
npm install
npm run typecheck
npm run build
npm run test
```

Admin UI (`gateway/admin-ui/`):

```bash
cd gateway/admin-ui
npm install
npm run lint
npm run build
```

Gateway deployment:

```bash
docker compose up -d --build
docker compose logs gateway
```

## Codebase Map

- `gateway/src/server.ts` — Express app setup, middleware stack, routes, shutdown
- `gateway/src/proxy.ts` — request proxying, fallback logic, API key handling
- `gateway/src/policy.ts` — cloud-vs-local routing policy
- `gateway/src/config.ts` — environment configuration
- `gateway/src/middleware.ts` — request ID, logging, rate limiting
- `gateway/src/audit-store.ts` — JSONL audit log read/write/purge
- `gateway/src/admin-api.ts` — admin-only audit/logs/data endpoints
- `gateway/src/auth/{session,passport,middleware,routes}.ts` — session auth and guards
- `gateway/src/users/{service,routes}.ts` — user management
- `gateway/src/api-keys/{service,routes}.ts` — virtual API key management
- `gateway/src/settings/{service,routes}.ts` — routing policy and inactivity settings
- `gateway/src/jobs/index.ts` — background jobs (auto-suspend, auto-revoke)
- `gateway/src/db/{index,bootstrap}.ts` — PostgreSQL pool and schema bootstrap
- `gateway/src/utils.ts` — shared helpers and utilities
- `gateway/admin-ui/src/` — React admin dashboard (basename `/admin`)
- `docker-compose.yaml` — gateway-only deployment with local image build
- `docker-compose.prebuilt.yaml` — gateway-only deployment using published `dhoaibao/firecrawl-gateway:latest` image
- `.env.example` — environment variables
- `.github/workflows/deploy.yml` — deployment workflow (currently disabled by job guards)
- `README.md` — project overview and quick start
- `QUICKSTART.md` — no-clone pre-built image guide
- `SELF_HOST.md` — deployment guide
- `docs/DESIGN.md` — Admin UI design standard

## Safety / Do-Not-Assume

- The container listens on `PORT=8080`; Compose maps host `GATEWAY_PORT` (default 8080) to it. The external Firecrawl URL is configured in the Admin UI; `DATABASE_URL` must point to an externally managed service.
- The admin UI is served under `/admin`; the admin API is under `/admin/api/*`.
- Auth is enabled by default (`AUTH_ENABLED=true`). API requests need `Authorization: Bearer <virtual-key>`; admin UI uses session login.
- Virtual API keys are SHA-256 hashed, `fc_` prefixed, and shown only once on creation.
- Routing defaults start cloud-first; live values are stored in the database via the admin UI.
- Cloud-only features include `agent`, `browser`, `monitor`, `research`, `scrape/*/interact`, `search/*/feedback`, `actions`, screenshot/branding/changeTracking formats, and `proxy: stealth|enhanced`.
- `gateway/dist/` and `gateway/admin-ui/dist/` are build outputs; source edits must go through build steps.
- Schema migrations in `gateway/src/db/schema.sql` use `IF NOT EXISTS` and are applied automatically on startup.
- Tests use Vitest and live next to the files they test (e.g., `*.test.ts`).

## Maintainer Guide

- Edit source, not build outputs. `npm run build` copies `src/db/schema.sql` into `dist/db/schema.sql`.
- Node 22+ is required; TypeScript strict mode is enabled.
- Keep `CLAUDE.md` as a thin redirect to `AGENTS.md`; put repo guidance here.
- Deployment configuration lives in `.github/workflows/deploy.yml`, but both jobs are currently guarded with `if: ${{ false }}`.

## Source-of-Truth Files

- `AGENTS.md` (this file) — canonical agent instructions
- `CLAUDE.md` — redirect shim only
- `gateway/package.json` — backend scripts and dependencies
- `gateway/admin-ui/package.json` — frontend scripts and dependencies
- `gateway/src/db/schema.sql` — database schema
- `.env.example` — environment variable reference
- `docs/DESIGN.md` — Admin UI design standard
- `README.md` and `QUICKSTART.md` — user-facing documentation
<!-- b-init-managed:end -->
