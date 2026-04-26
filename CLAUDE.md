# Climb512 Notes

This file is the high-signal project reference for working in this repository.

## Quick start

```bash
docker compose up --build -d
```

Open `http://localhost:8080`.

## Current structure

```text
climb512/
  app/
    src/
      app/
        actions.ts
        page.tsx
        login/page.tsx
        dashboard/page.tsx
        onboarding/page.tsx
        plan/[id]/page.tsx
      components/
        LoginForm.tsx
        EquipmentPicker.tsx
        DashboardClient.tsx
        PlanEditor.tsx
        PlanAdjuster.tsx
        PlanViewer.tsx
        PlanWorkspace.tsx
      lib/
        session.ts
        prisma.ts
        plan-types.ts
        plan-snapshot.ts
        plan-access.ts
        ai-plan-generator.ts
        ai-plan-adjuster.ts
    prisma/
      schema.prisma
      prisma.config.ts
      migrations/
  simulator/
    src/
      server.js
      generate-plan.js
      templates.js
  testing/
    tests/
  docs/
```

## Current product state

- plan storage uses `Plan` + `PlanVersion` JSON snapshots
- user workout history uses `WorkoutLog`
- direct week editing is implemented through `PlanEditor`
- the plan page uses shared hamburger navigation
- edit controls appear only inside `Edit This Week`
- the detailed editor currently shows training days only
- AI plan generation is live
- AI week-adjustment code still exists, but it is experimental and not the primary product direction
- Docker defaults plan generation to the local `simulator` service

## Current data model

```text
User
  -> Plan
     |- currentVersionId -> PlanVersion
     |- PlanVersion[]
     -> WorkoutLog[]
```

`PlanVersion` stores:

- `profileSnapshot`
- `planSnapshot`

`WorkoutLog` stores:

- `planVersionId`
- week/day/session/exercise keys
- prescribed snapshot
- actual performed work

## Commands

```bash
cd app
npx prisma generate
npx tsc --noEmit
npm run build
```

```bash
docker compose up --build -d
docker compose logs web --tail=20
docker compose logs simulator --tail=20
docker compose down
docker compose down -v
```

```bash
cd testing
npx playwright test tests/auth.spec.ts tests/dashboard.spec.ts
npx playwright test tests/onboarding.spec.ts --grep "generates a plan end-to-end"
npx playwright test tests/plan-editor-icons.spec.ts
```

## Architecture notes

- server mutations live in `app/src/app/actions.ts`
- ownership-aware loading and log authorization live in `app/src/lib/plan-access.ts`
- snapshot parsing and shaping live in `app/src/lib/plan-snapshot.ts`
- onboarding generation requests go through `app/src/lib/ai-plan-generator.ts`
- the simulator implements a local OpenAI-compatible backend for plan generation only

## AI notes

- the app uses plain `fetch` to an OpenAI-compatible `/v1/chat/completions` endpoint
- in Docker, `ANTHROPIC_BASE_URL` defaults to `http://simulator:8787`
- outside Docker, `app/.env` may still point to OpenRouter
- the username logging header is only sent to simulator-like local base URLs, not to live provider URLs

## Editing notes

- `PlanEditor` is the main path for future week changes
- saving edits creates a new `PlanVersion`
- logged weeks are protected from structural edits
- add / duplicate / delete controls are icon-driven inside edit mode
- the AI adjuster is still present, but it should be treated as a prototype

## Operational notes

- sessions are boot-scoped and time-limited
- session cookies currently expire after 30 minutes
- recreating the `web` container invalidates prior boot sessions
- `migrate` must complete successfully before `web` starts
- migrations are tracked in `_app_migrations`

## Current cautions

- `npm run lint` is not yet the most reliable automation check
- the simulator is only for plan generation today
- security regression E2E coverage should be rebuilt around the snapshot model
