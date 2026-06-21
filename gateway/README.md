# Hybrid Firecrawl Gateway

Professional Express.js + TypeScript gateway for deployment-only Firecrawl self-hosting, with a React admin dashboard.

## Stack

- **Backend**: Express.js + TypeScript
- **Admin UI**: React + Vite + Tailwind CSS
- **Build**: Multi-stage Docker (Node 22 Alpine)

## Routes

- `GET /health` — health check
- `GET /ready` — readiness check (includes database connectivity)
- `GET /admin` — React admin dashboard SPA when `AUTH_ENABLED=true`
- `GET /admin/api/logs` — request history JSON
- `GET /admin/api/data` — request history with totals
- `/v1/*` and `/v2/*` — proxied to local Firecrawl or Firecrawl Cloud

## Routing Modes

Set the initial default with `DEFAULT_ROUTE_MODE`, manage the live default in the Admin UI under **Configure > Routing**, or override per request with:

```text
X-Firecrawl-Route-Mode: local-first | local-only | cloud-first
```

Default is `local-first`.

## Policy

- Basic public scrape/search/crawl/map/parse goes local first.
- Cloud-only features go to Cloud: actions, screenshot, branding, agent, browser, monitor, research, scrape interact, search feedback.
- Local failures can fallback to Cloud for timeouts, connection errors, 5xx, and known unsupported-feature errors.
- Fallback is disabled for `local-only`, sensitive headers/cookies, and private/local target URLs.

## Logs

The gateway writes JSONL audit entries to:

```text
/data/hybrid-firecrawl-requests.jsonl
```

The log stores metadata only, not full request or response bodies.

## Development

```bash
# Install dependencies
npm install

# Run TypeScript compiler
npm run build

# Start server
npm start

# Admin UI (separate)
cd admin-ui
npm install
npm run dev
```

## Docker

The Dockerfile uses multi-stage build:
1. **Builder stage**: builds the React admin UI
2. **Gateway stage**: compiles the TypeScript gateway
3. **Runtime stage**: copies built gateway + admin UI, installs production deps

```bash
docker build -t firecrawl-gateway .
```
