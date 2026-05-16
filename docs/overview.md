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
- edit the currently selected day directly, including adding extra trackable exercises after a day has logs
- reorder exercises within the selected day and add extra logging rows when the performed work exceeds the prescription
- adjust the plan through a conversational proposal flow that can target one day, one week, a date range, or future days from a point
- review plan version history, preview older versions in read-only mode, and revert by creating a new current version from an older accepted version
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
- worker generation stores request context on `PlanGenerationJob`, stores in-progress weeks in `PlanGenerationWeek`, and creates one generated user-facing version when complete
- calendar position comes from `Plan.startDate`, not completion state
- broad plan adjustments preserve previous workout logs and validate that only approved unlogged days change

The preferred UX direction is:

- direct editing for day and exercise changes
- mobile-friendly interactions
- coach-led AI intake focused on producing a generic `PlanRequest`
- personalized intake coach naming: Alix for female users, Alex for male or prefer-not-to-say users
- AI focused on plan generation from validated inputs
- AI-assisted plan adjustment through a scoped day-level request contract; live-provider mode can call the AI backend, while simulator/local mode keeps deterministic fixtures for repeatable testing
- richer generated coaching detail is shown separately from trackable workout fields so users can scan the workout quickly and expand the coaching context when needed

Current editing behavior:

- the pencil icon opens `Edit Day`
- the chat icon opens `Adjust Plan` for future-plan changes
- the week view may have multiple days open for reading, but the editor targets the most recently selected/highlighted day
- day reordering is currently removed from the direct editor
- detailed editing is limited to that selected day; adding an exercise to a rest day converts it into a training day
- add / duplicate / delete actions are icon-based inside the editor, with Up/Down controls for same-day exercise ordering
- logging supports structured set/interval/attempt rows, and users can add extra rows for additional performed work

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

In Docker, the app, plan worker, and optional guardrails service read backend AI settings from `app/.env`. Copy `app/.env-simulator`, `app/.env-aibackend`, or `app/.env-aibackend-nemo` to `app/.env`, then recreate the affected containers. The current simulator+NeMo profile uses `ANTHROPIC_BASE_URL=http://simulator:8787`, `ANTHROPIC_MODEL=simulator`, `AI_INTAKE_MODE=simulator`, and `AI_GUARDRAILS_MODE=intake`.

Guided-intake plan generation is sequential in the worker. The worker first creates a full-block strategy, then generates weeks with prior-week summaries so phase progression, load, and recovery stay coherent. Strategy, week, and adjustment model choices remain environment-driven through the `ANTHROPIC_*MODEL` variables documented in `docs/ai-integration.md`.

For local development, `docker-compose.dev.yml` bind-mounts `./app` into the web and plan-worker containers, runs `next dev` for web, and runs the worker from mounted source.

Sessions are boot-scoped and currently expire after 30 minutes.
