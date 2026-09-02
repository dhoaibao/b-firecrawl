<!-- b-init-managed:start -->

# Agent Instructions

## Repository Purpose

This repository ships a Bun-workspace Turborepo with two independently deployable Vercel projects: a native NestJS/Fastify API and a root-hosted React/Vite admin dashboard in front of externally hosted Firecrawl and PostgreSQL services. It does not host those runtime services.

## Working Rules

- Make the smallest coherent change and verify it before claiming completion.
- Edit source files, not generated outputs; preserve unrelated working-tree changes.
- Prefer repository evidence over assumptions and do not invent commands, paths, or release steps.
- Never expose secrets, API keys, session values, customer data, or internal URLs.
- Ask before dependency changes, schema migrations, destructive commands, long-lived services, commits, or PRs.
- Keep `AGENTS.md` canonical and `CLAUDE.md` as its minimal redirect shim.

## Verification Commands

From the repository root:

```bash
bun run typecheck
bun run build
bun run lint
bun run test
```

Admin-only checks:

```bash
cd apps/admin
bun run lint
bun run build
```

Database schema/client commands:

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
- `apps/api/prisma/` — PostgreSQL schema and migrations, including the single-admin cutover
- `apps/api/src/prisma/` — Prisma service/module and migration-compatibility tests
- `apps/api/src/audit/` — PostgreSQL audit persistence and API
- `apps/api/src/cron/` — authenticated Vercel maintenance cron
- `apps/api/src/common/` — configuration, request middleware, and shared helpers
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
- A revoked API key can remain valid for up to 30 seconds per running instance: `validateApiKey` caches results in-process, and `CronService.revokeInactiveKeys` updates rows directly with `updateMany` rather than going through `revokeApiKey`, so it never invalidates any instance's cache.
- The daily maintenance cron permanently deletes audit entries older than 30 days; the window is fixed in code.
- Request bodies are decoded as UTF-8 before being forwarded, so non-UTF-8 payloads (binary uploads, Latin-1 text) are corrupted in transit; the gateway is intended for UTF-8 JSON traffic.
- Audit logs are stored only in PostgreSQL. Do not add file, filesystem, or line-oriented audit persistence.

## Maintainer Guide

- Bun 1.3+ and Node.js 22+ are required. API TypeScript is strict; the admin UI uses Vite, Tailwind CSS, and ESLint.
- `bun run db:migrate` applies the source Prisma migrations, including a destructive single-admin cutover; generated clients and build output are not source files.
- Configuration examples belong in `.env.example`; runtime credentials must remain local.

## Source-of-Truth Files

- `AGENTS.md` — canonical agent instructions
- `CLAUDE.md` — redirect shim only
- `.env.example` — configuration reference
- `package.json`, `apps/api/package.json`, and `apps/admin/package.json` — package scripts and dependencies
- `apps/api/src/common/config.ts` and `apps/api/src/proxy/policy.ts` — configuration defaults and routing behavior
- `apps/api/prisma/schema.prisma` and its migrations — global key/audit schema and migration history, including the single-admin cutover
- `docs/DESIGN.md` — admin UI design rules
- `README.md`, `QUICKSTART.md`, and `SELF_HOST.md` — user-facing setup and deployment guidance

<!-- b-init-managed:end -->
