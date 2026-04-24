# Deployment Guide

## Docker Compose services

| Service | Role |
|---|---|
| `postgres` | PostgreSQL 16 database |
| `migrate` | one-shot SQL migration runner |
| `web` | Next.js standalone app |

## Startup

```bash
docker compose up --build -d
```

The startup order is:

1. `postgres`
2. `migrate`
3. `web`

`web` will not start until `migrate` exits successfully.

## Migration behavior

The migration container:

- waits for Postgres to accept connections
- creates `_app_migrations` if needed
- applies each `app/prisma/migrations/*/migration.sql` once
- records applied migration names
- fails fast if any SQL file fails

This is important now that the app depends on the snapshot schema:

- `User`
- `Plan`
- `PlanVersion`
- `WorkoutLog`

## Rebuild / reset

### Normal rebuild

```bash
docker compose up --build -d
```

### Full reset

Use this when the schema changed incompatibly or you want a clean demo DB:

```bash
docker compose down -v
docker compose up --build -d
```

## Logs

```bash
docker compose logs web --tail=20
docker compose logs migrate --tail=50
docker compose logs postgres --tail=50
```

## Environment variables

The app uses these values:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | cookie encryption/signing |
| `ANTHROPIC_API_KEY` | AI provider key |
| `ANTHROPIC_BASE_URL` | provider base URL |
| `ANTHROPIC_MODEL` | model name |
| `ANTHROPIC_MAX_TOKENS` | output cap |

OpenRouter should use:

```text
ANTHROPIC_BASE_URL=https://openrouter.ai/api
```

Do not include `/v1`; the app appends `/v1/chat/completions`.

## Production notes

- the web tier is stateless and can be horizontally scaled
- the DB should move to a managed Postgres service in production
- TLS should terminate at a reverse proxy or load balancer
- migrations should still run as a separate one-shot job before the new app version receives traffic
