# Climb512 Notes

This file is the high-signal project reference for working in this repository.

## Quick Start

Production-style Docker:

```bash
docker compose up --build -d
```

Development Docker with bind-mounted app source and Next dev mode:

```bash
bash scripts/start-dev.sh --build
```

Open `http://localhost:8080`.

## Current Structure

```text
climb512/
  app/
    src/
      app/
        actions.ts
        page.tsx
        login/page.tsx
        register/page.tsx
        dashboard/page.tsx
        intake/page.tsx
        onboarding/page.tsx
        plan/[id]/page.tsx
      components/
        LoginForm.tsx
        RegisterForm.tsx
        PlanIntakeChat.tsx
        DisciplineLevelFields.tsx
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
        plan-request.ts
        plan-intake-ai.ts
        intake-templates.ts
      plan-snapshot.ts
      plan-access.ts
      plan-adjustment-request.ts
      intake.ts
      ai-plan-generator.ts
      ai-plan-adjuster.ts
      worker/
        plan-generation-worker.ts
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

## Current Product State

- registration is a dedicated `/register` page
- users have a generated primary key plus unique `userId` and unique `email`
- registration captures first name, last name, email, user ID, age, and password
- login and root-page entry route users by plan state: active plan -> `/plan/[id]`, no plans -> `/intake`, plans without an active current version -> `/dashboard`
- registration still lands on `/intake` because new users have no plans
- guided chat intake is available at `/intake`
- manual onboarding remains available at `/onboarding`
- manual onboarding captures goals, discipline, grades, start date, schedule, and equipment
- guided intake builds a generic `PlanRequest` with goals, disciplines, levels, schedule, equipment, strength focus, and injuries/limitations
- guided intake currently has templates for climbing plus strength, running, strength training, and a generic fallback
- guided intake does not show the old Plan Draft/manual setup panel; it keeps the structured draft hidden and chat-driven
- `PlanRequest` is still adapted to legacy `PlanInput` for compatibility snapshots, but guided-intake generation uses the generic request directly
- guided-intake plan creation now stores structured `PlanRequest` JSON, creates a `PlanGenerationJob`, and redirects while the worker generates weeks
- guided intake uses the browser's local date/time zone for relative answers such as `today`
- the magic-wand generate button stays disabled until the hidden draft passes the full `PlanRequest` schema
- onboarding age was removed; plan generation uses the registered user age
- grade dropdowns change by discipline:
  - bouldering: V-scale
  - sport/trad/alpine: YDS
  - ice: WI scale
- plans have a `startDate`; plan pages open to the calendar day/week derived from that date
- plan pages and My Plans show start date, day X of total days, and a derived complete state after the final plan day
- users can explicitly mark a plan complete, add completion notes, and reopen it if needed
- plan storage uses `Plan` + `PlanVersion` JSON snapshots
- plan adjustment requests use an absolute `effectiveFromDay` plan-day number for day-level version metadata
- user workout history uses `WorkoutLog`
- workout completion preserves the currently expanded day after refresh
- direct week editing is implemented through `PlanEditor`
- the plan page uses shared hamburger navigation
- shared navigation uses a vertical icon+label menu: chat bubble for AI chat and wrench for manual setup/editing
- edit controls appear only inside `Edit This Week`
- the detailed editor includes rest days, and adding an exercise to a rest day turns it into a training day
- logged weeks protect existing work but allow additive custom exercises that can be tracked normally
- AI plan generation is live
- a `plan-worker` Docker service can generate plan weeks sequentially from `PlanGenerationJob`
- day-level future plan adjustment is available from the plan page and creates a new `PlanVersion` from the next unlogged plan day forward
- Docker defaults plan generation to the local `simulator` service

## Current Data Model

```text
User
  -> Plan
     |- startDate
     |- completedAt/completionReason/completionNotes
     |- currentVersionId -> PlanVersion
     |- PlanVersion[]
     -> WorkoutLog[]
```

`User` stores:

- generated `id` primary key
- unique `userId`
- `firstName`, `lastName`, unique `email`, `age`
- `passwordHash`

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
npm run test:unit
npx tsc --noEmit
npm run build
```

```bash
cd simulator
npm test
```

```bash
docker compose up --build -d
docker compose logs web --tail=20
docker compose logs plan-worker --tail=20
docker compose logs simulator --tail=20
docker compose down
docker compose down -v
```

```bash
bash scripts/start-dev.sh --build
bash scripts/stop-dev.sh
```

```bash
cd testing
npm test
npx playwright test tests/onboarding.spec.ts
npx playwright test tests/intake.spec.ts
npx playwright test tests/plan-start-date.spec.ts
npx playwright test tests/plan-viewer-progress.spec.ts
```

## Architecture Notes

- server mutations live in `app/src/app/actions.ts`
- ownership-aware loading and log authorization live in `app/src/lib/plan-access.ts`
- plan calendar/day-count helpers live in `app/src/lib/plan-calendar.ts`
- snapshot parsing and shaping live in `app/src/lib/plan-snapshot.ts`
- day-level plan adjustment request helpers live in `app/src/lib/plan-adjustment-request.ts`
- generic request schema and legacy adapter live in `app/src/lib/plan-request.ts`
- guided intake template state and parsing lives in `app/src/lib/intake.ts`
- intake template definitions live in `app/src/lib/intake-templates.ts`
- onboarding and guided-intake generation requests go through `app/src/lib/ai-plan-generator.ts`
- manual onboarding still uses legacy `PlanInput`; guided intake uses the `PlanRequest` worker generation path
- sequential plan-week worker logic lives in `app/src/lib/plan-generation-worker.ts`
- simulator plan generation uses `PlanRequest` fields for sport selection, event vs ongoing themes, strength support, and injury/avoid-exercise substitutions
- the simulator implements a local OpenAI-compatible backend for plan generation only
- `docker-compose.dev.yml` overlays the base compose file for bind-mounted development

## AI Notes

- the app uses plain `fetch` to an OpenAI-compatible `/v1/chat/completions` endpoint
- `/intake` is a guided intake chat; Docker currently forces deterministic local intake, while non-Docker or live-provider mode can use the model-backed `PlanIntakeAiResponse` contract
- AI intake responses are validated in `app/src/lib/plan-intake-ai.ts` before the UI receives draft changes
- in Docker, `ANTHROPIC_BASE_URL` defaults to `http://simulator:8787`
- outside Docker, `app/.env` may still point to OpenRouter
- the simulator logging header uses the session login ID and is only sent to simulator-like local base URLs

## Editing Notes

- `PlanEditor` is the main path for precise day edits
- saving edits creates a new `PlanVersion`
- logged weeks are protected from structural edits
- rest days can be edited and can receive new exercises
- add / duplicate / delete controls are icon-driven inside edit mode
- the future-plan adjuster currently uses deterministic rewriting behind the `PlanAdjustmentRequest` contract; a real AI provider can plug into the same boundary later

## Operational Notes

- sessions are boot-scoped and time-limited
- session cookies currently expire after 30 minutes of inactivity
- guided intake refreshes the session on each chat exchange and redirects expired sessions back to login
- recreating the `web` container invalidates prior boot sessions
- `migrate` must complete successfully before `web` starts
- migrations are tracked in `_app_migrations`
- after schema changes in dev mode, run migrations and regenerate Prisma inside the web container if needed

## Current Cautions

- `npm run lint` is not yet the most reliable automation check
- the simulator is only for plan generation today
- `docker-compose.dev.yml` is for local development; use base `docker-compose.yml` for production-style verification
