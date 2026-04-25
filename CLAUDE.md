# Firecrawl Self-Host Runtime — CLAUDE.md

> This repo is a trimmed personalFirecrawl self-host runtime fork. Docs are in `/docs`.

## When to Read Which Docs

| Task | Go to |
|------|-------|
| Understand service topology, internal URLs, startup order | `docs/ARCHITECTURE.md` |
| Find which file/module handles X | `docs/SERVICES.md` |
| Trace a request from HTTP to completion | `docs/RUNTIME_FLOW.md` |
| Debug queue/stuck jobs, understand NuQ vs BullMQ | `docs/QUEUE_SYSTEM.md` |
| Find env var, port, or endpoint definition | `docs/API_CONTRACT.md` |
| Setup/deploy self-host | `SELF_HOST.md` |
| Understand repo purpose | `README.md` |

## Operational Rules

### 1. Any Code Change MUST Update Corresponding Docs

| Code change type | Docs to update |
|----------------|--------------|
| New route or controller | `docs/SERVICES.md` + `docs/RUNTIME_FLOW.md` |
| New worker or queue | `docs/SERVICES.md` + `docs/QUEUE_SYSTEM.md` |
| New env var or config | `docs/API_CONTRACT.md` |
| Docker service or network change | `docs/ARCHITECTURE.md` |
| New scrape pipeline | `docs/RUNTIME_FLOW.md` |

### 2. Source of Truth

- **Env vars**: `apps/api/src/config.ts` → `configSchema`
- **Routes**: `apps/api/src/routes/v1.ts`
- **Architecture**: `docker-compose.yaml`, `apps/api/src/harness.ts`
- **NuQ schema**: `apps/nuq-postgres/nuq.sql`

### 3. Service Responsibilities

- **`api`**: HTTP server + All worker processes (BullMQ + NuQ + Extract)
- **`playwright-service`**: Browser microservice (`POST /scrape`)
- **`redis`**: BullMQ backend + rate limiting
- **`rabbitmq`**: NuQ notification channel
- **`nuq-postgres`**: PostgreSQL + NuQ + pg_cron

### 4. Entry Points

| Mode | Command |
|------|--------|
| Docker | `node dist/src/harness.js --start-docker` |
| Dev (local) | `pnpm harness --start` |
| API only | `pnpm server:production` |
| Worker | `pnpm worker:production` |
| NuQ worker | `pnpm nuq-worker:production` |
| Extract worker | `pnpm extract-worker:production` |

### 5. Health & Smoke

```bash
curl http://localhost:3002/e2e-test              # 200 OK
curl http://localhost:3002/v0/health/liveness    # always 200
curl http://localhost:3002/v0/admin/redis-health # checks Redis
```

BullMQ dashboard: `http://localhost:3002/admin/{BULL_AUTH_KEY}/queues`

### 6. Queue Patterns

- **BullMQ** (`redis`): precrawl, deep research, llmstxt — use `queue-worker.ts`
- **NuQ** (`postgres` + `rabbitmq`): scrape, batch scrape — use `nuq-worker.ts`
- **RabbitMQ Direct**: extract — uses `extract-queue.ts`

### 7. Common Debug Targets

| Symptom | Check |
|---------|-------|
| Job stuck in queued | pg_cron `nuq_queue_scrape_lock_reaper` |
| No scrape results | `nuq.queue_scrape.returnvalue` |
| Crawl hangs | Redis `crawl:{id}:*` keys |
| Extract timeout | RabbitMQ EXTRACT_QUEUE consumer |
| Worker OOM | `MAX_CPU`, `MAX_RAM` thresholds in config |

## Quick Start

```bash
docker compose build
docker compose up -d
# API: http://localhost:3002
```

See `SELF_HOST.md` for full setup.