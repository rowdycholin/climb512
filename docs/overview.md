# Climb512 — Application Overview

## What it does

Climb512 is a web application that generates personalised, AI-driven climbing training plans. A user answers a short questionnaire about their goals, current ability, age, available gym equipment, and how many weeks and days per week they can train. Claude AI uses these inputs to produce a structured day-by-day plan for the full duration. Users can then track each workout by logging actual sets, reps, weights, and notes against each planned exercise.

## Core user flow

```
Login → Onboarding form → AI generates plan → Plan viewer → Log workouts
```

1. **Login** — single demo account (`climber1` / `climbin512!`) with a cookie session
2. **Onboarding** — select goals, V-grade range, age, plan length, days/week, gym equipment
3. **Plan generation** — Claude AI returns a structured JSON plan; app saves it to PostgreSQL
4. **Plan viewer** — week selector (scrollable), collapsible day cards, exercise details
5. **Workout logging** — per-exercise log form: sets done, reps, weight, duration, notes; completion checkbox

## Technology stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, React 18) |
| Language | TypeScript |
| Styling | Tailwind CSS v3 + shadcn/ui (base-ui) |
| Database | PostgreSQL 16 |
| ORM | Prisma 7 (with `@prisma/adapter-pg`) |
| Auth | iron-session (JWT cookie) |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) |
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
- Single hardcoded user — no registration or multi-tenancy yet
- One active plan per user is the intended UX (multiple are stored but only the latest is linked from the dashboard)
- Mobile-first layout (390px primary viewport) but fully usable on desktop
