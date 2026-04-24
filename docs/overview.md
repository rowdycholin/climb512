# Climb512 - Application Overview

## What it does

Climb512 is a web application that generates personalized climbing training plans, stores them as versioned snapshots, and lets users log what they actually did in each workout.

Users:

- register or sign in
- fill out onboarding
- generate an AI plan
- view the plan by week
- log workout performance
- revise the plan over time through new plan versions

## Core user flow

```text
Register / Login -> Dashboard or Onboarding -> Generate plan -> View week -> Log workouts -> Revise future weeks
```

1. Login or register
2. Dashboard lists the user's existing plans
3. Onboarding captures goals, grades, age, equipment, schedule, and discipline
4. AI generates the initial plan
5. The app stores it as `Plan` + `PlanVersion`
6. Users view and log workouts on the plan page
7. Future changes are intended to move toward direct week editing, with AI as optional assistance

## Current product direction

The app now has the right backend foundation for plan revision:

- plans are versioned
- logs remain tied to the version they came from
- future edits can create new versions without corrupting history

Because of that, the preferred UX direction is:

- direct editing for reorder / move / delete / duplicate
- AI used as a coach or helper
- mobile-first interactions that do not depend entirely on drag-and-drop or text prompts

See [plan-editing.md](/abs/path/c:/Users/beatt/projects/cursor/climb512/docs/plan-editing.md) for the proposed editing UX.

## Technology stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 App Router + React 18 |
| Language | TypeScript |
| Styling | Tailwind CSS v3 + shadcn/ui |
| Database | PostgreSQL 16 |
| ORM | Prisma 7 |
| Auth | iron-session + bcryptjs |
| AI | OpenRouter-compatible chat completions via plain `fetch` |
| Containerization | Docker + Docker Compose |

## Key constraints

- gym-focused app
- multi-user ownership isolation
- multiple plans per user
- mobile-first design target
