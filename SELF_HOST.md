# External Service Guide

This repository deploys a gateway, not Firecrawl or PostgreSQL. Configure both services outside this repository.

## Configure

```bash
cp .env.example .env
bun install
bun run db:generate
bun run db:migrate
```

Set migration-capable direct `DATABASE_URL`, `SESSION_SECRET`, `FIRECRAWL_KEYS_ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `CRON_SECRET`. Stop any running API process, run `bun run db:migrate`, then start/redeploy the API; it applies the additive legacy `audit_logs.target_url` compatibility and repair migrations before Prisma reads audit records. The single `ADMIN_EMAIL`/`ADMIN_PASSWORD` pair is the only administrator identity and is not stored in PostgreSQL; changing it changes the credentials accepted after the API restarts. The cutover migration intentionally deletes existing users, virtual API keys, and audit-log records before making keys and audits global. The same URL is used by runtime and migrations; do not use a transaction-only PgBouncer endpoint. This configuration does not silently guarantee serverless connection pooling. Configure the external self-hosted Firecrawl URL in the admin UI under **Configure > Routing**. The API function allows up to 120 seconds for streamed upstream requests, subject to the Vercel plan's maximum.

### Serverless connection pooling

Each cold serverless instance of the API opens its own PostgreSQL connection, and nothing in this repository configures Prisma connection pooling. As instance count grows, connections can exceed what the database accepts and requests begin failing with connection errors.

For serverless deployments (Vercel and similar), point the runtime at a pooled endpoint: PgBouncer sitting between Prisma Client and the database, a provider pooler (for example Supabase or Neon's pooled connection strings), or a managed pooler such as Prisma Postgres. Prisma Client also supports a `?pgbouncer=true` URL flag for PgBouncer in transaction mode (required for PgBouncer versions below 1.21.0) and a `connection_limit` URL parameter to size the per-instance pool.

Two constraints from this repository's setup apply:

- The same `DATABASE_URL` is used by the runtime and `bun run db:migrate`. Migrations need a direct, migration-capable connection, so a transaction-only PgBouncer endpoint is not suitable as-is; use session-mode pooling, or run migrations against the direct database URL while the runtime uses the pooled one.
- Prisma Client is instantiated once per process by the NestJS dependency-injection container and reused across warm invocations, which is the correct pattern; the remaining exposure is the per-cold-start connection, which only an external pooler addresses.

## Vercel projects

Deploy `apps/api` and `apps/admin` separately. Set `VITE_API_BASE_URL` in the admin project to the API origin. Set exact `ADMIN_ORIGIN` and `API_ORIGIN` values in the API project. The API's `vercel.json` schedules `/api/cron/maintenance`; Vercel authenticates it with `CRON_SECRET`. This daily maintenance cron permanently deletes audit entries older than 30 days; deletion is batched, so a large existing backlog drains over several daily runs. The 30-day window is fixed in code and not configurable.

The API remains compatible with `/health`, `/ready`, `/v1/*`, `/v2/*`, and `/admin/api/*`. Admin sessions are signed HTTP-only cookies and may need to be re-created at cutover. User-management endpoints and UI have been removed; API keys and audit records are global.

## Routing modes

- `self-hosted-first`: use the external self-hosted Firecrawl instance first and fall back to Cloud for eligible requests.
- `self-hosted-only`: never send requests to Cloud.
- `cloud-first`: use Cloud first and fall back to self-hosted when eligible.
- `cloud-only`: use Cloud exclusively.

Cloud API keys remain encrypted in PostgreSQL. Sensitive headers/cookies and private target URLs continue to disable fallback.
