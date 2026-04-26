# Deployment Guide

## Docker Compose services

| Service | Role |
|---|---|
| `postgres` | PostgreSQL 16 database |
| `migrate` | one-shot SQL migration runner |
| `simulator` | local AI backend simulator for plan generation |
| `web` | Next.js standalone app |

## Startup

```bash
docker compose up --build -d
```

Startup order:

1. `postgres`
2. `migrate`
3. `simulator`
4. `web`

`web` will not start until `migrate` exits successfully.

## Migration behavior

The migration container:

- waits for Postgres to accept connections
- creates `_app_migrations` if needed
- applies each `app/prisma/migrations/*/migration.sql` once
- records applied migration names
- fails fast if any SQL file fails

The current application schema depends on:

- `User`
- `Plan`
- `PlanVersion`
- `WorkoutLog`

## Logs

```bash
docker compose logs web --tail=20
docker compose logs simulator --tail=50
docker compose logs migrate --tail=50
docker compose logs postgres --tail=50
```

Useful simulator checks:

```bash
curl http://localhost:8787/health
curl http://localhost:8787/config
```

Useful app check:

```bash
curl -I http://localhost:8080/login
```

## Environment variables

### Web service

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | cookie encryption/signing |
| `ANTHROPIC_API_KEY` | backend auth token |
| `ANTHROPIC_BASE_URL` | AI backend base URL |
| `ANTHROPIC_MODEL` | model name |
| `ANTHROPIC_MAX_TOKENS` | output cap |

In Docker, the `web` service defaults `ANTHROPIC_BASE_URL` to `http://simulator:8787`, so plan generation uses the simulator unless explicitly overridden.

### Simulator service

| Variable | Purpose |
|---|---|
| `PORT` | simulator listen port |
| `AI_SIMULATOR_SEED` | deterministic generation seed |
| `AI_SIMULATOR_SCENARIO` | named scenario such as `baseline` |
| `AI_SIMULATOR_LATENCY_MS` | artificial response delay |
| `AI_SIMULATOR_ERROR_MODE` | error mode such as `none`, `invalid_json`, `truncated_json`, `http_500`, `timeout` |

## Rebuild and reset

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

## Production notes

- the web tier is stateless and can be horizontally scaled
- the DB should move to a managed Postgres service in production
- TLS should terminate at a reverse proxy or load balancer
- migrations should still run as a separate one-shot job before new app traffic is accepted
- session behavior is intentionally short-lived today: cookies are boot-scoped and expire after 30 minutes
- a real production deployment should explicitly decide whether plan generation points to the simulator or a live provider
