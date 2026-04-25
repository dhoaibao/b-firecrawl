# Services Reference

File này là "source of truth" cho câu hỏi: **file/module nào xử lý việc gì**.

## apps/api — Main Runtime

### Entrypoints

| File | Symbol | Vai trò |
|------|--------|--------|
| `src/harness.ts` | `main`, `runProductionMode`, `startServices` | Docker self-host orchestration (spawns all workers) |
| `src/index.ts` | `startServer` | Express HTTP entry, route registration, graceful exit |
| `src/config.ts` | `configSchema` (Zod) | **Nguồn sự thật** cho tất cả env vars |

### HTTP Routes (`src/routes/v1.ts`)

| Endpoint | Controller | Flow |
|----------|------------|------|
| `POST /v1/scrape` | `scrapeController` | Direct to NuQ → `processJob` |
| `POST /v1/crawl` | `crawlController` | BullMQ precrawl → NuQ kickoff → discovery → NuQ workers |
| `POST /v1/map` | `mapController` | Direct (no queue) |
| `POST /v1/extract` | `extractController` | RabbitMQ Direct (EXTRACT_QUEUE) |
| `POST /v1/search` | `searchController` | Direct hoặc SearXNG |
| `POST /v1/batch/scrape` | `batchScrapeController` | Same as crawl |
| `POST /v1/deep-research` | `deepResearchController` | BullMQ deep research |
| `DELETE /v1/crawl/:jobId` | `crawlCancelController` | Cancel crawl |
| `/v1/crawl/:jobId` | `crawlStatusController` | Poll crawl status |
| `/v1/scrape/:jobId` | `scrapeStatusController` | Poll scrape status |
| `/v1/extract/:jobId` | `extractStatusController` | Poll extract status |
| `WS /v1/crawl/:jobId` | `crawlStatusWSController` | WebSocket stream |

### Controllers (`src/controllers/v1/`)

```
crawl.ts           crawlController     → precrawlQueue → kickoff → discovery
crawl-status.ts    crawlStatusController / WS
crawl-cancel.ts    crawlCancelController
crawl-ongoing.ts  ongoingCrawlsController
crawl-errors.ts  crawlErrorsController
scrape.ts         scrapeController  → NuQ (direct via processJobInternal)
scrape-status.ts  scrapeStatusController
extract.ts        extractController → RabbitMQ (EXTRACT_QUEUE)
extract-status.ts extractStatusController
map.ts            mapController    → WebCrawler → sitemap/discovery
batch-scrape.ts   batchScrapeController
search.ts        searchController
deep-research.ts deepResearchController
deep-research-status.ts
generate-llmstxt.ts
generate-llmstxt-status.ts
credit-usage.ts / credit-usage-historical.ts
token-usage.ts / token-usage-historical.ts
queue-status.ts
concurrency-check.ts
fireclaw.ts
x402-search.ts
```

### Queue/Worker Services (`src/services/`)

```
queue-service.ts       getScrapeQueue, getPrecrawlQueue, addExtractJobToQueue (BullMQ factory)
queue-worker.ts        workerFun → processJob, processKickoffJob, processFinishCrawlJobInternal (BullMQ)
extract-worker.ts    processExtractJob → performExtraction_F0 (RabbitMQ Direct)
extract-queue.ts    addExtractJob, consumeExtractJobs (RabbitMQ channel)
rate-limiter.ts      Redis-backed rate limiting
system-monitor.ts    CPU/RAM monitoring cho workerFun
```

### NuQ Workers (`src/services/worker/`)

| File | Symbol | Vai trò |
|------|--------|--------|
| `nuq.ts` | `class NuQ` | PostgreSQL queue client + RabbitMQ listener. Methods: `addJob`, `getJob`, `prefetchJobs`, `waitForJob`, `jobFinish`, `jobFail` |
| `nuq-worker.ts` | main | Reads NuQ rows → `processJobInternal` → `startWebScraperPipeline` |
| `nuq-prefetch-worker.ts` | main | Consumes RabbitMQ prefetch channel → populates NuQ tables |
| `nuq-reconciler-worker.ts` | main | Detects stalled jobs, calls pg_cron reaper |
| `scrape-worker.ts` | `processJob`, `processJobInternal`, `processKickoffJob` | Actual scrape execution |
| `crawl-logic.ts` | `finishCrawlSuper` | Crawl completion + final doc assembly |
| `redis.ts` | Crawl state in Redis | `saveCrawl`, `getCrawl`, `lockURL`, `addCrawlJobs` |

### Scraper Pipeline (`src/scraper/`)

```
scraper/scrapeURL/index.ts      scrapeURL, scrapeURLLoop — entrypoint per URL
scraper/scrapeURL/engines/    fetch, playwright, fire-engine, pdf/
scraper/WebScraper/crawler.ts WebCrawler — link discovery, filtering
scraper/crawler/sitemap.ts  scrapeSitemap, getSitemapXML
main/runWebScraper.ts        startWebScraperPipeline
```

### Core Lib (`src/lib/`)

| File | Vai trò |
|------|------|
| `crawl-redis.ts` | Crawl group state (Redis hash) |
| `browser-sessions.ts` | Playwright session tracking |
| `html-to-markdown.ts` | Go shared library wrapper |
| `validateUrl.ts` | URL blocklist + security checks |
| `concurrency-queue-reconciler.ts` | Per-team concurrency limits |
| `queue-jobs.ts` | `addScrapeJob`, `_addScrapeJobToBullMQ` |

## apps/playwright-service-ts

| File | Symbol | Vai trò |
|------|--------|--------|
| `api.ts` | `app.post('/scrape')` | Browser microservice — launches Chromium, navigates, returns HTML |

## apps/nuq-postgres

| File | Vai trò |
|------|------|
| `nuq.sql` | Schema (nuq.queue_scrape, nuq.group_crawl, etc.), pg_cron schedules |
| `docker-entrypoint-nuq.sh` | Sets `cron.database_name` before initdb |

## docker-compose.yaml

- Service definitions với `build:`, `environment`, `depends_on`, `volumes`
- Internal URLs tự động: `REDIS_URL`, `PLAYWRIGHT_MICROSERVICE_URL`, `NUQ_RABBITMQ_URL`
- Health checks cho `rabbitmq: service_healthy`
- Persistent volumes: `redis_data`, `rabbitmq_data`, `postgres_data`