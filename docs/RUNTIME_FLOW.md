# Runtime Flow — End-to-End Request Traces

## 1. `/v1/scrape` (Single URL)

**Request → Response**

```
scrapeController (controllers/v1/scrape.ts)
  ↓ (skipNuq = true, direct inline)
  processJobInternal (services/worker/scrape-worker.ts)
    ↓
  startWebScraperPipeline (main/runWebScraper.ts)
    ↓
  scrapeURL (scraper/scrapeURL/index.ts)
    ↓ (engine: fetch | playwright)
  playwright-service /scrape (HTTP)
    ↓ returns HTML/markdown
  logScrape → returnvalue stored in NuQ row
```

- **Queue**: Uses `nuq.queue_scrape` table with `returnvalue` column (selfhost mode)
- **Workers**: `processJob` executes inline in same worker process (no separate NuQ worker)
- **Status**: `GET /v1/scrape/:jobId` → reads `nuq.queue_scrape.returnvalue`

## 2. `/v1/crawl` (Discovery + Spidering)

**Request → Polling → Completion**

```
crawlController (controllers/v1/crawl.ts)
  ↓
  saveCrawl → group_crawl (Redis)
  ↓ _addScrapeJobToBullMQ → precrawlQueue
  ↓ crawlGroup.addGroup
  ↓ returns jobId immediately
```

### Precrawl Worker (BullMQ)

```
processKickoffJob (services/worker/scrape-worker.ts)
  ↓ getCrawl, crawlToCrawler
  ↓ lockURL(seed) → addScrapeJob → scrapeQueue (single_urls)
  ↓ discovery via sitemap/robots/index
  ↓ for each discovered link:
    lockURL → addScrapeJob → addCrawlJob
  ↓ finishCrawlKickoff
```

### Scrape Workers (NuQ)

```
nuq-worker → fetchJobs → processJob (scrape-worker.ts)
  ↓ startWebScraperPipeline → playwright-service
  ↓ for each scraped page:
    crawler.filterLinks → discover new URLs
    → add new Scrape jobs recursively
    → addCrawlJobDone
  ↓ logScrape → GCS
```

### Crawl Finish (pg_cron + NuQ)

```
pg_cron: nuq_group_crawl_finished (runs every 15s)
  ↓ detects no more queued/active jobs for group
  ↓ inserts into nuq.queue_crawl_finished
nuq-reconciler-worker → processFinishCrawlJobInternal
  ↓ finishCrawlSuper (crawl-logic.ts)
  ↓ gathers all pages → assemble final doc
  ↓ webhook notification
```

- **Queue**: `precrawlQueue` (BullMQ) → `nuq.queue_scrape` (NuQ) → `nuq.queue_crawl_finished` (NuQ)
- **State**: Redis (`crawl:{id}:visited`, `crawl:{id}:jobs_qualified`)
- **Status**: `GET /v1/crawl/:jobId` → Redis + NuQ count

## 3. `/v1/extract` (LLM Structured Extraction)

**Request → Response**

```
extractController (controllers/v1/extract.ts)
  ↓ saveExtract (Postgres)
  ↓ addExtractJobToQueue → RabbitMQ EXTRACT_QUEUE
  ↓ returns extractId immediately
```

### Extract Worker (RabbitMQ Direct)

```
consumeExtractJobs (services/extract-queue.ts)
  ↓ processExtractJob (extract-worker.ts)
  ↓ performExtraction_F0 (lib/ generic-ai.ts)
    ↓ scrape all URLs (via startWebScraperPipeline)
    ↓ LLM structured extraction
  ↓ updateExtract (Postgres)
  ↓ webhook
```

- **Queue**: RabbitMQ Direct channel (`EXTRACT_QUEUE`), not BullMQ
- **State**: `extracts` table in Postgres
- **Status**: `GET /v1/extract/:jobId` → reads `extracts` table

## 4. `/v1/map` (URL Discovery Only)

**Request → Response**

```
mapController (controllers/v1/map.ts)
  ↓ WebCrawler (scraper/WebScraper/crawler.ts)
  ↓ crawlToCrawler → extractLinksFromHTML / sitemap
  ↓ getMapResults
  ↓ returns links immediately
```

- **Queue**: None (synchronous)
- **Status**: Returns links directly in response

## 5. `/v1/deep-research` (Multi-Agent Research)

```
deepResearchController (controllers/v1/deep-research.ts)
  ↓ getDeepResearchQueue → BullMQ deepResearchQueue
  ↓ returns researchId
```

- **Queue**: BullMQ `deepResearchQueue`
- **Workers**: `processDeepResearchJobInternal` in `queue-worker.ts`

## Key Worker Entry Points

| Worker | Entry | Runs |
|--------|-------|------|
| BullMQ worker | `workerFun` (queue-worker.ts) | `processJob`, `processKickoffJob`, `processFinishCrawlJobInternal` |
| NuQ worker | `main` (nuq-worker.ts) | Reads NuQ → calls `processJob` |
| Extract worker | `processExtractJob` (extract-worker.ts) | RabbitMQ message handler |
| Prefetch worker | `nuq-prefetch-worker.ts` | RabbitMQ → NuQ rows |
| Reconciler | `nuq-reconciler-worker.ts` | pg_cron → stuck detection |

## Health Endpoints

- `GET /` — root, returns `{ message: "Firecrawl API" }`
- `GET /e2e-test` — always 200
- `GET /v0/health/liveness` — always 200
- `GET /v0/health/readiness` — always 200
- `GET /v0/admin/redis-health` — checks Redis
- BullMQ UI: `/admin/{BULL_AUTH_KEY}/queues`