# Climb512 — AI Climbing Training App

A personalised climbing training plan generator. Fill in your goals, grade, age, equipment and schedule — get a day-by-day plan for 4–16 weeks.

## Quick Start (Docker)

```bash
# From the repo root
docker compose up --build
```

Then open http://localhost:8080

**Login:** `climber1` / `climbin512!`

## What it does

1. **Login** with the demo credentials
2. **Onboarding form** — select goals, current/target grade, age, plan length, days/week, and available equipment (preset + custom)
3. **Plan generation** — a structured day-by-day training plan is generated based on your inputs
4. **Plan viewer** — week-by-week scrollable selector; each week shows all 7 days; click any day to expand/collapse it

## Architecture

```
climb512/
  app/              # Next.js 14 (App Router)
    src/
      app/          # Pages & server actions
      components/   # React components
      lib/          # Prisma client, session, plan generator
    prisma/         # Schema & migrations
  docker-compose.yml
```

- **Auth**: Iron session with hardcoded demo user
- **Database**: PostgreSQL (Docker) + Prisma ORM
- **AI**: Deterministic plan generator (swappable for Claude API)
- **UI**: shadcn/ui + Tailwind CSS

## Scaling to 1000s of users

The Docker Compose setup is single-node but the architecture is ready to scale:

- Replace `docker compose` with Kubernetes / ECS and scale the `web` service horizontally
- Add a connection pooler (PgBouncer) in front of PostgreSQL
- Add Redis for session storage (swap iron-session cookie store)
- The `migrate` service runs once on deploy and is idempotent

## Development (without Docker)

```bash
cd app
npm install
# Set DATABASE_URL in .env to your local PostgreSQL
npx prisma migrate dev
npm run dev
```
