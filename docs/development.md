# Development Guide

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop

## Initial setup

```bash
cd app
npm install
npx prisma generate
```

The app expects `app/.env` to provide:

```bash
DATABASE_URL="postgresql://climber:climber512@localhost:5432/climbapp"
SESSION_SECRET="super-secret-session-key-change-in-production-32chars!!"
ANTHROPIC_API_KEY="sk-or-v1-..."
ANTHROPIC_BASE_URL="https://openrouter.ai/api"
ANTHROPIC_MODEL="anthropic/claude-haiku-4-5"
ANTHROPIC_MAX_TOKENS="5000"
```

## Running locally

### Docker-first workflow

```bash
docker compose up --build -d
docker compose logs web --tail=20
```

App: `http://localhost:8080`

### Next.js dev server

If you want the app outside Docker, start PostgreSQL separately and then:

```bash
cd app
npm run dev
```

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

If you need a clean DB because the schema changed incompatibly:

```bash
docker compose down -v
docker compose up --build -d
```

## Current schema model

The app no longer stores plans as relational `Week/Day/Exercise` rows.

Instead:

- `Plan` is the top-level record
- `PlanVersion` stores `profileSnapshot` and `planSnapshot` JSON
- `WorkoutLog` stores actual performed work against snapshot exercise keys

That means most plan-shape changes now happen in snapshot helpers rather than Prisma nested relational writes.

## Core commands

```bash
cd app
npx tsc --noEmit
npm run build
npm run lint
```

## Common issues

### Prisma client types are stale

You changed `schema.prisma` but the generated client still exposes old models.

Fix:

```bash
cd app
npx prisma generate
```

### Docker migration fails on startup

Check:

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
```

Typical causes:

- missing AI key
- malformed model JSON
- provider credit / token limit issues
- failed DB write

### Old session survives code changes unexpectedly

Session invalidation is tied to the running container boot marker. Recreating the app container should invalidate old sessions from a previous boot.

### Logging or plan adjustments behave oddly

Remember that logs and adjustments are now keyed by snapshot exercise/week identifiers, not relational exercise row IDs.

The first places to inspect are:

- `app/src/lib/plan-snapshot.ts`
- `app/src/lib/plan-access.ts`
- `app/src/lib/ai-plan-adjuster.ts`

## Tests

Playwright tests live in `testing/`.

```bash
cd testing
npx playwright test tests/auth.spec.ts tests/dashboard.spec.ts
npx playwright test tests/onboarding.spec.ts --grep "generates a plan end-to-end"
```

Notes:

- the current suite covers auth, dashboard, and onboarding
- a legacy security spec was removed during the snapshot-model refactor because it targeted deleted tables
- security regression coverage should be reintroduced against `Plan`, `PlanVersion`, and `WorkoutLog`
