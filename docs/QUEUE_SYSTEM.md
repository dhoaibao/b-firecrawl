# Queue System — NuQ vs BullMQ

Firecrawl sử dụng **hai queue layer** cùng tồn tại:

## BullMQ + Redis

**Purpose**: Orchestration + fast-moving jobs

| Queue | Backend | Purpose |
|-------|--------|---------|
| `precrawlQueue` | Redis/BullMQ | Crawl kickoff (mode: kickoff) |
| `deepResearchQueue` | Redis/BullMQ | Multi-agent research |
| `generateLlmsTxtQueue` | Redis/BullMQ | LLM text generation |
| `billingQueue` | Redis/BullMQ | Credit billing |

**Characteristics**:
- In-memory (Redis)
- Fast, ephemeral
- Job = Redis key + data
- Worker: `queue-worker.ts` function `workerFun`
- Configuration: `NUM_WORKERS_PER_QUEUE` (default 8)

**Code**:

- `services/queue-service.ts`: `getScrapeQueue`, `getPrecrawlQueue`, `getDeepResearchQueue`
- `services/queue-worker.ts`: `workerFun` polls BullMQ via `getNextJob()`

## NuQ (Postgres + RabbitMQ)

**Purpose**: Durable scrape jobs with persistence

### Architecture

1. **PostgreSQL** — stores job rows (`nuq.queue_scrape`, `nuq.queue_scrape_backlog`)
2. **RabbitMQ** — notification channel (`LISTEN/NOTIFY`) triggers workers
3. **Workers** — `nuq-worker`, `nuq-prefetch-worker`, `nuq-reconciler-worker`

### Tables

| Table | Purpose |
|------|--------|
| `nuq.queue_scrape` | Individual scrape jobs (`status`: queued/active/completed/failed) |
| `nuq.queue_scrape_backlog` | Overflow khi team concurrency limit |
| `nuq.queue_crawl_finished` | Crawl completion triggers |
| `nuq.group_crawl` | Crawl group metadata (TTL, status) |

### Job Lifecycle (NuQ)

```
Controller → addJob (nuq.ts)
  ↓ inserts row with status='queued'
  ↓ RabbitMQ: NOTIFY 'nuq.queue_scrape'
nuq-worker → prefetchJobs (SELECT FOR UPDATE SKIP LOCKED)
  ↓ status='active', lock=uuid, locked_at=now()
  ↓ processJob → startWebScraperPipeline
  ↓ jobFinish → status='completed', returnvalue=doc
nuq-reconciler-worker (pg_cron, every 15s):
  ↓ reaper: status='queued' if lock expired (>1min)
  ↓ failed: status='failed' after 9 stalls
```

### Prefetch/Reconciler

**`nuq-prefetch-worker`** — consumes RabbitMQ prefetch channel, populates NuQ rows ahead

**`nuq-reconciler-worker`** — runs via `pg_cron`, detects:
- Stalled locks → re-queue
- Failed after 9 stalls → `pg_notify` to trigger completion

### pg_cron Schedules (every 15s to daily)

```
nuq_queue_scrape_lock_reaper     (15s)   → requeue stale locks
nuq_group_crawl_finished       (15s)   → detect group completion → insert nuq.queue_crawl_finished
nuq_queue_scrape_clean_completed (5m) → DELETE completed >1h
nuq_queue_scrape_clean_failed  (5m)   → DELETE failed >6h
nuq_queue_scrape_backlog_reaper (1m)   → DELETE backlog >25h
nuq_queue_scrape_reindex        (daily 9am) → REINDEX
```

**Code**:

- `services/worker/nuq.ts`: `class NuQ` — `addJob`, `getJob`, `prefetchJobs`, `waitForJob`, `jobFinish`, `jobFail`
- `services/worker/nuq-worker.ts`: main NuQ worker loop
- `services/worker/nuq-prefetch-worker.ts`: RabbitMQ prefetch
- `services/worker/nuq-reconciler-worker.ts`: reconciliation
- `nuq-postgres/nuq.sql`: schema + pg_cron schedules

## Extract Queue (RabbitMQ Direct)

**Purpose**: LLM-structured extraction (separate from NuQ)

- **Queue**: `EXTRACT_QUEUE` (RabbitMQ Direct channel)
- **Code**: `services/extract-queue.ts` — `addExtractJob`, `consumeExtractJobs`
- **Worker**: `extract-worker.ts` → `processExtractJob`

## Concurrency Control

- **Per-team**: `lib/concurrency-queue-reconciler.ts` → Redis `crawl:{id}:jobs_qualified`
- **Scrape limit**: `CRAWL_CONCURRENT_REQUESTS` (10), `MAX_CONCURRENT_JOBS` (5)

## When to Debug

| Symptom | Check |
|---------|-------|
| Jobs stuck in queued | pg_cron running? `nuq_queue_scrape_lock_reaper` |
| Duplicate scrapes | Redis crawl state: `crawl:{id}:visited` |
| Slow discovery | `processKickoffJob` sitemap/robots |
| Extract timeout | RabbitMQ EXTRACT_QUEUE consumer |
| Worker stall detection | `nuq-reconciler-worker` logs |