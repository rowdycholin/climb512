# Climb512 — Application Overview

## What it does

Climb512 is a web application that generates personalised, AI-driven climbing training plans. A user registers an account, then answers a short questionnaire about their goals, current ability, age, available gym equipment, and how many weeks and days per week they can train. Claude AI uses these inputs to produce a structured day-by-day plan for the full duration. Users can then track each workout by logging actual sets, reps, weights, and notes against each planned exercise.

## Core user flow

```
Register / Login → Dashboard (existing plans) or Onboarding (new user) → AI generates plan → Plan viewer → Log workouts
```

1. **Login / Register** — users create an account (username + password) or sign in. Login redirects to `/dashboard` if plans exist, `/onboarding` if not.
2. **Dashboard** — lists all existing plans with checkboxes for multi-select deletion. "Create New Training Plan" button navigates to onboarding.
3. **Onboarding** — select goals, V-grade range, age, plan length, days/week, gym equipment, discipline
4. **Plan generation** — Claude AI returns a structured JSON plan; app saves it to PostgreSQL
5. **Plan viewer** — week selector (scrollable), collapsible day cards, exercise details with coaching notes
6. **Workout logging** — per-exercise log form: sets done, reps, weight, duration, notes; completion checkbox

## Technology stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, React 18) |
| Language | TypeScript |
| Styling | Tailwind CSS v3 + shadcn/ui (base-ui) |
| Database | PostgreSQL 16 |
| ORM | Prisma 7 (with `@prisma/adapter-pg`) |
| Auth | iron-session (JWT cookie) + bcryptjs password hashing |
| AI | Anthropic Claude via OpenRouter (plain `fetch`, no SDK) |
| Containerisation | Docker + Docker Compose |

## Repository layout

```
climb512/
  app/              Next.js application
  docs/             This documentation
  scripts/          Start/stop helper scripts
  docker-compose.yml
  README.md
  CLAUDE.md         Instructions for Claude Code AI assistant
```

## Key constraints (v1 demo)

- Gym-only — no outdoor or geolocation features
- Multi-user — anyone can register; each user's plans are isolated
- Multiple plans per user are supported; any selection can be deleted at once
- Mobile-first layout (390px primary viewport) but fully usable on desktop
