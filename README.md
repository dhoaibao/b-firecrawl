# Personal Firecrawl Runtime Fork

This repository is a personal, self-host-focused clone derived from [Firecrawl](https://github.com/firecrawl/firecrawl).

It has been reduced to the core runtime needed to build and run the self-host stack:
- `apps/api`
- `apps/playwright-service-ts`
- `apps/nuq-postgres`
- `docker-compose.yaml`

## Purpose

This repo is intended for running and extending the Firecrawl self-host runtime without the extra SDKs, examples, UI, and project tooling from the upstream monorepo.

## Quick start

```bash
docker compose build
docker compose up -d
```

See `SELF_HOST.md` for setup details and environment configuration.
