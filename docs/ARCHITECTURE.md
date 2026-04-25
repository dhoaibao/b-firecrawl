# Architecture

Firecrawl self-host runtime gồm 5 Docker services phối hợp:

| Service | Image/Build | Port | Vai trò |
|--------|------------|-----|--------|
| `api` | `build: apps/api` | 3002 | HTTP API + tất cả worker processes |
| `playwright-service` | `build: apps/playwright-service-ts` | 3000 | Headless Chromium browser microservice |
| `redis` | `redis:alpine` | 6379 | BullMQ queue backend + rate limiting |
| `rabbitmq` | `rabbitmq:3-management` | 5672 | AMQP broker cho NuQ workers |
| `nuq-postgres` | `build: apps/nuq-postgres` | 5432 | PostgreSQL 17 + NuQ schema + pg_cron |

## Docker Network

Internal network `backend` (bridge). Internal URLs:

- `redis://redis:6379`
- `amqp://rabbitmq:5672`
- `http://playwright-service:3000/scrape`
- `nuq-postgres:5432`

## Startup Sequence

Trong `docker-compose.yaml`:

1. `redis` → `rabbitmq` (health check → `service_healthy`) → `nuq-postgres` → `playwright-service` → `api`

API entrypoint: `node dist/src/harness.js --start-docker`

`harness.ts` spawns các worker processes bên trong container:

```
api (HTTP) → port 3002 (config.PORT)
worker (BullMQ) → port 3005 (config.WORKER_PORT)
extract-worker (RabbitMQ Direct) → port 3004 (config.EXTRACT_WORKER_PORT)
nuq-worker-N (N = config.NUQ_WORKER_COUNT, default 5) → ports 3006-3010
nuq-prefetch-worker → port 3011
nuq-reconciler-worker → port 3012
```

## Dependencies

- `apps/api/src/harness.ts` — service orchestration, Docker detection, graceful shutdown
- `apps/api/src/index.ts` — Express HTTP entry, route registration, graceful exit (nuq → webhook → indexer)
- `docker-compose.yaml` — service definitions, env vars, depends_on, volumes, health checks
- `apps/nuq-postgres/nuq.sql` — schema + pg_cron schedules
- `apps/nuq-postgres/docker-entrypoint-nuq.sh` — sets `cron.database_name` before postgres init

## Persistence Volumes

- `redis_data` → Redis RDB persistence
- `rabbitmq_data` → RabbitMQ mnesia + messages
- `postgres_data` → PostgreSQL data directory

## Resource Limits (docker-compose.yaml)

```
api:        4 CPU, 8GB RAM
playwright:  2 CPU, 4GB RAM
redis:      default
rabbitmq:   default
nuq-postgres: default
```

See `docker-compose.yaml` for full service definitions.