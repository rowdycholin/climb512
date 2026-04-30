# Data Model

Schema file: `app/prisma/schema.prisma`

## Model Overview

The app uses a versioned plan model:

```text
User
  -> Plan
     |- startDate
     |- generationStatus/generationError/generatedWeeks
     |- completedAt/completionReason/completionNotes
     |- currentVersionId -> PlanVersion
     |- PlanVersion (1:many)
     |- PlanGenerationJob (1:many)
     |- PlanGenerationWeek (1:many)
     -> WorkoutLog (1:many)
```

Instead of storing weeks, days, sessions, and exercises as separate relational rows, each accepted plan revision is stored as a JSON snapshot on `PlanVersion`.

That gives the app:

- immutable plan history
- safer future revisions
- simpler diff / approval flows
- durable workout logs tied to the exact plan version they came from

## Tables

### User

Stores registered app users.

| Column | Type | Notes |
|---|---|---|
| id | TEXT/cuid | Primary key, system generated |
| userId | TEXT | Unique login identifier |
| firstName | TEXT | |
| lastName | TEXT | |
| email | TEXT | Unique |
| age | INTEGER | Captured at registration and reused for plan generation |
| gender | TEXT | `male`, `female`, or `prefer_not_to_say`; used only to choose the intake coach name |
| passwordHash | TEXT | bcrypt hash |
| createdAt | TIMESTAMPTZ | |

### Plan

The long-lived container for one user plan.

| Column | Type | Notes |
|---|---|---|
| id | TEXT/cuid | Primary key |
| userId | TEXT | FK -> User.id |
| title | TEXT? | Display label, usually `currentGrade -> targetGrade` |
| currentVersionId | TEXT? | FK -> PlanVersion, current active revision |
| startDate | TIMESTAMPTZ | Calendar anchor for Week 1 Day 1 |
| generationStatus | TEXT | `ready`, `generating`, `pending`, or `failed` |
| generationError | TEXT? | Last worker generation error |
| generatedWeeks | INTEGER | Number of generated weeks currently available |
| completedAt | TIMESTAMPTZ? | User-declared plan completion timestamp |
| completionReason | TEXT? | Reason selected when marking complete |
| completionNotes | TEXT? | Optional completion notes for future reference |
| createdAt | TIMESTAMPTZ | Creation timestamp |
| updatedAt | TIMESTAMPTZ | Updated when a new version becomes current |

`startDate` controls which week/day opens by default on the plan page. It can be in the past for development and testing. `completedAt` is set only when the user explicitly marks a plan complete; plans can also appear complete when the calendar passes the final plan day.

The generation fields are foundation data for sequential worker-based generation. Existing all-at-once generation paths mark plans `ready` and keep `generatedWeeks` aligned to the current snapshot week count.

### PlanGenerationJob

Durable worker state for generating missing plan weeks one at a time.
Completed rows remain as durable generation history and debugging context.

| Column | Type | Notes |
|---|---|---|
| id | TEXT/cuid | Primary key |
| planId | TEXT | FK -> Plan |
| userId | TEXT | FK -> User.id |
| status | TEXT | `pending`, `generating`, `ready`, or `failed` |
| totalWeeks | INTEGER | Total target weeks for the plan |
| nextWeekNum | INTEGER | Next week the worker should generate |
| lastError | TEXT? | Last unrecovered generation error |
| repairNotes | TEXT? | Future repair-chat guidance |
| profileSnapshot | JSONB | Generation/profile context, including guided-intake `planRequest` while the first version is being generated |
| lockedAt | TIMESTAMPTZ? | Worker lock timestamp |
| createdAt | TIMESTAMPTZ | |
| updatedAt | TIMESTAMPTZ | |

### PlanGenerationWeek

Stores one generated week snapshot while a worker job is still building the plan.

| Column | Type | Notes |
|---|---|---|
| id | TEXT/cuid | Primary key |
| jobId | TEXT | FK -> PlanGenerationJob |
| planId | TEXT | FK -> Plan |
| userId | TEXT | FK -> User.id |
| weekNum | INTEGER | Generated week number |
| weekSnapshot | JSONB | One normalized generated week |
| createdAt | TIMESTAMPTZ | |
| updatedAt | TIMESTAMPTZ | |

Unique constraint: `(jobId, weekNum)`

The plan page composes these rows for partial display while `Plan.generationStatus` is still `generating`. Once every week is ready, the worker creates the first user-facing generated `PlanVersion`.

### PlanVersion

Stores one full accepted snapshot of the plan and the profile inputs used to create or revise it.

| Column | Type | Notes |
|---|---|---|
| id | TEXT/cuid | Primary key |
| planId | TEXT | FK -> Plan |
| versionNum | INTEGER | Monotonic within a plan |
| basedOnVersionId | TEXT? | FK -> PlanVersion, parent revision |
| changeType | TEXT | e.g. `generated`, `manual_edit`, `manual_add_exercise`, `ai_future_adjustment` |
| changeSummary | TEXT? | Human-readable summary |
| effectiveFromWeek | INTEGER? | First week affected by the revision |
| effectiveFromDay | INTEGER? | Absolute plan day where a day-level adjustment begins |
| profileSnapshot | JSONB | Profile/request context for the accepted version |
| planSnapshot | JSONB | Full week/day/session/exercise snapshot |
| changeMetadata | JSONB? | Adjustment/revert details such as affected days, approved scope, or selected version |
| createdAt | TIMESTAMPTZ | |

