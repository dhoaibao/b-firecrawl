# Quick Start — No Clone Required

Run the full Firecrawl self-hosted stack with a pre-built gateway image. No need to clone this repository.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

## 1. Download the compose file

```bash
curl -O https://raw.githubusercontent.com/dhoaibao/b-firecrawl/main/docker-compose.prebuilt.yaml
curl -O https://raw.githubusercontent.com/dhoaibao/b-firecrawl/main/.env.example
mv .env.example .env
```

Or manually save these two files from this repo:
- `docker-compose.prebuilt.yaml`
- `.env.example` (rename to `.env`)

## 2. Configure environment

Edit `.env` and set at least:

```env
BULL_AUTH_KEY=change-this-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=changeme
SESSION_SECRET=change-me-to-a-long-random-string
```

Optional: set `FIRECRAWL_API_KEY` for cloud fallback.

## 3. Start everything

```bash
docker compose -f docker-compose.prebuilt.yaml up -d
```

## 4. Access

| Service | URL |
|---|---|
| Gateway API | `http://localhost:8080` |
| Gateway Admin UI | `http://localhost:8080/admin` |
| Direct Firecrawl API | `http://localhost:3002` |
| Bull Queue UI | `http://localhost:3002/admin/<BULL_AUTH_KEY>/queues` |

## Test it

With auth enabled (default), create a virtual API key in the admin UI first, then:

```bash
curl -X POST http://localhost:8080/v2/scrape \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://firecrawl.dev"}'
```

## Update to latest

```bash
docker compose -f docker-compose.prebuilt.yaml pull
docker compose -f docker-compose.prebuilt.yaml up -d
```

## What's running

| Service | Image | Description |
|---|---|---|
| `gateway` | `dhoaibao/firecrawl-gateway:latest` | API gateway + admin UI (this repo) |
| `api` | `ghcr.io/firecrawl/firecrawl` | Firecrawl core API |
| `playwright-service` | `ghcr.io/firecrawl/playwright-service` | Browser automation |
| `nuq-postgres` | `ghcr.io/firecrawl/nuq-postgres` | PostgreSQL database |
| `redis` | `redis:alpine` | Redis cache |
| `rabbitmq` | `rabbitmq:3-management` | Message queue |
