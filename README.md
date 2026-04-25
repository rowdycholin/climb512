# Climb512

Climb512 is a Next.js climbing training app. It generates plans, stores them as versioned JSON snapshots, lets users log workouts against the exact version they performed, and supports direct editing of future weeks.

## Quick start

```bash
docker compose up --build -d
```

Then open `http://localhost:8080`.

## Current product shape

1. Register or sign in
2. Fill out onboarding with goals, grades, age, schedule, equipment, and discipline
3. Generate a plan
4. View and log workouts week by week
5. Edit future weeks directly with `Edit This Week`
6. Save changes as a new `PlanVersion`

The app still contains an AI adjustment prototype, but the primary editing direction is now direct editing first, with AI treated as optional future coaching help.

## Current architecture

- Framework: Next.js 14 App Router + React 18
- Auth: `iron-session` + `bcryptjs`
- DB: PostgreSQL 16 + Prisma 7
- Storage model:
  - `Plan` is the long-lived record
  - `PlanVersion` stores `profileSnapshot` and `planSnapshot` JSON
  - `WorkoutLog` stores what the user actually did against snapshot exercise keys
- AI transport: OpenAI-compatible chat completions via plain `fetch`
- Docker default: plan generation is routed to the local `simulator` service, not a paid provider

## Docker services

- `postgres`: database
- `migrate`: one-shot SQL migration runner
- `simulator`: local AI backend simulator for plan generation
- `web`: Next.js app

## Useful commands

```bash
docker compose up --build -d
docker compose logs web --tail=20
docker compose logs simulator --tail=20
docker compose down
docker compose down -v
```

```bash
cd app
npx prisma generate
npx tsc --noEmit
npm run build
```

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
- [docs/ai-simulator.md](/abs/path/c:/Users/beatt/projects/cursor/climb512/docs/ai-simulator.md)
- [docs/plan-editing.md](/abs/path/c:/Users/beatt/projects/cursor/climb512/docs/plan-editing.md)
