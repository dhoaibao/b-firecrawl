<!-- b-init-managed:start -->
# Agent Instructions

## Repository Purpose

This repository ships a Bun-workspace Turborepo with a native NestJS/Fastify API and independently deployed React admin dashboard in front of externally hosted Firecrawl services. It does not host Firecrawl runtime services or PostgreSQL.

## Working Rules

- Make the smallest coherent change and verify it before claiming completion.
- Edit source files, not generated outputs; preserve unrelated working-tree changes.
- Prefer repository evidence over assumptions and do not invent commands, paths, or release steps.
- Never expose secrets, API keys, session values, customer data, or internal URLs.
- Ask before dependency changes, schema migrations, destructive commands, long-lived services, commits, or PRs.
- Keep `AGENTS.md` canonical and `CLAUDE.md` as its minimal redirect shim.

## Verification Commands

API (`apps/api/`):

```bash
bun run typecheck
bun run build
bun run test
```

Admin UI (`apps/admin/`):

```bash
cd apps/admin
bun run lint
bun run build
```

Database migration:

```bash
bun run db:generate
bun run db:migrate
```

## Codebase Map

- `apps/api/src/main.ts` — NestJS/Fastify bootstrap and Vercel-compatible app factory
- `apps/api/src/proxy/` — upstream proxying, API-key handling, fallback, and streaming responses
- `apps/api/src/proxy/policy.ts` — route-mode and Cloud-requirement decisions
- `apps/api/src/common/config.ts` — environment configuration and validation
- `apps/api/src/auth/`, `apps/api/src/api-keys/`, and `apps/api/src/settings/` — single-admin authentication and administration
- `apps/api/src/prisma/` and `apps/api/prisma/` — Prisma client, mapped schema, and non-destructive baseline migration
- `apps/api/src/audit/`, `cron/`, and `common/` — PostgreSQL audit persistence, authenticated Vercel maintenance cron, request middleware, and shared helpers
- `apps/admin/src/` — root-hosted Vite React dashboard
- `apps/api/vercel.json` / `apps/admin/vercel.json` — leaf Vercel project configuration
- `README.md`, `QUICKSTART.md`, `SELF_HOST.md`, and `docs/DESIGN.md` — project and admin UI guidance

## Safety / Do-Not-Assume

- The API defaults to port `8080`; API and admin are deployed independently rather than through Docker/Compose.
- Firecrawl and PostgreSQL are external deployment prerequisites. The external Firecrawl URL is configured in the Admin UI; `DATABASE_URL` points to externally managed PostgreSQL.
- Run `bun run db:migrate` only with explicit cutover approval: the post-baseline migration deletes existing users, virtual API keys, and audit logs, then removes user ownership.
- The admin UI is root-hosted; admin endpoints remain under `/admin/api/*` on the API origin.
- Virtual API keys are `fc_`-prefixed, stored as hashes with encrypted key values, and their plaintext is returned only at creation. Keep `.env` and credential-bearing files out of output and commits.
- Routing defaults to `cloud-first`; supported modes and API-key inactivity settings are stored in PostgreSQL. Sensitive headers/cookies and private target URLs restrict fallback.
- Audit logs are stored only in PostgreSQL. Do not add file, filesystem, or line-oriented audit persistence.

## Maintainer Guide

- Bun and Node `>=22` are required. API TypeScript is strict; the admin UI uses Vite, Tailwind CSS, and ESLint.
- `bun run db:migrate` applies the source Prisma baseline; generated clients and build output are not source files.
- Configuration examples belong in `.env.example`; runtime credentials must remain local.

## Source-of-Truth Files

- `AGENTS.md` — canonical agent instructions
- `CLAUDE.md` — redirect shim only
- `.env.example` — configuration reference
- `package.json`, `apps/api/package.json`, and `apps/admin/package.json` — package scripts and dependencies
- `apps/api/src/common/config.ts` and `apps/api/src/proxy/policy.ts` — configuration defaults and routing behavior
- `apps/api/prisma/schema.prisma` and its migrations — global key/audit schema and the approved destructive cutover
- `docs/DESIGN.md` — admin UI design rules
- `README.md`, `QUICKSTART.md`, and `SELF_HOST.md` — user-facing setup and deployment guidance
<!-- b-init-managed:end -->
