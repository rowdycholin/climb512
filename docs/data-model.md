# Data Model

Schema file: `app/prisma/schema.prisma`

## Entity hierarchy

```
TrainingProfile
  └── TrainingPlan (1:many — a profile can have multiple plans)
        └── Week
              └── Day
                    └── DaySession
                          └── Exercise
                                └── ExerciseLog (one per user per exercise)
```

## Tables

### TrainingProfile
Stores the user's inputs from the onboarding form.

| Column | Type | Notes |
|---|---|---|
| id | TEXT (cuid) | PK |
| userId | TEXT | `"demo-user-001"` for demo account |
| goals | TEXT[] | e.g. `["send-project", "improve-finger"]` |
| currentGrade | TEXT | e.g. `"V4"` |
| targetGrade | TEXT | e.g. `"V6"` |
| age | INT | |
| weeksDuration | INT | 4, 8, 12, or 16 |
| daysPerWeek | INT | 2–6 |
| equipment | TEXT[] | e.g. `["hangboard", "bouldering-wall"]` |
| createdAt | TIMESTAMP | |

### TrainingPlan
Links a profile to a set of weeks. A profile can have multiple plans (e.g. re-generated).

| Column | Type | Notes |
|---|---|---|
| id | TEXT (cuid) | PK |
| profileId | TEXT | FK → TrainingProfile |
| createdAt | TIMESTAMP | Used to calculate "current week" on load |

### Week
One week of the training plan.

| Column | Type | Notes |
|---|---|---|
| id | TEXT (cuid) | PK |
| planId | TEXT | FK → TrainingPlan |
| weekNum | INT | 1-based (1, 2, 3…) |
| theme | TEXT | e.g. `"Foundation & Technique"`, `"Deload & Recovery"` |

### Day
One day within a week (always 7 days per week, including rest days).

| Column | Type | Notes |
|---|---|---|
| id | TEXT (cuid) | PK |
| weekId | TEXT | FK → Week |
| dayNum | INT | 1–7 |
| dayName | TEXT | `"Monday"` … `"Sunday"` |
| focus | TEXT | e.g. `"Finger Strength"`, `"Rest & Recovery"` |
| isRest | BOOLEAN | Rest days still have an Active Recovery session |

### DaySession
A named block within a day (e.g. Warm-Up, Climbing Endurance, Cool-Down).

| Column | Type | Notes |
|---|---|---|
| id | TEXT (cuid) | PK |
| dayId | TEXT | FK → Day |
| name | TEXT | e.g. `"Warm-Up"` |
| description | TEXT | One-sentence description of the session block |
| duration | INT | Total minutes for this block |

### Exercise
A single exercise within a session block.

| Column | Type | Notes |
|---|---|---|
| id | TEXT (cuid) | PK |
| sessionId | TEXT | FK → DaySession |
| name | TEXT | e.g. `"Half-crimp hangs"` |
| sets | TEXT? | e.g. `"4"` |
| reps | TEXT? | e.g. `"3–5 attempts"` |
| duration | TEXT? | e.g. `"7s on / 3s off × 6 reps"` |
| rest | TEXT? | e.g. `"3 min between sets"` |
| notes | TEXT? | Coaching cue or modification note |
| order | INT | Display order within the session |

All prescription fields are TEXT (not INT) to accommodate ranges and compound values like `"7s on / 3s off"`.

### ExerciseLog
Records what the user actually did for one exercise. One row per user per exercise (upserted).

| Column | Type | Notes |
|---|---|---|
| id | TEXT (cuid) | PK |
| exerciseId | TEXT | FK → Exercise (CASCADE delete) |
| userId | TEXT | Ties log to a user without a full User table |
| loggedAt | TIMESTAMP | Updated on each save |
| setsCompleted | INT? | Actual sets done |
| repsCompleted | TEXT? | Actual reps / time (free text) |
| weightUsed | TEXT? | e.g. `"10kg"`, `"bodyweight"` |
| durationActual | TEXT? | e.g. `"7s"`, `"22 min"` |
| notes | TEXT? | How it felt, modifications made |
| completed | BOOLEAN | Checkbox — marks the exercise as done |

**Unique constraint:** `(exerciseId, userId)` — one log entry per exercise per user. The `logExercise` server action uses Prisma `upsert` against this constraint.

## Planned fields (not yet implemented)

- `Day.completedAt` — timestamp when user marked entire day done
- `TrainingProfile.notes` — freeform notes from onboarding
- `User` table — when multi-tenancy is added
