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

## Vercel projects

Deploy `apps/api` and `apps/admin` separately. Set `VITE_API_BASE_URL` in the admin project to the API origin. Set exact `ADMIN_ORIGIN` and `API_ORIGIN` values in the API project. The API's `vercel.json` schedules `/api/cron/maintenance`; Vercel authenticates it with `CRON_SECRET`.

The API remains compatible with `/health`, `/ready`, `/v1/*`, `/v2/*`, and `/admin/api/*`. Admin sessions are signed HTTP-only cookies and may need to be re-created at cutover. User-management endpoints and UI have been removed; API keys and audit records are global.

## Routing modes

- `self-hosted-first`: use the external self-hosted Firecrawl instance first and fall back to Cloud for eligible requests.
- `self-hosted-only`: never send requests to Cloud.
- `cloud-first`: use Cloud first and fall back to self-hosted when eligible.
- `cloud-only`: use Cloud exclusively.

Cloud API keys remain encrypted in PostgreSQL. Sensitive headers/cookies and private target URLs continue to disable fallback.
