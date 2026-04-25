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
# Copy and configure environment
cp .env.example .env
# Edit .env with your values

# Start services
docker compose build
docker compose up -d

# Health check
curl http://localhost:3002/v0/health/liveness
```

## AI Configuration

Set `OPENAI_BASE_URL` and `MODEL_NAME` to use custom OpenAI-compatible providers:

```bash
OPENAI_BASE_URL=http://your-litelm:4000/v1
MODEL_NAME=opencode-go/kimi-k2.5
MODEL_RETRY_NAME=opencode-go/qwen3.5-plus
```

See `SELF_HOST.md` for full setup and `docs/API_CONTRACT.md` for all env vars.
