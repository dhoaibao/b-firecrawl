<!-- b-init-managed:start -->
# Agent Instructions

## Repository Purpose

This repository ships an Express.js + TypeScript gateway and React admin dashboard for routing requests between an externally hosted Firecrawl instance and Firecrawl Cloud. It does not deploy Firecrawl runtime services or PostgreSQL.

## Working Rules

- Make the smallest coherent change and verify it before claiming completion.
- Edit source files, not build outputs; preserve unrelated working-tree changes.
- Prefer repo evidence over assumptions and do not invent commands, paths, or release steps.
- Never expose secrets, API keys, session values, customer data, or internal URLs.
- Ask before dependency changes, schema migrations, destructive commands, long-lived services, commits, or PRs.
- Keep `AGENTS.md` canonical and `CLAUDE.md` as its minimal redirect shim.

## Verification Commands

Backend (`gateway/`):

```bash
cd gateway
npm run typecheck
npm run build
npm run test
```

Admin UI (`gateway/admin-ui/`):

```bash
cd gateway/admin-ui
npm run lint
npm run build
```

## Codebase Map

- `gateway/src/server.ts` — Express setup, middleware, routes, health checks, and shutdown
- `gateway/src/proxy.ts` — upstream proxying, API-key handling, fallback, and audit records
- `gateway/src/policy.ts` — route-mode and cloud-requirement decisions
- `gateway/src/config.ts` — environment configuration and validation
- `gateway/src/admin-api.ts` — admin audit/log/data endpoints
- `gateway/src/auth/` — session, Passport, login, and authorization middleware
- `gateway/src/users/`, `gateway/src/api-keys/`, `gateway/src/settings/` — admin services and routes
- `gateway/src/db/` — PostgreSQL pool, bootstrap, and schema
- `gateway/src/audit-store.ts`, `middleware.ts`, `jobs/`, `utils.ts` — logging, request middleware, background jobs, and shared helpers
- `gateway/admin-ui/src/` — React dashboard served under `/admin`
- `gateway/Dockerfile` — multi-stage admin UI and gateway image build
- `docker-compose.yaml` / `docker-compose.prebuilt.yaml` — local-build and published-image deployments
- `README.md`, `QUICKSTART.md`, `SELF_HOST.md` — user-facing setup and deployment guides
- `docs/DESIGN.md` — admin UI design standard

## Safety / Do-Not-Assume

- Compose runs the container on port `8080` and maps host `GATEWAY_PORT` (default `8080`); the external Firecrawl URL is configured in the admin UI.
- `DATABASE_URL` must point to an externally managed PostgreSQL service. Startup applies `gateway/src/db/schema.sql`.
- The admin UI is at `/admin`; admin endpoints are under `/admin/api/*`. Authentication is enabled by default, with virtual API keys for API requests and sessions for the dashboard.
- Virtual API keys are `fc_`-prefixed; SHA-256 hashes are stored for validation and the plaintext key is returned only at creation. Keep `.env` and other credential-bearing files out of output and commits.
- Routing defaults to cloud-first; live routing and inactivity settings are stored in PostgreSQL.
- `gateway/dist/` and `gateway/admin-ui/dist/` are generated outputs. Backend tests use Vitest and live beside the source files as `*.test.ts`.

## Maintainer Guide

- Node `>=22` is required. Backend TypeScript is strict; the admin UI uses Vite, Tailwind CSS, and ESLint.
- `cd gateway && npm run build` also copies `src/db/schema.sql` into `dist/db/schema.sql`; update the source schema, not the copied output.
- The deployment workflow in `.github/workflows/deploy.yml` is currently disabled by `if: ${{ false }}` guards.

## Source-of-Truth Files

- `AGENTS.md` — canonical agent instructions
- `CLAUDE.md` — redirect shim only
- `gateway/package.json` and `gateway/admin-ui/package.json` — scripts and dependencies
- `gateway/src/config.ts`, `gateway/src/policy.ts` — configuration and routing behavior
- `gateway/src/db/schema.sql` — database schema
- `.env.example` — environment reference
- `docs/DESIGN.md` — admin UI design rules
- `README.md`, `QUICKSTART.md`, and `SELF_HOST.md` — user-facing documentation
<!-- b-init-managed:end -->