Unique constraint: `(planId, versionNum)`

### WorkoutLog

Stores what the user actually did for one exercise in one plan.

| Column | Type | Notes |
|---|---|---|
| id | TEXT/cuid | Primary key |
| userId | TEXT | FK -> User.id |
| planId | TEXT | FK -> Plan |
| planVersionId | TEXT | FK -> PlanVersion |
| weekNum | INTEGER | Week number from the referenced plan version |
| dayNum | INTEGER | Day number from the referenced plan version |
| sessionKey | TEXT | Stable session key from the snapshot |
| exerciseKey | TEXT | Stable exercise key from the snapshot |
| exerciseName | TEXT | Convenience copy for history views |
| prescribedSnapshot | JSONB | Stored prescription for that exercise at log time |
| setsCompleted | INTEGER? | Actual sets done |
| repsCompleted | TEXT? | Actual reps / time |
| weightUsed | TEXT? | e.g. `10kg`, `bodyweight` |
| durationActual | TEXT? | e.g. `7s`, `20 min` |
| notes | TEXT? | User-entered notes |
| completed | BOOLEAN | Marked complete in the UI |
| loggedAt | TIMESTAMPTZ | Updated on each save |

Unique constraint: `(userId, planId, exerciseKey)`

## Snapshot Shapes

### `profileSnapshot`

JSON copy of the plan-generation inputs:

```json
{
  "goals": ["send-project"],
  "currentGrade": "V4",
  "targetGrade": "V6",
  "age": 28,
  "weeksDuration": 4,
  "daysPerWeek": 2,
  "equipment": ["hangboard"],
  "discipline": "bouldering",
  "createdAt": "2026-04-26T18:00:00.000Z"
}
```

Notes:

- `age` comes from the registered user record, not the onboarding or guided-intake form.
- guided intake builds a generic `PlanRequest`; while worker generation is in progress it lives on `PlanGenerationJob.profileSnapshot.planRequest`, then moves into the first generated `PlanVersion.profileSnapshot.planRequest`.
- manual onboarding still stores the legacy input shape for compatibility.
- `PlanRequest` includes fields such as sport, disciplines, goal type, goal description, target date, strength training, and injuries/limitations.
- `startDate` is stored on `Plan`, not in `profileSnapshot`.
- Date/time columns use PostgreSQL `TIMESTAMPTZ(3)`. The Docker database timezone is UTC.

### `planSnapshot`

Full plan content for one accepted version:

```json
{
  "weeks": [
    {
      "key": "week-1",
      "weekNum": 1,
      "theme": "Foundation & Control",
      "days": [
        {
          "key": "w1-d1",
          "dayNum": 1,
          "dayName": "Monday",
          "focus": "Limit Bouldering",
          "isRest": false,
          "sessions": [
            {
              "key": "w1-d1-s1-limit-bouldering",
              "name": "Power Session",
              "description": "Build max strength on short hard problems.",
              "duration": 55,
              "exercises": [
                {
                  "key": "w1-d1-s1-e1-warm-up-traverses",
                  "name": "Warm-up Traverses",
                  "sets": "2",
                  "reps": null,
                  "duration": "3 min",
                  "rest": "1 min",
                  "notes": "Easy movement, build blood flow"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

Planned rich coaching detail:

- The current snapshot shape is intentionally compact and trackable.
- Future optional fields may include `week.summary`, `week.progressionNote`, `day.coachNotes`, `session.objective`, `session.intensity`, `session.warmup`, `session.cooldown`, and `exercise.modifications`.
- These fields should remain optional so old snapshots continue to parse.
- Rich coaching text should stay separate from trackable logging fields such as sets, reps, duration, rest, and exercise keys.

## Calendar Position

The plan page opens to a week/day from `Plan.startDate`:

```text
daysSinceStart = today - startDate
currentWeekIndex = floor(daysSinceStart / 7)
currentDayIndex = daysSinceStart % 7
```

Values are clamped to the plan range. Completion state does not determine the current day.

## How Revisions Work

When a user accepts a plan change:

1. the existing `Plan` stays the same
2. a new `PlanVersion` row is created
3. `Plan.currentVersionId` is updated to point at that new version
4. old `WorkoutLog` rows remain attached to the earlier version they were logged against

This means a user can:

- log Weeks 1-3 on Version 1
- save a Week 4+ edit or accept a future AI-driven revision
- continue on Version 2
- still review their old Week 1-3 prescribed work and logged performance later

Day-level future adjustments use `PlanVersion.effectiveFromDay`, where day 1 is Week 1 Day 1 and day 8 is Week 2 Day 1. Interactive adjustments also store structured details in `PlanVersion.changeMetadata`, including affected day refs and approved scope. The app validates that logged historical days and out-of-scope days are not changed by an adjusted version.

## Key Design Rule

Plans are versioned documents.

Logs are immutable facts tied to a specific plan version and snapshot exercise key.
