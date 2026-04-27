# Climb512

Climb512 is a Next.js climbing training app. It registers users, generates climbing plans, stores those plans as versioned JSON snapshots, lets users log workouts against the exact version they performed, and supports direct editing of future weeks.

## Quick Start

Production-style Docker:

```bash
docker compose up --build -d
```

Development Docker with bind-mounted app source:

```bash
bash scripts/start-dev.sh --build
```

Then open `http://localhost:8080`.

## Current Product Shape

1. Register on `/register` with name, email, user ID, age, and password.
2. Sign in with user ID and password.
3. Fill out onboarding with goals, discipline, grades, start date, schedule, and equipment.
4. Generate a plan.
5. Open the plan to the current calendar week/day based on `Plan.startDate`.
6. View and log workouts week by week.
7. Edit future weeks directly with `Edit This Week`.
8. Save changes as a new `PlanVersion`.

The app still contains an AI adjustment prototype, but the primary editing direction is direct editing first, with AI treated as optional future coaching help.

## Current Architecture

- Framework: Next.js 14 App Router + React 18
- Auth: `iron-session` + `bcryptjs`
- DB: PostgreSQL 16 + Prisma 7
- Storage model:
  - `User` has generated `id`, unique `userId`, unique `email`, profile fields, and password hash
  - `Plan` is the long-lived record and stores `startDate`
  - `PlanVersion` stores `profileSnapshot` and `planSnapshot` JSON
  - `WorkoutLog` stores what the user actually did against snapshot exercise keys
- AI transport: OpenAI-compatible chat completions via plain `fetch`
- Docker default: plan generation is routed to the local `simulator` service, not a paid provider

## Docker Services

- `postgres`: PostgreSQL 16 database
- `migrate`: one-shot SQL migration runner
- `simulator`: local AI backend simulator for plan generation
- `web`: Next.js app

## Useful Commands

```bash
docker compose up --build -d
docker compose logs web --tail=20
docker compose logs simulator --tail=20
docker compose down
docker compose down -v
```

```bash
bash scripts/start-dev.sh --build
bash scripts/stop-dev.sh
```

```bash
cd app
npx prisma generate
npx tsc --noEmit
npm run build
```

```bash
cd testing
npm test
npx playwright test tests/onboarding.spec.ts
npx playwright test tests/plan-start-date.spec.ts
npx playwright test tests/plan-viewer-progress.spec.ts
```

## Documentation

- [docs/overview.md](docs/overview.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/data-model.md](docs/data-model.md)
- [docs/development.md](docs/development.md)
- [docs/deployment.md](docs/deployment.md)
- [docs/ai-integration.md](docs/ai-integration.md)
- [docs/ai-simulator.md](docs/ai-simulator.md)
- [docs/plan-editing.md](docs/plan-editing.md)
