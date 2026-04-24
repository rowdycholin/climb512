# Architecture

## System diagram

```text
Browser
  |
  v
Next.js 14 App Router           <- Docker service: web
  |- Server Components
  |- Server Actions
  \- Client Components
       |
       |- iron-session cookie auth
       |- Prisma 7 + pg adapter -> PostgreSQL 16   <- Docker service: postgres
       \- OpenRouter-compatible AI API
```

## Core request flows

### Plan page load

1. Browser requests `/plan/[id]`
2. Server reads the session cookie
3. If unauthenticated, redirect to `/login`
4. `findOwnedPlanWithLogs()` loads the user's `Plan`, current `PlanVersion`, and `WorkoutLog` rows
5. `planSnapshot` is parsed and merged with logs into a view model
6. Current week/day is derived from `plan.createdAt`
7. `PlanWorkspace` renders the adjuster plus viewer

### Plan creation

1. User submits onboarding
2. `createPlan()` validates auth and converts form data to `PlanInput`
3. `generatePlanWithAI()` builds weeks from the AI provider
4. The app builds:
   - `profileSnapshot`
   - `planSnapshot`
5. A `Plan` row is created
6. A first `PlanVersion` row is created with `changeType = "generated"`
7. `Plan.currentVersionId` is updated to point at that version

### Workout logging

1. User toggles completion or submits a log form
2. `logExercise()` receives `planId` and snapshot `exerciseKey`
3. `upsertExerciseLogForUser()` verifies the exercise belongs to the authenticated user's current plan
4. A `WorkoutLog` row is created or updated using `(userId, planId, exerciseKey)`
5. The log stores:
   - plan version id
   - week/day/session/exercise keys
   - `prescribedSnapshot`
   - actual performance fields

### AI plan adjustment

1. User selects a week and chooses `reorder` or `difficulty`
2. `suggestPlanAdjustment()` loads the current snapshot week and sends a constrained prompt to the AI provider
3. The proposal is validated against the existing week structure
4. Nothing is saved until the user confirms
5. `applyPlanAdjustment()` creates a new `PlanVersion`
6. `Plan.currentVersionId` advances to the accepted version

## Data model strategy

The app intentionally uses versioned document storage for plans.

- `Plan` is the stable parent record
- `PlanVersion` stores:
  - `profileSnapshot` JSON
  - `planSnapshot` JSON
- `WorkoutLog` stores immutable user history tied to a specific version and exercise key

This keeps revision history intact and makes AI-generated changes safer than mutating deeply normalized week/day/exercise rows in place.

## Main code boundaries

### Server

- `app/src/app/actions.ts`
  - auth
  - plan creation
  - plan deletion
  - workout logging
  - AI adjustment draft/apply
- `app/src/lib/plan-access.ts`
  - ownership-aware plan loading
  - snapshot exercise lookup
  - log upsert authorization
- `app/src/lib/plan-snapshot.ts`
  - snapshot types
  - snapshot parsing
  - plan view shaping
- `app/src/lib/ai-plan-generator.ts`
  - onboarding -> weeks AI generation
- `app/src/lib/ai-plan-adjuster.ts`
  - constrained week adjustments

### Client

- `PlanWorkspace`
  - coordinates selected week between adjuster and viewer
- `PlanAdjuster`
  - draft and apply AI week changes
- `PlanViewer`
  - week tabs, day accordions, workout logging UI
- `DashboardClient`
  - multi-select plan deletion

## Operational notes

- sessions are cookie-based and stateless
- Docker startup depends on the `migrate` service succeeding first
- migrations are raw SQL files tracked in `_app_migrations`
- the app is currently single-node but the web tier is horizontally scalable because session state is not stored in server memory
