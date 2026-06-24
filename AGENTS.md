<!-- b-init-managed:start -->
# Agent Instructions

## Repository Purpose

A Hybrid Firecrawl Gateway — an Express.js + TypeScript API gateway that routes Firecrawl API requests between a local self-hosted instance and Firecrawl Cloud. Includes a React admin dashboard for monitoring, users, and virtual API keys. Deployed as a Docker Compose stack with official Firecrawl images.

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

Full stack:

```bash
docker compose up -d --build
docker compose logs gateway
```

## Codebase Map

- `gateway/src/server.ts` — Express app, middleware, routes, shutdown
- `gateway/src/proxy.ts` — request proxying, fallback logic, API key handling
- `gateway/src/policy.ts` — cloud-vs-local routing policy
- `gateway/src/config.ts` — environment configuration
- `gateway/src/middleware.ts` — logging, rate limiting
- `gateway/src/audit-store.ts` — JSONL audit log
- `gateway/src/auth/`, `api-keys/`, `users/`, `db/` — auth, keys, users, DB
- `gateway/admin-ui/src/` — React admin dashboard
- `docker-compose.yaml` — full stack with local gateway build
- `docker-compose.prebuilt.yaml` — stack using published image
- `.env.example` — environment variables
- `README.md` — project overview and quick start
- `QUICKSTART.md` — no-clone pre-built image guide
- `SELF_HOST.md` — deployment guide
- `docs/DESIGN.md` — Admin UI design standard

## Safety / Do-Not-Assume

- The gateway listens on `GATEWAY_PORT` (default 8080). Direct local Firecrawl API is on port 3002.
- Auth is enabled by default (`AUTH_ENABLED=true`). API requests need `Authorization: Bearer <virtual-key>`; admin UI uses session login.
- Virtual API keys are SHA-256 hashed, `fc_` prefixed, and shown only once on creation.
- Routing mode defaults are seeded from `DEFAULT_ROUTE_MODE` but live values are stored in the database via the admin UI.
- Cloud-only features include `agent`, `browser`, `monitor`, `research`, `scrape/*/interact`, `search/*/feedback`, `actions`, screenshot/branding/changeTracking formats, and `proxy: stealth|enhanced`.
- `gateway/dist/` and `gateway/admin-ui/dist/` are build outputs; source edits must go through build steps.
- Schema migrations in `gateway/src/db/schema.sql` use `IF NOT EXISTS` and are applied automatically on startup.

## Maintainer Guide

- Edit source, not build outputs. `npm run build` copies `src/db/schema.sql` into `dist/db/schema.sql`.
- Node 22+ is required; TypeScript strict mode is enabled.
- Keep `CLAUDE.md` as a thin redirect to `AGENTS.md`; put repo guidance here.
- CI/CD lives in `.github/workflows/deploy.yml` and builds/pushes `dhoaibao/firecrawl-gateway:latest`.

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
