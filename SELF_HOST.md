# External Firecrawl Deployment Guide

This repository deploys only the Firecrawl Gateway. The Firecrawl API and PostgreSQL database must be hosted and operated separately.

## Services

- `gateway`: this repository's gateway and admin UI
- External Firecrawl instance: configured with `LOCAL_FIRECRAWL_URL`
- Firecrawl Cloud: configured with `FIRECRAWL_CLOUD_URL`
- External PostgreSQL: configured with `DATABASE_URL`

## Configure

```bash
cp .env.example .env
```

Set at least:

```dotenv
LOCAL_FIRECRAWL_URL=https://your-firecrawl-instance.example.com
DATABASE_URL=postgresql://user:password@postgres.example.com:5432/firecrawl_gateway
SESSION_SECRET=replace-with-a-long-random-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-strong-password
```

If the gateway runs in Docker, `LOCAL_FIRECRAWL_URL` must be reachable from the container. Use a resolvable hostname rather than `localhost`.

## Start

Using a local source build:

```bash
docker compose up -d --build
```

Using the published gateway image:

```bash
docker compose -f docker-compose.prebuilt.yaml up -d
```

The gateway is available at `http://localhost:8080` by default. The admin UI is at `/admin` when authentication is enabled.

## Routing

- `local-first`: use the external Firecrawl instance first and fall back to Cloud for eligible requests.
- `local-only`: never send requests to Cloud.
- `cloud-first`: use Cloud first and fall back to the external Firecrawl instance when eligible.

Set the initial mode with `DEFAULT_ROUTE_MODE`, change the live setting in **Configure > Routing**, or override an individual request with:

```text
X-Firecrawl-Route-Mode: local-first | local-only | cloud-first
```

Cloud API keys are managed in the Admin UI and injected only into upstream Cloud requests.

## Troubleshooting

Check gateway status and logs:

```bash
docker compose ps
docker compose logs gateway
curl http://localhost:8080/ready
```

A readiness failure indicates the gateway cannot connect to the configured external PostgreSQL database. Upstream Firecrawl connectivity is visible in gateway request audit logs and response headers.
