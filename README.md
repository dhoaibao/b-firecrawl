# Hybrid Firecrawl Self-host

This repository is a deployment-only Firecrawl setup.

It does not contain the Firecrawl source code. It runs published Firecrawl images and adds a lightweight Hybrid Gateway in front of the self-hosted API.

## What Is Included

- `docker-compose.yaml` for Firecrawl self-host services.
- `gateway/` for the Hybrid Firecrawl Gateway.
- `.env.example` with the environment variables needed to run the stack.
- `SELF_HOST.md` with deployment instructions.
- `LICENSE`.

## Runtime Architecture

```text
Client
  |
  v
Hybrid Gateway
  |                         |
  | local-safe              | cloud-only or fallback
  v                         v
Self-hosted Firecrawl       Firecrawl Cloud
```

## Gateway URLs

Default ports from `.env.example`:

- Gateway API: `http://localhost:8080`
- Gateway admin UI: `http://localhost:8080/admin`
- Gateway JSON logs: `http://localhost:8080/admin/logs`
- Direct local Firecrawl API: `http://localhost:3002`
- Firecrawl Bull queue UI: `http://localhost:3002/admin/<BULL_AUTH_KEY>/queues`

If `GATEWAY_PORT` or `PORT` is changed in `.env`, use those ports instead.

## Quick Start

1. Create `.env`:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env`:

   ```env
   FIRECRAWL_API_KEY=fc-your-cloud-key
   BULL_AUTH_KEY=change-this-secret
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=changeme
   SESSION_SECRET=change-me-to-a-long-random-string
   ```

   `FIRECRAWL_API_KEY` is required for Cloud fallback and `cloud-first` mode. It can be left empty if you only use local self-hosted Firecrawl.

3. Start the stack:

   ```bash
   docker compose up -d --build
   ```

4. Log in to the admin UI at `http://localhost:8080/admin` with the admin credentials.

5. Create a virtual API key in the admin UI, then call the gateway:

   ```bash
   curl -X POST http://localhost:8080/v2/scrape \
     -H 'Authorization: Bearer YOUR_API_KEY' \
     -H 'Content-Type: application/json' \
     -d '{"url":"https://firecrawl.dev"}'
   ```

## Authentication

The gateway can operate in two modes:

- **Auth enabled** (`AUTH_ENABLED=true`, default): All API requests must include a valid virtual API key in the `Authorization: Bearer <key>` header. The admin UI requires login.
- **Auth disabled** (`AUTH_ENABLED=false`): The gateway behaves as a transparent proxy without authentication.

### Admin User

On first boot, if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set, an admin user is automatically created. Use these credentials to log in to the admin UI.

### Virtual API Keys

Users can create virtual API keys through the admin UI or the API:

- `POST /admin/api/api-keys` — create a key (returns the plain key once)
- `GET /admin/api/api-keys` — list your keys
- `DELETE /admin/api/api-keys/:id` — revoke a key

### User Management (Admin Only)

Admins can manage users through the admin UI or the API:

- `POST /admin/api/users` — create a user
- `GET /admin/api/users` — list users
- `PATCH /admin/api/users/:id` — update a user
- `DELETE /admin/api/users/:id` — delete a user

## Routing Modes

Set the default in `.env`:

```env
DEFAULT_ROUTE_MODE=local-first
```

Per request, override with:

```text
X-Firecrawl-Route-Mode: local-first | local-only | cloud-first
```

Modes:

- `local-first`: use self-hosted Firecrawl first, then fallback to Cloud for eligible failures.
- `local-only`: never send the request to Cloud.
- `cloud-first`: send API requests to Firecrawl Cloud.

## Gateway Behavior

Local-first handles basic public web use cases locally:

- scrape
- crawl
- batch scrape
- map
- search
- parse

The gateway routes Cloud-only features to Firecrawl Cloud:

- actions
- screenshots
- branding
- agent
- browser sessions
- scrape interact
- monitor
- research proxy
- search feedback

Fallback is blocked for requests with sensitive auth/cookie headers or private/local target URLs.

## Maintenance

After changing files under `gateway/`, rebuild the gateway image:

```bash
docker compose up -d --build gateway
```

Check current containers:

```bash
docker compose ps
```

View gateway logs:

```bash
docker compose logs gateway
```
