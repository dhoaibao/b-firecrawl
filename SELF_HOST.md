# Self-host Deployment Guide

This repo is configured for deployment-only Firecrawl self-hosting with a Hybrid Gateway. Firecrawl itself runs from published container images.

## Services

`docker-compose.yaml` starts:

- `gateway`: local policy gateway and admin UI
- `api`: `ghcr.io/firecrawl/firecrawl`
- `playwright-service`: `ghcr.io/firecrawl/playwright-service:latest`
- `nuq-postgres`: `ghcr.io/firecrawl/nuq-postgres:latest`
- `redis`: `redis:alpine`
- `rabbitmq`: `rabbitmq:3-management`

## Required Setup

Create `.env`:

```bash
cp .env.example .env
```

Set at least:

```env
BULL_AUTH_KEY=change-this-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=changeme
SESSION_SECRET=change-me-to-a-long-random-string
```

Set the Firecrawl Cloud API key in the admin UI (`/admin/configure`) if you want Cloud fallback or `cloud-first` routing.

To disable authentication and run the gateway as a transparent proxy:

```env
AUTH_ENABLED=false
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

## Authentication

The gateway operates in two modes:

- **Auth enabled** (`AUTH_ENABLED=true`, default): All API requests must include a valid virtual API key in the `Authorization: Bearer <key>` header. The admin UI requires login.
- **Auth disabled** (`AUTH_ENABLED=false`): The gateway behaves as a transparent proxy without authentication.

### Admin User

On first boot, if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set, an admin user is automatically created. Use these credentials to log in to the admin UI.

### Virtual API Keys

With auth enabled, create virtual API keys through the admin UI or the API:

- `POST /admin/api/api-keys` — create a key (returns the plain key once)
- `GET /admin/api/api-keys` — list your keys
- `DELETE /admin/api/api-keys/:id` — revoke a key

### User Management (Admin Only)

Admins can manage users through the admin UI or the API:

- `POST /admin/api/users` — create a user
- `GET /admin/api/users` — list users
- `PATCH /admin/api/users/:id` — update a user
- `DELETE /admin/api/users/:id` — delete a user

## Test

With auth enabled, first log in to the admin UI at `http://localhost:8080/admin` and create a virtual API key. Then:

```bash
curl -X POST http://localhost:8080/v2/scrape \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://firecrawl.dev"}'
```

Force local-only:

```bash
curl -X POST http://localhost:8080/v2/scrape \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -H 'X-Firecrawl-Route-Mode: local-only' \
  -d '{"url":"https://firecrawl.dev"}'
```

Force Cloud:

```bash
curl -X POST http://localhost:8080/v2/scrape \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -H 'X-Firecrawl-Route-Mode: cloud-first' \
  -d '{"url":"https://firecrawl.dev"}'
```

With auth disabled, omit the `Authorization` header.

## Routing Modes

Set the initial default in `.env`:

```env
DEFAULT_ROUTE_MODE=local-first
```

The live default is managed in the Admin UI under **Configure > Routing** and stored in the database. The env value is only used when no Admin UI value has been saved.

Per request, override with:

```text
X-Firecrawl-Route-Mode: local-first | local-only | cloud-first
```

Modes:

- `local-first`: use self-hosted Firecrawl first, then fallback to Cloud for eligible failures
- `local-only`: never send the request to Cloud
- `cloud-first`: send API requests to Firecrawl Cloud

## Gateway Behavior

Local-first handles basic public web use cases locally:

- scrape
- crawl
- batch scrape
- map
- search
- parse

Cloud-only features are routed to Firecrawl Cloud:

- actions
- screenshots
- branding
- changeTracking
- agent
- browser sessions
- scrape interact
- monitor
- research proxy
- search feedback
- stealth / enhanced proxy

Fallback is blocked for requests with sensitive auth/cookie headers or private/local target URLs.

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
