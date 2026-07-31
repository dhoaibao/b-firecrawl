<!-- b-init-managed:start -->
# Agent Instructions

## Repository Purpose

This repository ships an Express.js + TypeScript gateway and React admin dashboard in front of externally hosted Firecrawl services. It does not host Firecrawl runtime services or PostgreSQL.

## Working Rules

- Make the smallest coherent change and verify it before claiming completion.
- Edit source files, not generated outputs; preserve unrelated working-tree changes.
- Prefer repository evidence over assumptions and do not invent commands, paths, or release steps.
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
- `gateway/src/policy.ts` — route-mode and Cloud-requirement decisions
- `gateway/src/config.ts` — environment configuration and validation
- `gateway/src/auth/`, `gateway/src/users/`, `gateway/src/api-keys/`, and `gateway/src/settings/` — dashboard authentication and administration
- `gateway/src/db/` — PostgreSQL pool, bootstrap, and schema/migrations
- `gateway/src/audit-store.ts`, `middleware.ts`, `jobs/`, and `utils.ts` — audit persistence, request middleware, background jobs, and shared helpers
- `gateway/admin-ui/src/` — React dashboard served under `/admin`
- `gateway/Dockerfile` — multi-stage admin UI and gateway image build
- `docker-compose.yaml` / `docker-compose.prebuilt.yaml` — source-build and published-image deployments
- `README.md`, `QUICKSTART.md`, `SELF_HOST.md`, and `docs/DESIGN.md` — project and admin UI guidance

## Safety / Do-Not-Assume

- Compose runs the gateway on container port `8080`; `GATEWAY_PORT` controls the host mapping.
- Firecrawl and PostgreSQL are external deployment prerequisites. The external Firecrawl URL is configured in the Admin UI; `DATABASE_URL` points to externally managed PostgreSQL.
- Startup applies `gateway/src/db/schema.sql`, which includes lightweight migrations. Update the source schema, not a copied build output.
- The admin UI is at `/admin` when authentication is enabled; admin endpoints are under `/admin/api/*`.
- Virtual API keys are `fc_`-prefixed, stored as hashes with encrypted key values, and their plaintext is returned only at creation. Keep `.env` and credential-bearing files out of output and commits.
- Routing defaults to `cloud-first`; supported modes and inactivity settings are stored in PostgreSQL. Sensitive headers/cookies and private target URLs restrict fallback.
- `gateway/dist/` and `gateway/admin-ui/dist/` are generated outputs. Backend tests use Vitest and live beside source files as `*.test.ts`.

## Maintainer Guide

- Node `>=22` is required. Backend TypeScript is strict; the admin UI uses Vite, Tailwind CSS, and ESLint.
- `cd gateway && npm run build` also copies `src/db/schema.sql` into `dist/db/schema.sql`; update the source schema only.
- Configuration examples belong in `.env.example`; runtime credentials must remain local.

## Source-of-Truth Files

- `AGENTS.md` — canonical agent instructions
- `CLAUDE.md` — redirect shim only
- `.env.example` — configuration reference
- `gateway/package.json` and `gateway/admin-ui/package.json` — scripts and dependencies
- `gateway/src/config.ts` and `gateway/src/policy.ts` — configuration defaults and routing behavior
- `gateway/src/db/schema.sql` — database schema and startup migrations
- `docs/DESIGN.md` — admin UI design rules
- `README.md`, `QUICKSTART.md`, and `SELF_HOST.md` — user-facing setup and deployment guidance
<!-- b-init-managed:end -->
