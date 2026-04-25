# Development Guide

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop

## Local setup

```bash
cd app
npm install
npx prisma generate
```

## Environment

`app/.env` is used for non-Docker local app runs and still contains the live-provider defaults, for example:

```bash
DATABASE_URL="postgresql://climber:climber512@localhost:5432/climbapp"
SESSION_SECRET="super-secret-session-key-change-in-production-32chars!!"
ANTHROPIC_API_KEY="sk-or-v1-..."
ANTHROPIC_BASE_URL="https://openrouter.ai/api"
ANTHROPIC_MODEL="anthropic/claude-haiku-4-5"
ANTHROPIC_MAX_TOKENS="5000"
```

In Docker, `docker-compose.yml` overrides the AI base URL so the app talks to the local simulator by default.

## Running the app

### Docker-first workflow

```bash
docker compose up --build -d
docker compose logs web --tail=20
docker compose logs simulator --tail=20
```

Services:

- app: `http://localhost:8080`
- simulator: `http://localhost:8787`

Useful simulator checks:

```bash
curl http://localhost:8787/health
curl http://localhost:8787/config
```

### Next.js dev server

If you want the app outside Docker, start PostgreSQL separately and then:

```bash
cd app
npm run dev
```

Note: if you run the app outside Docker and keep `app/.env` unchanged, plan generation will go to the live provider, not the simulator.

## Migrations

Schema changes are managed as raw SQL files in `app/prisma/migrations`.

Workflow:

1. Edit `app/prisma/schema.prisma`
2. Add a new migration folder:
   `app/prisma/migrations/YYYYMMDDHHMMSS_name/migration.sql`
3. Regenerate Prisma:
   `cd app && npx prisma generate`
4. Rebuild Docker:
   `docker compose up --build -d`

The `migrate` service:

- waits for Postgres
- ensures `_app_migrations` exists
- applies each `migration.sql` exactly once
- fails fast on SQL errors

If you need a clean DB:

```bash
docker compose down -v
docker compose up --build -d
```

## Current schema model

The app stores plans as snapshots, not relational `Week/Day/Exercise` rows.

- `Plan` is the top-level record
- `PlanVersion` stores `profileSnapshot` and `planSnapshot` JSON
- `WorkoutLog` stores performed work against snapshot exercise keys

That means most plan-shape changes now happen in snapshot helpers rather than nested relational writes.

## Core commands

```bash
cd app
npx prisma generate
npx tsc --noEmit
npm run build
npm run lint
```

`npm run lint` may still require repository-level cleanup before it becomes a dependable automation check. `npm run build` is the more reliable verification command today.

## Common issues

### Prisma client types are stale

```bash
cd app
npx prisma generate
```

### Docker migration fails on startup

```bash
docker compose logs migrate
```

Typical causes:

- SQL syntax error in a migration
- a migration folder exists without a valid `migration.sql`
- the DB volume is carrying an incompatible old schema

### Plan generation stays on `/onboarding`

Check:

```bash
docker compose logs web --tail=100
docker compose logs simulator --tail=100
```

Typical causes:

- simulator config not matching expectations
- malformed JSON from the current AI backend
- DB write failure after generation

### Old session survives longer than expected

Sessions are boot-scoped and time-limited. Recreating the `web` container should invalidate old sessions from a previous boot.

### Direct editing or logging behaves oddly

The first places to inspect are:

- `app/src/lib/plan-snapshot.ts`
- `app/src/lib/plan-access.ts`
- `app/src/components/PlanEditor.tsx`

## Tests

Playwright tests live in `testing/`.

```bash
cd testing
npx playwright test tests/auth.spec.ts tests/dashboard.spec.ts
npx playwright test tests/onboarding.spec.ts --grep "generates a plan end-to-end"
```

Notes:

- the current suite covers auth, dashboard, and onboarding
- global teardown removes the shared `climber1` test user after a run
- security regression coverage should be rebuilt around `Plan`, `PlanVersion`, and `WorkoutLog`
