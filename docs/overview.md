# Application Overview

## What It Does

Climb512 generates personalized climbing plans, stores them as versioned snapshots, and lets users log what they actually performed.

Users can:

- register or sign in
- create multiple plans
- create a plan through guided chat intake
- generate a plan from manual onboarding inputs or guided-intake `PlanRequest` answers
- choose a plan start date, including dates in the past for testing
- open plans to the current calendar week/day based on that start date
- see start date, day X of total plan days, and completed-plan status after the final day
- explicitly mark a plan complete, leave completion notes, and reopen it if needed
- log workouts by week and day
- edit a selected week directly, including adding extra trackable exercises after a day has logs
- adjust the future plan from the next unlogged day when the plan is too hard, too easy, or life changes
- move around authenticated screens from a shared menu
- use a shared vertical icon+label menu, with a chat bubble for AI/chat flows and a wrench for manual setup or editing
- preserve history when plans change later

## Core Flow

```text
Register -> AI intake -> Generate plan -> Login later -> Active plan or My Plans -> Log workouts -> Edit days or adjust future plan -> Save new version
```

After login, users with an active plan go directly to that plan. Users with no plans go to guided intake. Users with plans but no active current version go to My Plans.

## Current Product Direction

The current backend is designed around revision-safe plans:

- users have a generated primary key plus unique user ID and email
- plans are versioned
- logs stay attached to the version they came from
- future edits create new `PlanVersion` rows instead of mutating history
- calendar position comes from `Plan.startDate`, not completion state
- broad plan adjustments start from the next unlogged day and preserve previous workout logs

The preferred UX direction is:

- direct editing for day and exercise changes
- mobile-friendly interactions
- AI-style intake focused on producing a generic `PlanRequest`
- AI focused on plan generation from validated inputs
- AI-assisted plan adjustment through a day-level request contract; the first implementation uses deterministic future-plan rewriting until the real AI provider is plugged in

Current editing behavior:

- the pencil icon opens `Edit This Week`
- the chat icon opens `Adjust Plan` for future-plan changes
- day reordering happens in the compact `Day order` list
- detailed editing includes rest days so exercises can be added when a rest day becomes a training day
- add / duplicate / delete actions are icon-based inside the editor

## Technology Stack

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

## Important Operational Notes

In Docker, the app uses the local simulator service for plan generation by default. That keeps normal testing and demos off the paid provider path.

For local development, `docker-compose.dev.yml` bind-mounts `./app` into the web container and runs `next dev`.

Sessions are boot-scoped and currently expire after 30 minutes.
