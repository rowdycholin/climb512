# Data Model

Schema file: `app/prisma/schema.prisma`

## Model overview

The app now uses a versioned plan model:

```text
User
  └── Plan
        ├── currentVersionId -> PlanVersion
        ├── PlanVersion (1:many)
        └── WorkoutLog (1:many)
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
| id | TEXT (cuid) | PK |
| username | TEXT | Unique |
| passwordHash | TEXT | bcrypt hash |
| createdAt | TIMESTAMP | |
| updatedAt | TIMESTAMP | |

### Plan

The long-lived container for one user plan.

| Column | Type | Notes |
|---|---|---|
| id | TEXT (cuid) | PK |
| userId | TEXT | FK -> User |
| title | TEXT? | Display label, usually `currentGrade -> targetGrade` |
| currentVersionId | TEXT? | FK -> PlanVersion, current active revision |
| createdAt | TIMESTAMP | Used to anchor the current week calculation |
| updatedAt | TIMESTAMP | Updated when a new version becomes current |

### PlanVersion

Stores one full accepted snapshot of the plan and onboarding profile.

| Column | Type | Notes |
|---|---|---|
| id | TEXT (cuid) | PK |
| planId | TEXT | FK -> Plan |
| versionNum | INT | Monotonic within a plan |
| basedOnVersionId | TEXT? | FK -> PlanVersion, parent revision |
| changeType | TEXT | e.g. `generated`, `manual_edit`, `ai_reorder`, `ai_difficulty` |
| changeSummary | TEXT? | Human-readable summary |
| effectiveFromWeek | INT? | First week affected by the revision |
| profileSnapshot | JSONB | Onboarding input snapshot |
| planSnapshot | JSONB | Full week/day/session/exercise snapshot |
| createdAt | TIMESTAMP | |

**Unique constraint:** `(planId, versionNum)`

### WorkoutLog

Stores what the user actually did for one exercise in one plan.

| Column | Type | Notes |
|---|---|---|
| id | TEXT (cuid) | PK |
| userId | TEXT | FK -> User |
| planId | TEXT | FK -> Plan |
| planVersionId | TEXT | FK -> PlanVersion |
| weekNum | INT | Week number from the referenced plan version |
| dayNum | INT | Day number from the referenced plan version |
| sessionKey | TEXT | Stable session key from the snapshot |
| exerciseKey | TEXT | Stable exercise key from the snapshot |
| exerciseName | TEXT | Convenience copy for history views |
| prescribedSnapshot | JSONB | Stored prescription for that exercise at log time |
| setsCompleted | INT? | Actual sets done |
| repsCompleted | TEXT? | Actual reps / time |
| weightUsed | TEXT? | e.g. `10kg`, `bodyweight` |
| durationActual | TEXT? | e.g. `7s`, `20 min` |
| notes | TEXT? | User-entered notes |
| completed | BOOLEAN | Marked complete in the UI |
| loggedAt | TIMESTAMP | Updated on each save |

**Unique constraint:** `(userId, planId, exerciseKey)`

## Snapshot shapes

### `profileSnapshot`

JSON copy of the onboarding form:

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
  "createdAt": "2026-04-24T18:00:00.000Z"
}
```

### `planSnapshot`

Full plan content for one accepted version:

```json
{
  "weeks": [
    {
      "key": "week-1",
      "weekNum": 1,
      "theme": "Foundation",
      "days": [
        {
          "key": "w1-d1",
          "dayNum": 1,
          "dayName": "Monday",
          "focus": "Finger Strength",
          "isRest": false,
          "sessions": [
            {
              "key": "w1-d1-s1-finger-strength",
              "name": "Finger Strength",
              "description": "Short max recruitment session",
              "duration": 45,
              "exercises": [
                {
                  "key": "w1-d1-s1-e1-half-crimp-hangs",
                  "name": "Half-crimp hangs",
                  "sets": "4",
                  "reps": null,
                  "duration": "7s",
                  "rest": "3 min",
                  "notes": "Stay engaged"
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

## How revisions work

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

## Key design rule

Plans are versioned documents.

Logs are immutable facts tied to a specific plan version and snapshot exercise key.
