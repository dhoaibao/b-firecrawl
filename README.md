# Hybrid Firecrawl Self-host

Deployment-only Firecrawl setup. Runs published Firecrawl images behind a lightweight Hybrid Gateway.

## What Is Included

- `docker-compose.yaml` — Firecrawl self-host services
- `gateway/` — Hybrid Gateway (Express.js + React admin UI)
- `.env.example` — environment variables
- `SELF_HOST.md` — deployment guide
- `LICENSE`

## Architecture

```text
Client
  |
  v
Hybrid Gateway
  |              |
  | local-safe   | cloud-only or fallback
  v              v
Self-hosted     Firecrawl Cloud
Firecrawl
```

## Quick Start

```bash
cp .env.example .env
# Edit .env, then:
docker compose up -d --build
```

Default endpoints:

- Gateway API: `http://localhost:8080`
- Admin UI: `http://localhost:8080/admin`
- Direct local API: `http://localhost:3002`

## Documentation

- [`SELF_HOST.md`](SELF_HOST.md) — full deployment, configuration, and troubleshooting
- [`gateway/README.md`](gateway/README.md) — gateway development, routes, and policy
