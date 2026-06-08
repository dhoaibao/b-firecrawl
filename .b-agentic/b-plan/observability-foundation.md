---
slug: observability-foundation
status: completed
created_at: 2026-06-08
approved_at: 2026-06-08
approved_by: user
approved_head: 14b7447
risk: medium
touch_points:
  - gateway/src/config.ts
  - gateway/src/server.ts
  - gateway/src/middleware.ts
  - gateway/src/proxy.ts
  - gateway/src/audit-store.ts
  - gateway/src/db/index.ts
  - gateway/package.json
  - docker-compose.yaml
  - docker-compose.prebuilt.yaml
---

# Production Observability & Operability Foundation

## Goal

Make the gateway trustworthy and debuggable in production by adding real health checks, structured logging with request IDs, and strict config validation at boot time.

## Why Now

The gateway currently runs in production with three critical gaps:

1. **Blind health checks** — `/healthz` always returns `{"ok":true}` even when the database is down or local Firecrawl is unreachable. Load balancers and container orchestrators cannot detect actual failure.
2. **Unstructured logging** — All logging uses `console.log`/`console.error` with plain text. There are no request IDs, no log levels, and no machine-parseable format. Debugging a failed request across local → cloud fallback requires manual grep.
3. **Silent config failures** — Invalid environment variables (e.g., `PORT=abc`, `REQUEST_TIMEOUT_MS=-1`) are coerced via `Number()` and produce `NaN` or nonsensical values. The server starts and fails later at runtime.

This plan fixes all three with minimal dependencies and no breaking changes.

## Steps

### Step 1 — Add Zod + Pino dependencies

- **Changes:** `gateway/package.json`
- **Why now:** All downstream steps depend on these packages.
- **Done when:**
  - `zod` and `pino` are in `dependencies`
  - `@types/pino` is not needed (pino ships its own types)
  - `npm install` succeeds in the gateway directory

### Step 2 — Validate config at startup with Zod schema

- **Changes:** `gateway/src/config.ts`
- **Why now:** Fail-fast validation must happen before any middleware or DB connections are initialized.
- **Done when:**
  - A `GatewayConfigSchema` Zod schema exists that validates:
    - `port`: positive integer, default 8080
    - `localBaseUrl`: valid URL string, default `http://api:3002`
    - `cloudBaseUrl`: valid URL string, default `https://api.firecrawl.dev`
    - `cloudApiKey`: string, optional (empty string allowed)
    - `defaultRouteMode`: enum `local-first` | `local-only` | `cloud-first`, default `local-first`
    - `requestTimeoutMs`: positive integer, default 120000
    - `logFile`: non-empty string, default `/data/hybrid-firecrawl-requests.jsonl`
    - `maxBodyBytes`: positive integer, default 5242880
    - `authEnabled`: boolean, default true
    - `databaseUrl`: non-empty string (no default — fail if missing)
    - `sessionSecret`: string, optional (empty allowed, but warn if empty in production)
    - `adminEmail`: string, optional
    - `adminPassword`: string, optional
  - Invalid config prints a clear error and exits with code 1 before `main()` starts
  - `config.ts` still exports a singleton `config` object typed from the schema
  - `npm run typecheck` passes

### Step 3 — Create a logger module with request ID support

- **Changes:** `gateway/src/logger.ts` (new file)
- **Why now:** The logger is a shared dependency for middleware, proxy, and health checks.
- **Done when:**
  - `logger.ts` exports:
    - `rootLogger`: a pino instance with `level` from `LOG_LEVEL` env (default `info`)
    - `childLogger(bindings)`: creates a child logger with additional fields
    - `getRequestLogger(req)`: returns a child logger with `request_id` from header or generated UUID
  - Log format is JSON in production, pretty-printed in development (`NODE_ENV !== 'production'`)
  - Request IDs are read from `x-request-id` header or generated via `crypto.randomUUID()`

### Step 4 — Replace console logging with structured logger

