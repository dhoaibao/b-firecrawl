# Hybrid Firecrawl Gateway

Lightweight policy gateway for deployment-only Firecrawl self-hosting.

## Routes

- `GET /healthz` health check
- `GET /admin` request history UI
- `GET /admin/logs` request history JSON
- `/v1/*` and `/v2/*` proxied to local Firecrawl or Firecrawl Cloud

## Routing Modes

Set globally with `DEFAULT_ROUTE_MODE`, or per request with:

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
