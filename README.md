# Firecrawl Gateway

This repository ships a Bun-workspace Turborepo with two independently deployable Vercel projects:

- `apps/api` — native NestJS API on the Fastify adapter
- `apps/admin` — root-hosted React/Vite admin SPA

The gateway fronts externally hosted Firecrawl and PostgreSQL services. It does not run either service.

## Quick start

```bash
bun install
cp .env.example .env
bun run db:generate
bun run db:migrate
bun run dev
```

The API listens on `http://localhost:8080`. Set `VITE_API_BASE_URL` to that API origin when running the admin locally.

## Deploy

Create two Vercel projects with roots `apps/api` and `apps/admin`. Each root contains its own `vercel.json`:

- API: configure the API variables in `.env.example`, including the migration-capable `DATABASE_URL` and `CRON_SECRET`.
- Admin: configure `VITE_API_BASE_URL` to the API's exact origin.
- Set `ADMIN_ORIGIN` and `API_ORIGIN` to the exact deployed origins so credentialed CORS is restricted.
- Stop any running API process, run `bun run db:migrate` against the existing PostgreSQL database, then start/redeploy the API. Prisma does not apply migrations during startup. This applies the additive legacy audit compatibility and repair migrations before Prisma reads `audit_logs`; the cutover migration intentionally deletes existing users, virtual API keys, and audit-log records, then removes user ownership from the new global key/audit tables. Configure the single administrator with `ADMIN_EMAIL` and `ADMIN_PASSWORD`; these environment credentials are the only admin credentials and are not stored in PostgreSQL. The same `DATABASE_URL` is used by runtime and migrations, so it must be a migration-capable direct PostgreSQL connection, not a transaction-only PgBouncer endpoint. This configuration does not silently guarantee serverless connection pooling. The API function is configured for up to 120 seconds, subject to the Vercel plan's maximum.

The API exposes `/health`, `/ready`, `/v1/*`, `/v2/*`, and the `/admin/api/*` contracts. The admin SPA is served from the project root rather than `/admin`. Rate limiting uses shared PostgreSQL state so serverless instances enforce one limit. There are no user-management endpoints; API keys and audit records are global to the single administrator.

## Documentation

- [`QUICKSTART.md`](QUICKSTART.md) — local development and Vercel setup
- [`SELF_HOST.md`](SELF_HOST.md) — external Firecrawl and PostgreSQL configuration
- [`apps/api/README.md`](apps/api/README.md) — API routes and Prisma operations
- [`docs/DESIGN.md`](docs/DESIGN.md) — admin UI design rules
