# Firecrawl Gateway

Express.js + TypeScript gateway with a React admin dashboard. The gateway layer does not host Firecrawl, PostgreSQL, Redis, or any other Firecrawl runtime service.

## Stack

- **Backend**: Express.js + TypeScript
- **Admin UI**: React + Vite + Tailwind CSS
- **Build**: Multi-stage Docker (Node 22 Alpine)

## Routes

- `GET /health` — health check
- `GET /ready` — readiness check, including database connectivity
- `GET /admin` — React admin dashboard SPA when `AUTH_ENABLED=true`
- `GET /admin/api/logs` — request history JSON
- `GET /admin/api/data` — request history with totals
- `/v1/*` and `/v2/*` — proxied to the configured external Firecrawl instance or Firecrawl Cloud

## Routing Modes

The gateway starts cloud-first. Manage the live default in the Admin UI under **Configure > Routing**, or override per request with:

```text
X-Firecrawl-Route-Mode: local-first | local-only | cloud-first | cloud-only
```

The external Firecrawl URL is configured in the Admin UI. `DATABASE_URL` must point to an externally managed PostgreSQL service.

## Policy

- Core scrape/search/crawl/map/parse and open-source output formats use the external Firecrawl instance first.
- Cloud-managed features go to Cloud: actions, agent, browser/interact, monitor, research index, support and team APIs, feedback, enterprise search options, and enhanced proxies.
- Eligible upstream failures can fall back between the external Firecrawl instance and Cloud, subject to route mode and privacy checks.
- Fallback is disabled for `local-only`, sensitive headers/cookies, and private/local target URLs.

## Development

```bash
npm install
npm run typecheck
npm run build
npm run test

cd admin-ui
npm install
npm run lint
npm run build
```

## Docker

```bash
docker build -t firecrawl-gateway .
```

The image builds the admin UI and gateway, then runs only the gateway process. Configure external Firecrawl and PostgreSQL endpoints at runtime.
