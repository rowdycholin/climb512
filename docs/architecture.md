# Architecture

## System diagram

```text
Browser
  |
  v
Next.js 14 App Router              <- Docker service: web
  |- Server Components
  |- Server Actions
  \- Client Components
       |
       |- iron-session cookie auth
       |- Prisma 7 + pg adapter -> PostgreSQL 16   <- Docker service: postgres
       \- OpenAI-compatible chat completions
            |- simulator in Docker by default       <- Docker service: simulator
            \- live provider when explicitly configured
```

## Core request flows

### Plan page load

1. Browser requests `/plan/[id]`
2. Server reads the session cookie
3. If unauthenticated, redirect to `/login`
4. `findOwnedPlanWithLogs()` loads the user's `Plan`, current `PlanVersion`, and `WorkoutLog` rows
5. `planSnapshot` is parsed and merged with logs into the plan view model
6. `PlanPageShell` renders summary actions, the shared menu, and `PlanWorkspace`
7. `PlanWorkspace` renders the editor, AI adjuster prototype, and viewer

### Plan creation

1. User submits onboarding
2. `createPlan()` validates auth and converts form data to `PlanInput`
3. `generatePlanWithAI()` requests week JSON from the configured AI backend
4. The app builds:
   - `profileSnapshot`
   - `planSnapshot`
5. A `Plan` row is created
6. A first `PlanVersion` row is created with `changeType = "generated"`
7. `Plan.currentVersionId` is updated

### Workout logging

1. User logs or completes an exercise
2. `logExercise()` receives `planId` and snapshot `exerciseKey`
3. `upsertExerciseLogForUser()` verifies the exercise belongs to the authenticated user's current plan
4. A `WorkoutLog` row is created or updated using `(userId, planId, exerciseKey)`
5. The log stores:
   - `planVersionId`
   - week/day/session/exercise keys
   - `prescribedSnapshot`
   - actual performance fields

### Manual plan editing

1. User opens `Edit This Week` from the pencil icon in the plan summary
2. The client edits the current week in local state
3. `saveEditedWeek()` validates the edited week payload
4. Logged weeks are rejected to preserve history
5. A new `PlanVersion` is created with `changeType = "manual_edit"`
6. `Plan.currentVersionId` advances to the new version

Current editor behavior:

- day reordering happens in the compact `Day order` list
- detailed exercise editing is shown only for training days
- add / duplicate / delete actions are icon-based
- AI coaching tools remain separate and secondary

## Data model strategy

The app intentionally stores plans as versioned JSON documents:

- `Plan` is the stable parent
- `PlanVersion` stores:
  - `profileSnapshot` JSON
  - `planSnapshot` JSON
- `WorkoutLog` stores immutable user history tied to a specific version and exercise key

This keeps revision history intact and avoids the complexity of mutating a deep relational week/day/exercise tree in place.

## Main code boundaries

### Server

- `app/src/app/actions.ts`
  - auth
  - plan creation
  - plan deletion
  - workout logging
  - manual week save
  - AI adjustment prototype actions
- `app/src/lib/plan-access.ts`
  - ownership-aware plan loading
  - snapshot exercise lookup
  - log authorization
- `app/src/lib/plan-snapshot.ts`
  - snapshot types
  - parsing helpers
  - plan view shaping
- `app/src/lib/ai-plan-generator.ts`
  - onboarding -> week generation requests
- `app/src/lib/ai-plan-adjuster.ts`
  - constrained AI week-adjustment prototype

### Client

- `PlanPageShell`
  - plan summary
  - pencil / coach actions
  - shared navigation menu
- `PlanWorkspace`
  - coordinates selected week across editor, adjuster, and viewer
- `PlanEditor`
  - direct editing for future weeks
- `PlanAdjuster`
  - AI week-adjustment prototype
- `PlanViewer`
  - week tabs, day accordions, workout logging
- `DashboardClient`
  - multi-select plan deletion

## Operational notes

- sessions are cookie-based, boot-scoped, and currently expire after 30 minutes
- the `migrate` service must succeed before `web` starts
- migrations are raw SQL files tracked in `_app_migrations`
- Docker defaults the app to the local simulator for plan generation
