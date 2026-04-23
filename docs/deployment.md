# Deployment Guide

## Docker Compose (local / single-server)

### Services

| Service | Image | Role |
|---|---|---|
| `postgres` | postgres:16-alpine | Database. Data persisted in `postgres_data` named volume. |
| `migrate` | postgres:16-alpine | One-shot container. Applies `migration.sql` via `psql` then exits. |
| `web` | climb512-web (built from `app/Dockerfile`) | Next.js app. Starts after `migrate` completes. |

### Start

```bash
# From repo root
docker compose up --build -d
```

Use `--build` any time the application code has changed. Without it, Docker reuses the cached image.

### Stop

```bash
docker compose down
```

Data is preserved in the `postgres_data` volume. To also delete data:
```bash
docker compose down -v
```

### Logs

```bash
docker compose logs web          # app logs
docker compose logs web -f       # follow
docker compose logs migrate      # migration output
docker compose logs postgres     # DB logs
```

### Rebuild after code changes

```bash
docker compose up --build -d
```

## Environment variables

The `docker-compose.yml` hardcodes dev credentials. Before any shared or production deployment, move secrets to a `.env` file and reference them:

```yaml
# docker-compose.yml
environment:
  DATABASE_URL: ${DATABASE_URL}
  SESSION_SECRET: ${SESSION_SECRET}
  ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
```

Then create a `.env` at the repo root (never commit it):
```
DATABASE_URL=postgresql://climber:climber512@postgres:5432/climbapp
SESSION_SECRET=<strong-random-secret-min-32-chars>
ANTHROPIC_API_KEY=sk-...
```

**Important:** The `ANTHROPIC_API_KEY` must be added to the `web` service environment in `docker-compose.yml` (or the root `.env`) for AI plan generation to work.

## Dockerfile overview

```
stage: deps     → npm ci (install dependencies)
stage: builder  → copy source, prisma generate, npm run build
stage: runner   → copy .next/standalone + .next/static + prisma engines
                  runs as non-root user "nextjs"
                  CMD: node server.js
```

The standalone output (`output: "standalone"` in `next.config.mjs`) means only `node server.js` is needed — no `node_modules` in the runner stage (except Prisma engines).

## Scaling for production

### Horizontal web scaling

Next.js standalone output is stateless (sessions are in cookies, not server memory). You can run multiple `web` containers behind a load balancer.

```yaml
# docker-compose.yml — simple scaling
web:
  deploy:
    replicas: 3
```

Or deploy to ECS / Cloud Run / Kubernetes with autoscaling.

### Database

Replace the `postgres` Docker service with a managed database:
- AWS RDS (PostgreSQL)
- Google Cloud SQL
- Supabase
- Neon

Update `DATABASE_URL` in the environment. Add PgBouncer for connection pooling if running many web replicas.

### TLS / HTTPS

In production, terminate TLS at a reverse proxy (nginx, Caddy, ALB, Cloudflare) in front of the `web` container. The app itself runs plain HTTP on port 8080.

## Migration strategy

The current migration system is a single `migration.sql` applied via `psql || true` (idempotent — safe to re-run, duplicate constraint errors are ignored). For production:

- Graduate to proper Prisma migrations (`prisma migrate deploy`) by providing a real DB at build time
- Or maintain the manual SQL approach — add new migration files and apply them in order

Never run `prisma migrate dev` in production.
