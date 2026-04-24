# Climb512 - AI Climbing Training App

Climb512 is a Next.js app that generates personalized climbing plans, stores them as versioned JSON snapshots, and lets users log workouts against the exact plan version they performed.

## Quick start

```bash
docker compose up --build -d
```

Then open `http://localhost:8080`.

Register a user on the login page. There are no hardcoded app credentials.

## What it does

1. Register or sign in
2. Fill out onboarding with goals, grades, age, schedule, equipment, and discipline
3. Generate an AI plan
4. View and log workouts week by week
5. Ask AI to reorder a week or adjust difficulty
6. Accept changes as a new plan version

## Current architecture

- Framework: Next.js 14 App Router + React 18
- Auth: `iron-session` cookie auth + `bcryptjs`
- DB: PostgreSQL 16 + Prisma 7
- AI: OpenRouter-compatible chat completions via plain `fetch`
- Storage model:
  - `Plan` is the long-lived container
  - `PlanVersion` stores `profileSnapshot` and `planSnapshot` JSON
  - `WorkoutLog` stores what the user actually did against snapshot exercise keys

See [docs/data-model.md](/abs/path/c:/Users/beatt/projects/cursor/climb512/docs/data-model.md) for the full schema and snapshot shapes.

## Development

```bash
cd app
npm install
npx prisma generate
npx tsc --noEmit
npm run build
```

## Docker workflow

```bash
docker compose up --build -d
docker compose logs web --tail=20
docker compose down
docker compose down -v
```

The `migrate` container replays SQL migration files from `app/prisma/migrations` and records applied files in `_app_migrations`.

## Tests

The Playwright suite lives in `testing/`.

```bash
cd testing
npx playwright test tests/auth.spec.ts tests/dashboard.spec.ts
npx playwright test tests/onboarding.spec.ts --grep "generates a plan end-to-end"
```

## Documentation

- [docs/overview.md](/abs/path/c:/Users/beatt/projects/cursor/climb512/docs/overview.md)
- [docs/architecture.md](/abs/path/c:/Users/beatt/projects/cursor/climb512/docs/architecture.md)
- [docs/data-model.md](/abs/path/c:/Users/beatt/projects/cursor/climb512/docs/data-model.md)
- [docs/development.md](/abs/path/c:/Users/beatt/projects/cursor/climb512/docs/development.md)
- [docs/deployment.md](/abs/path/c:/Users/beatt/projects/cursor/climb512/docs/deployment.md)
- [docs/ai-integration.md](/abs/path/c:/Users/beatt/projects/cursor/climb512/docs/ai-integration.md)
