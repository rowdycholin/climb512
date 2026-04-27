# Development Guide

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop
- Bash for the `scripts/*.sh` helpers, or use the `.bat` scripts on Windows

## Local Setup

```bash
cd app
npm install
npx prisma generate
```

## Environment

`app/.env` is used for non-Docker local app runs and may contain live-provider defaults, for example:

```bash
DATABASE_URL="postgresql://climber:climber512@localhost:5432/climbapp"
SESSION_SECRET="super-secret-session-key-change-in-production-32chars!!"
ANTHROPIC_API_KEY="sk-or-v1-..."
ANTHROPIC_BASE_URL="https://openrouter.ai/api"
ANTHROPIC_MODEL="anthropic/claude-haiku-4-5"
ANTHROPIC_MAX_TOKENS="5000"
```

In Docker, `docker-compose.yml` overrides the AI base URL so the app talks to the local simulator by default.

## Running The App

### Production-Style Docker

```bash
docker compose up --build -d
docker compose logs web --tail=20
docker compose logs simulator --tail=20
```

Services:

- app: `http://localhost:8080`
- simulator: `http://localhost:8787`

### Development Docker

Use this when actively editing app code:

```bash
bash scripts/start-dev.sh --build
```

Windows alternative:

```bat
scripts\start-dev.bat --build
```

The dev override:

- uses `docker-compose.yml` plus `docker-compose.dev.yml`
- bind-mounts `./app` into `/app`
- keeps `/app/node_modules` in the `web_node_modules` Docker volume
- keeps `/app/.next` in the `web_next_cache` Docker volume
- runs `npm run dev -- --hostname 0.0.0.0 --port 8080`

Useful dev commands:

```bash
bash scripts/stop-dev.sh
bash scripts/start-dev.sh --fresh
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs web -f
```

`--fresh` removes Postgres data plus the dev dependency/cache volumes.

### Next.js Dev Server Outside Docker

If you want the app outside Docker, start PostgreSQL separately and then:

```bash
cd app
npm run dev
```

Note: if you run the app outside Docker and keep `app/.env` unchanged, plan generation may go to the live provider, not the simulator.

## Migrations

Schema changes are managed as raw SQL files in `app/prisma/migrations`.

Workflow:

1. Edit `app/prisma/schema.prisma`
2. Add a new migration folder:
   `app/prisma/migrations/YYYYMMDDHHMMSS_name/migration.sql`
3. Regenerate Prisma:
   `cd app && npx prisma generate`
4. Rebuild production-style Docker or restart dev web as needed

The `migrate` service:

- waits for Postgres
- ensures `_app_migrations` exists
- applies each `migration.sql` exactly once
- fails fast on SQL errors

Apply migrations to the dev stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T web npx prisma generate
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart web
```

If you need a clean DB:

```bash
docker compose down -v
docker compose up --build -d
```

or in dev mode:

```bash
bash scripts/start-dev.sh --fresh --build
```

## Current Schema Model

The app stores plans as snapshots, not relational `Week/Day/Exercise` rows.

- `User` stores account profile data and login identity
- `Plan` is the top-level record and stores `startDate`
- `PlanVersion` stores `profileSnapshot` and `planSnapshot` JSON
- `WorkoutLog` stores performed work against snapshot exercise keys

That means most plan-shape changes now happen in snapshot helpers rather than nested relational writes.

## Core Commands

```bash
cd app
npx prisma generate
npx tsc --noEmit
npm run build
npm run lint
```

`npm run lint` may still require repository-level cleanup before it becomes a dependable automation check. `npm run build` is the more reliable verification command today.

## Common Issues

### Prisma client types are stale

```bash
cd app
npx prisma generate
```

In dev Docker:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T web npx prisma generate
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart web
```

### Docker migration fails on startup

```bash
docker compose logs migrate
```

Typical causes:

- SQL syntax error in a migration
- a migration folder exists without a valid `migration.sql`
- the DB volume is carrying an incompatible old schema

### Source changes are not visible

If using base `docker-compose.yml`, source files are copied into the image at build time. Rebuild with:

```bash
docker compose up --build -d
```

If using `scripts/start-dev.sh`, `./app` is bind-mounted and changes should flow into Next dev without rebuilding.

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
- stale Prisma client after a schema change

### Old session survives longer than expected

Sessions are boot-scoped and time-limited. Recreating the `web` container should invalidate old sessions from a previous boot.

### Direct editing or logging behaves oddly

The first places to inspect are:

- `app/src/lib/plan-snapshot.ts`
- `app/src/lib/plan-access.ts`
- `app/src/components/PlanViewer.tsx`
- `app/src/components/PlanEditor.tsx`

## Tests

Playwright tests live in `testing/`.

```bash
cd testing
npm test
npx playwright test tests/onboarding.spec.ts
npx playwright test tests/plan-start-date.spec.ts
npx playwright test tests/plan-viewer-progress.spec.ts
npx playwright test tests/plan-editor-icons.spec.ts
npx playwright test tests/security.spec.ts
```

Current focused regressions include:

- auth and registration
- dashboard plan links and deletion surface
- onboarding grade-system switching
- plan start date opening the correct calendar day
- preserving an expanded non-Monday day after marking an exercise complete
- plan editor icon actions
- cross-user plan access denial

Global teardown removes generated test users with prefixes such as `pw-*`, `dashplan-*`, `onboard-*`, `progress-*`, and `startdate-*`.

## Current Editing Behavior

- edit controls are visible only inside `Edit This Week`
- the detailed edit cards currently render training days only
- day reordering still lives in the compact `Day order` list
- cross-day moves currently rely on swipe gestures rather than a dropdown
