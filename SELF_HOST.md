# Self-host Deployment Guide

This repo is configured for deployment-only Firecrawl self-hosting with a Hybrid Gateway. Firecrawl itself runs from published container images.

## Services

`docker-compose.yaml` starts:

- `gateway`: local policy gateway and admin UI.
- `api`: `ghcr.io/firecrawl/firecrawl`.
- `playwright-service`: `ghcr.io/firecrawl/playwright-service:latest`.
- `nuq-postgres`: `ghcr.io/firecrawl/nuq-postgres:latest`.
- `redis`: `redis:alpine`.
- `rabbitmq`: `rabbitmq:3-management`.

## Required Setup

Create `.env`:

```bash
cp .env.example .env
```

Set at least:

```env
BULL_AUTH_KEY=change-this-secret
```

Set this if you want Cloud fallback or `cloud-first` routing:

```env
FIRECRAWL_API_KEY=fc-your-cloud-key
```

## Start

```bash
docker compose up -d --build
```

## Access

With default `.env.example` ports:

- Gateway API: `http://localhost:8080`
- Gateway admin UI: `http://localhost:8080/admin`
- Gateway JSON logs: `http://localhost:8080/admin/logs`
- Direct local Firecrawl API: `http://localhost:3002`
- Bull queue UI: `http://localhost:3002/admin/<BULL_AUTH_KEY>/queues`

If your `.env` uses a different `GATEWAY_PORT`, open:

```text
http://localhost:<GATEWAY_PORT>/admin
```

## Test

Basic scrape through the gateway:

```bash
curl -X POST http://localhost:8080/v2/scrape \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://firecrawl.dev"}'
```

Force local-only:

```bash
curl -X POST http://localhost:8080/v2/scrape \
  -H 'Content-Type: application/json' \
  -H 'X-Firecrawl-Route-Mode: local-only' \
  -d '{"url":"https://firecrawl.dev"}'
```

Force Cloud:

```bash
curl -X POST http://localhost:8080/v2/scrape \
  -H 'Content-Type: application/json' \
  -H 'X-Firecrawl-Route-Mode: cloud-first' \
  -d '{"url":"https://firecrawl.dev"}'
```

## Rebuild Gateway After Changes

If you modify files in `gateway/`, rebuild the gateway image:

```bash
docker compose up -d --build gateway
```

Restart without rebuilding:

```bash
docker compose restart gateway
```

## Troubleshooting

Check containers:

```bash
docker compose ps
```

Check gateway logs:

```bash
docker compose logs gateway
```

Check local Firecrawl logs:

```bash
docker compose logs api
```

If the admin UI does not reflect gateway code changes, rebuild the gateway image:

```bash
docker compose up -d --build gateway
```
