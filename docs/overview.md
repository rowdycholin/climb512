# Application Overview

## What it does

Climb512 generates personalized climbing plans, stores them as versioned snapshots, and lets users log what they actually performed.

Users can:

- register or sign in
- create multiple plans
- generate a plan from onboarding inputs
- log workouts by week and day
- edit future weeks directly
- move around the authenticated screens from a shared menu
- preserve history when plans change later

## Core flow

```text
Register / Login -> Dashboard or Onboarding -> Generate plan -> View week -> Log workouts -> Edit future weeks -> Save new version
```

## Current product direction

The current backend is designed around revision-safe plans:

- plans are versioned
- logs stay attached to the version they came from
- future edits create new `PlanVersion` rows instead of mutating history

The preferred UX direction is:

- direct editing for day and exercise changes
- mobile-friendly interactions
- AI focused on plan generation
- AI-assisted week adjustments treated as experimental and likely to be redesigned later

Current editing behavior:

- the pencil icon opens `Edit This Week`
- day reordering happens in the compact `Day order` list
- detailed editing currently renders training days only
- add / duplicate / delete actions are icon-based inside the editor

## Technology stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 App Router + React 18 |
| Language | TypeScript |
| Styling | Tailwind CSS v3 + shadcn/ui |
| Database | PostgreSQL 16 |
| ORM | Prisma 7 |
| Auth | iron-session + bcryptjs |
| AI transport | OpenAI-compatible chat completions via plain `fetch` |
| Test stack | Playwright |
| Containers | Docker Compose |

## Important operational note

In Docker, the app currently uses the local simulator service for plan generation by default. That keeps normal testing and demos off the paid provider path.

Sessions are also boot-scoped and currently expire after 30 minutes.
