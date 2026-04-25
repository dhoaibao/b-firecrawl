# API Contract — Env Vars + Endpoints

## Self-Host Required Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_USER` | Yes | — | DB username |
| `POSTGRES_PASSWORD` | Yes | — | DB password |
| `POSTGRES_DB` | Yes | — | DB name (also `cron.database_name`) |
| `BULL_AUTH_KEY` | Yes | — | BullMQ UI access key |
| `POSTGRES_HOST` | Auto | `nuq-postgres` | compose sets this |
| `POSTGRES_PORT` | Auto | `5432` | compose sets this |
| `REDIS_URL` | Auto | `redis://redis:6379` | compose sets this |
| `PLAYWRIGHT_MICROSERVICE_URL` | Auto | `http://playwright-service:3000/scrape` | compose sets this |
| `NUQ_RABBITMQ_URL` | Auto | `amqp://rabbitmq:5672` | compose sets this |
| `USE_DB_AUTHENTICATION` | Auto | `false` | MUST be false for self-host |
| `PORT` | No | `3002` | HTTP server port |
| `HOST` | No | `0.0.0.0` | HTTP server bind |

## API Server Ports (Internal)

| Port | Default | Component |
|-----|---------|-----------|
| `PORT` | 3002 | Main HTTP API |
| `WORKER_PORT` | 3005 | BullMQ worker |
| `EXTRACT_WORKER_PORT` | 3004 | Extract worker |
| `NUQ_WORKER_START_PORT` | 3006 | NuQ workers (5 = ports 3006-3010) |
| `NUQ_PREFETCH_WORKER_PORT` | 3011 | Prefetch worker |
| `NUQ_RECONCILER_WORKER_PORT` | 3012 | Reconciler |

## Concurrency Defaults

| Variable | Default | Description |
|----------|---------|-------------|
| `NUM_WORKERS_PER_QUEUE` | 8 | BullMQ workers per queue |
| `CRAWL_CONCURRENT_REQUESTS` | 10 | Browser pool size |
| `MAX_CONCURRENT_JOBS` | 5 | Max concurrent crawl jobs |
| `BROWSER_POOL_SIZE` | 5 | Playwright page pool |
| `NUQ_WORKER_COUNT` | 5 | Number of NuQ workers |

## Resource Thresholds

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_CPU` | 0.8 | Reject new jobs when CPU > 80% |
| `MAX_RAM` | 0.8 | Reject new jobs when RAM > 80% |

## Optional Features

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Enable AI features (JSON, extract, summary) |
| `OLLAMA_BASE_URL` | Use Ollama instead of OpenAI |
| `OPENAI_BASE_URL` | Custom OpenAI-compatible endpoint |
| `MODEL_NAME` | Override default LLM |
| `MODEL_EMBEDDING_NAME` | Override default embedding |
| `PROXY_SERVER` | HTTP/SOCKS proxy for scraping |
| `SEARXNG_ENDPOINT` | SearXNG instance for `/search` |
| `SLACK_WEBHOOK_URL` | Post health alerts |
| `LLAMAPARSE_API_KEY` | PDF parsing |
| `GCS_BUCKET_NAME` | Store scrape results in GCS |
| `SELF_HOSTED_WEBHOOK_URL` | Custom webhook endpoint |
| `LOGGING_LEVEL` | TRACE/DEBUG/INFO/WARN/ERROR |

## API Endpoints

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/scrape` | Scrape single URL |
| POST | `/v1/crawl` | Start crawl job |
| POST | `/v1/map` | Discover URLs |
| POST | `/v1/extract` | LLM extraction |
| POST | `/v1/search` | Web search |
| POST | `/v1/batch/scrape` | Batch scrape |
| POST | `/v1/deep-research` | Multi-agent research |
| POST | `/v1/llmstxt` | Generate LLM txt |
| GET | `/v1/crawl/:jobId` | Crawl status |
| GET | `/v1/scrape/:jobId` | Scrape status |
| GET | `/v1/extract/:jobId` | Extract status |
| DELETE | `/v1/crawl/:jobId` | Cancel crawl |
| WS | `/v1/crawl/:jobId` | Crawl status stream |

### Admin / System

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | API info |
| GET | `/e2e-test` | Smoke test |
| GET | `/v0/health/liveness` | Liveness probe |
| GET | `/v0/health/readiness` | Readiness probe |
| GET | `/v0/admin/redis-health` | Redis health |
| GET | `/admin/{BULL_AUTH_KEY}/queues` | BullMQ dashboard |

### Team

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/team/credit-usage` | Current credits |
| GET | `/v1/team/queue-status` | Queue status |

## Source of Truth

- All env vars: `apps/api/src/config.ts` (`configSchema` Zod)
- Routes: `apps/api/src/routes/v1.ts` (`v1Router`)
- Compose wiring: `docker-compose.yaml`