# Architecture

## System Diagram

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
            |- simulator when app/.env points local <- Docker service: simulator
            \- live provider when app/.env points remote

Plan generation worker                 <- Docker service: plan-worker
  |- polls PlanGenerationJob
  |- generates one plan week per iteration
  |- writes PlanGenerationWeek checkpoints
  \- creates one user-facing PlanVersion when all weeks are ready
```

## Core Request Flows

### Registration And Login

1. New users open `/register`.
2. `register()` validates first name, last name, email, user ID, age, gender, password, and password confirmation.
3. `User.id` is system generated.
4. `User.userId` and `User.email` are unique.
5. Login uses `userId` + password.
6. After login, `getPostLoginPath()` routes users by plan state:
   - active plan with `currentVersionId` -> `/plan/[id]`
   - no plans -> `/intake`
   - plans without an active current version -> `/dashboard`

### Intake, Onboarding, And Plan Creation

1. User starts from `/intake` or `/onboarding`.
2. `/intake` uses `PlanIntakeChat`, `app/src/lib/intake.ts`, and `app/src/lib/plan-request.ts` to guide the user through a one-question-at-a-time interview and build a generic `PlanRequest` behind the scenes.
3. Manual onboarding captures the older climbing-specific plan input fields directly.
4. `createPlan()` or `createPlanFromIntake()` validates auth and loads the registered user's age.
5. Guided intake creates a plan shell plus `PlanGenerationJob`; manual onboarding still submits the legacy `PlanInput` and blocks for a full generated plan.
6. `DisciplineLevelFields` switches grade systems on the manual form:
   - bouldering -> V-scale
   - sport/trad/alpine -> YDS
   - ice -> WI
7. For guided intake, `plan-worker` polls the job and requests one week at a time from the configured AI backend.
8. For manual onboarding, `generatePlanWithAI()` requests full week JSON from the configured AI backend.
9. The app builds:
   - `profileSnapshot`
   - `planSnapshot`
10. A `Plan` row is created with `startDate`.
11. Guided intake stores profile/request context on `PlanGenerationJob.profileSnapshot` while the plan is still generating.
12. Guided intake stores each generated worker week in `PlanGenerationWeek`.
13. When all weeks are ready, the worker creates the first user-facing generated `PlanVersion` and updates `Plan.currentVersionId`.

### Plan Page Load

1. Browser requests `/plan/[id]`.
2. Server reads the session cookie.
3. If unauthenticated, redirect to `/login`.
4. `findOwnedPlanWithLogs()` loads the user's `Plan`, current `PlanVersion`, and `WorkoutLog` rows.
5. `planSnapshot` is parsed and merged with logs into the plan view model.
   - while generation is still in progress, `PlanGenerationWeek` rows are composed for partial display
6. Current week/day is calculated from `Plan.startDate`.
7. Day X of total plan days and completed status are derived from `Plan.startDate` and snapshot week count.
8. If the user explicitly marks the plan complete, `Plan.completedAt` and optional completion notes are used for completion messaging.
9. `PlanPageShell` renders summary actions, the shared menu, completion messaging, and `PlanWorkspace`.
10. `PlanWorkspace` renders the editor, future-plan adjuster, and viewer.
11. If the URL includes a historical `version` query parameter, the plan page rebuilds the view from that version's snapshot, filters logs to that version, and renders the workspace in read-only preview mode.

### Workout Logging

1. User logs or completes an exercise.
2. `logExercise()` receives `planId` and snapshot `exerciseKey`.
3. `upsertExerciseLogForUser()` verifies the exercise belongs to the authenticated user's current plan.
4. A `WorkoutLog` row is created or updated using `(userId, planId, exerciseKey)`.
5. The log stores:
   - `planVersionId`
   - week/day/session/exercise keys
   - `prescribedSnapshot`
   - actual performance fields
6. The viewer preserves the currently expanded day after refresh.

### Manual Plan Editing

1. User opens `Edit This Week` from the pencil icon in the plan summary.
2. The client edits the current week in local state.
3. `saveEditedWeek()` validates the edited week payload.
4. Destructive structural edits to logged weeks are rejected to preserve history.
5. Logged weeks allow additive custom exercises only; existing logged days, sessions, and exercises are preserved.
6. A new `PlanVersion` is created with `changeType = "manual_edit"` or `manual_add_exercise`.
7. `Plan.currentVersionId` advances to the new version.

Current editor behavior:

- day reordering happens in the compact `Day order` list
- detailed exercise editing includes rest days
- adding an exercise to a rest day converts it into a training day
- add / duplicate / delete actions are icon-based
- broad future-plan adjustments remain separate from precise manual day edits

### Future Plan Adjustment

1. User opens `Adjust Plan` from the plan summary.
2. `PlanAdjuster` collects conversational feedback and sends it through the server-backed adjustment chat path.
3. The proposal shows the inferred scope before apply, such as a single day, one week, a date range, or future days from a selected point.
4. Live-provider mode asks the configured AI backend for follow-up questions or a structured proposal; simulator/local mode uses deterministic fixtures for repeatable testing.
5. `applyConfirmedPlanAdjustment()` loads the owned plan, current version, and workout logs.
6. The app builds context with:
   - original plan request/profile context
   - locked logged-day markers
   - current plan snapshot
   - user feedback
   - approved adjustment scope
7. The next unlogged plan day and approved scope determine which days may change.
8. Future days inside scope are rewritten, while locked history and out-of-scope days are validated as unchanged.
9. A new `PlanVersion` is created with `changeType = "ai_chat_adjustment"`, `effectiveFromWeek`, `effectiveFromDay`, and `changeMetadata`.
10. `Plan.currentVersionId` advances, old logs remain tied to their original version, and affected days are highlighted only for the immediate post-apply view.

The current implementation uses live AI proposals when configured for a remote backend and deterministic proposal/rewrite fixtures when configured for simulator/local testing. Server validation remains the final authority in both modes.

## Data Model Strategy

The app intentionally stores plans as versioned JSON documents:

- `User` is the account record
- `Plan` is the stable parent and owns calendar `startDate`
- `Plan.completedAt`, `completionReason`, and `completionNotes` store user-declared completion
- `PlanVersion` stores:
  - `profileSnapshot` JSON
  - `planSnapshot` JSON
  - optional `changeMetadata` JSON for adjustment/revert details
- `PlanGenerationJob` stores worker progress, failure/repair state, and generation profile/request context
- `PlanGenerationWeek` stores one generated week snapshot per worker job/week while generation is in progress
- `WorkoutLog` stores immutable user history tied to a specific version and exercise key

This keeps revision history intact and avoids the complexity of mutating a deep relational week/day/exercise tree in place.

## Main Code Boundaries

### Server

- `app/src/app/actions.ts`
  - auth
  - plan creation
  - plan deletion
  - workout logging
  - manual week save
  - day-level future plan adjustment
  - legacy week-adjustment prototype actions kept for now
- `app/src/lib/plan-access.ts`
  - ownership-aware plan loading
  - snapshot exercise lookup
  - log authorization
  - worker-week composition while generation is in progress
- `app/src/lib/plan-snapshot.ts`
  - snapshot types
  - parsing helpers
  - plan view shaping
- `app/src/lib/plan-calendar.ts`
  - start-date progress and completed-plan calculations
- `app/src/lib/plan-adjustment-request.ts`
  - day-level adjustment request shaping, scoped-change validation, next-unlogged-day calculation, and locked-history validation
- `app/src/lib/plan-adjustment-chat.ts`
  - conversational adjustment state, proposal schema, scope inference helpers, and proposal validation
- `app/src/lib/post-login-route.ts`
  - post-login landing route selection
- `app/src/lib/ai-plan-generator.ts`
  - onboarding and guided-intake -> week generation requests
- `app/src/lib/plan-request.ts`
  - generic plan request schema and compatibility adapter to legacy `PlanInput`
- `app/src/lib/intake.ts`
  - rule-based guided interview state, parsing, and draft validation
- `app/src/lib/ai-plan-adjuster.ts`
  - legacy constrained week-adjustment prototype

### Client

- `RegisterForm`
  - account creation form
- `DisciplineLevelFields`
  - onboarding discipline selection and dynamic grade dropdowns
- `PlanIntakeChat`
  - guided interview UI with hidden structured draft submission
- `PlanPageShell`
  - plan summary
  - pencil / coach actions
  - shared navigation menu
- `PlanWorkspace`
  - coordinates selected week across editor, adjuster, and viewer
- `PlanEditor`
  - direct editing for the selected week, including additive exercises on logged weeks
- `PlanAdjuster`
  - conversational future-plan adjustments with inferred scope, proposal review, and apply confirmation
- `PlanViewer`
  - week tabs, day accordions, workout logging
- `DashboardClient`
  - multi-select plan deletion

## Operational Notes

- sessions are cookie-based, boot-scoped, and expire after 30 minutes of inactivity
- guided intake refreshes the session on each chat exchange and before plan creation so long active chats do not expire mid-flow
- the `migrate` service must succeed before `web` starts
- migrations are raw SQL files tracked in `_app_migrations`
- Docker reads AI backend settings from `app/.env`; copy `app/.env-simulator` or `app/.env-aibackend` to switch modes, then recreate `web` and `plan-worker`
- `docker-compose.dev.yml` overlays the base compose file for local bind-mounted development
