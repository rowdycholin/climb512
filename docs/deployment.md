# Deployment Guide

## Docker Compose services

| Service | Role |
|---|---|
| `postgres` | PostgreSQL 16 database |
| `migrate` | one-shot SQL migration runner |
| `simulator` | local AI backend simulator for plan generation |
| `web` | Next.js standalone app |
| `plan-worker` | background worker for sequential plan-week generation |

## Startup

```bash
docker compose up --build -d
```

Startup order:

1. `postgres`
2. `migrate`
3. `simulator`
4. `web`
5. `plan-worker`

`web` and `plan-worker` will not start until `migrate` exits successfully.

For local development, use the dev overlay instead:

```bash
bash scripts/start-dev.sh --build
```

That starts the same backing services but bind-mounts `./app` and runs Next dev mode. Do not treat the dev overlay as the production deployment shape.

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

`Plan.startDate` anchors the calendar week/day opened by the plan page.
`Plan.completedAt`, `completionReason`, and `completionNotes` store explicit user completion.
`PlanVersion.effectiveFromDay` stores the absolute plan day where a future adjustment begins.

## Logs

```bash
docker compose logs web --tail=20
docker compose logs plan-worker --tail=50
docker compose logs simulator --tail=50
docker compose logs migrate --tail=50
docker compose logs postgres --tail=50
```

For generation debugging, tail the three moving pieces together:

```bash
docker compose logs -f web plan-worker simulator
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
| `ANTHROPIC_INTAKE_MAX_TOKENS` | guided-intake output cap |
| `ANTHROPIC_ADJUSTMENT_MAX_TOKENS` | adjustment-chat output cap |
| `AI_GUARDRAILS_MODE` | optional NeMo guardrails mode, defaults to `off` |
| `AI_GUARDRAILS_BASE_URL` | optional NeMo Guardrails server URL for guarded intake |
| `PLAN_WORKER_STEP_DELAY_MS` | optional pause between sequential week generations so partial progress is visible |

In Docker, the `web` and `plan-worker` services read backend AI settings from `app/.env`. Copy `app/.env-simulator` or `app/.env-aibackend` to `app/.env`, then recreate `web` and `plan-worker` to switch modes. Do not print or commit real provider API keys.

The NeMo guardrails service is opt-in and uses the `guardrails` Compose profile:

```bash
docker compose --profile guardrails up -d --build guardrails
```

The app should still run normally without this service when `AI_GUARDRAILS_MODE=off`.

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

### Development reset

```bash
bash scripts/start-dev.sh --fresh --build
```

This removes Postgres data plus the dev `node_modules` and `.next` volumes.

## Production notes

- the web tier is stateless and can be horizontally scaled
- the DB should move to a managed Postgres service in production
- TLS should terminate at a reverse proxy or load balancer
- migrations should still run as a separate one-shot job before new app traffic is accepted
- session behavior is intentionally short-lived today: cookies are boot-scoped and expire after 30 minutes of inactivity
- guided intake refreshes the session during active chat exchanges and before plan creation; expired intake sessions redirect back to login
- a real production deployment should explicitly decide whether plan generation points to the simulator or a live provider
- live AI adjustment can produce large JSON responses; choose a model/token cap that can reliably return the full structured proposal or move to a patch-based contract before production scale