- **Changes:** `gateway/src/middleware.ts`, `gateway/src/server.ts`, `gateway/src/proxy.ts`, `gateway/src/audit-store.ts`
- **Why now:** Once the logger exists, every `console.*` call in the production path should use it.
- **Done when:**
  - `requestLogger` in `middleware.ts` uses the logger instead of `console.log`/`console.error`/`console.warn`, and includes `request_id`, `method`, `url`, `status`, `duration_ms`
  - `server.ts` startup log and shutdown logs use the logger
  - `proxy.ts` logs routing decisions (backend chosen, fallback triggered) at `info` level
  - `audit-store.ts` logs write failures at `error` level instead of silently failing
  - `npm run typecheck` passes

### Step 5 — Add request ID middleware and propagate through proxy

- **Changes:** `gateway/src/middleware.ts`, `gateway/src/proxy.ts`
- **Why now:** Request IDs must be set early in the middleware stack and flow through the entire request lifecycle.
- **Done when:**
  - A `requestIdMiddleware` runs before `requestLogger`, attaching `req.requestId` and setting `x-request-id` response header
  - The proxy handler includes `x-request-id` in upstream requests to both local and cloud backends
  - The `AuditEntry` type gains an optional `request_id` field
  - Audit log entries include the request ID

### Step 6 — Implement real health and readiness endpoints

- **Changes:** `gateway/src/server.ts`, `gateway/src/db/index.ts`
- **Why now:** This is the operability payoff — container orchestrators can make intelligent routing decisions.
- **Done when:**
  - `/health` (liveness): returns `{"status":"ok"}` with HTTP 200, always. No external dependencies checked.
  - `/ready` (readiness): checks DB connectivity (ping query) and returns `{"status":"ready","checks":{"database":"ok"}}` with HTTP 200, or `{"status":"not_ready","checks":{"database":"error","detail":"..."}}` with HTTP 503
  - Both endpoints are excluded from the request logger (too noisy) or logged at `debug` level
  - `gateway/src/db/index.ts` exports a `pingDatabase()` function that runs `SELECT 1`
  - `npm run typecheck` passes

### Step 7 — Update Docker Compose health checks

- **Changes:** `docker-compose.yaml`, `docker-compose.prebuilt.yaml`
- **Why now:** Docker Compose should use the new readiness endpoint for dependency ordering and health checks.
- **Done when:**
  - Both compose files add `healthcheck` to the gateway service using `curl -f http://localhost:8080/ready || exit 1`
  - The gateway service has `depends_on` with `condition: service_healthy` for the `api` service (if supported by compose version)
  - `docker compose config` validates without errors

### Step 8 — Verify end-to-end

- **Changes:** None (verification only)
- **Why now:** Confirm all pieces work together before considering the plan complete.
- **Done when:**
  - `npm run typecheck` passes
  - `npm run build` compiles successfully
  - `npm run dev` starts and:
    - Invalid `PORT=abc` exits with clear error before listening
    - Missing `DATABASE_URL` exits with clear error
    - Valid config starts, logs structured JSON
    - `curl http://localhost:8080/health` returns `{"status":"ok"}`
    - `curl http://localhost:8080/ready` returns `{"status":"ready",...}` when DB is up
    - A proxied request includes `x-request-id` in the response headers

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Pino JSON format breaks existing log parsing | Pino is additive — old `console.*` in graceful shutdown paths can remain until confirmed safe |
| Zod schema is too strict and rejects previously-tolerated config | Schema uses same defaults as current `config.ts`; only truly invalid values (NaN, missing required) are rejected |
| Request ID header conflicts with upstream | Use `x-request-id` (standard); only propagate if present, never overwrite upstream's value |
| Health endpoint added too late in middleware stack | `/health` and `/ready` are registered before `requestLogger` and `rateLimiter` |

## Rollback

- Revert `config.ts` to the old manual coercion (single file change)
- Remove `logger.ts` and restore `console.*` calls (Step 4 changes are isolated)
- Health endpoints are additive — removing them is safe

## Dependencies

- No external infrastructure changes needed
- Docker Hub access for `docker compose build` verification

## Follow-up Work (not in this plan)

- **Metrics:** Prometheus `/metrics` endpoint using `prom-client`
- **Testing:** Vitest + unit tests for `policy.ts` and integration tests for proxy handler
- **Redis rate limiter:** Replace in-memory `Map` with Redis for horizontal scaling
- **Alerting:** Configure alerts on readiness failures, high error rates, fallback spikes
