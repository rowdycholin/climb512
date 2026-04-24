# Security Notes

Date: 2026-04-24

## Ownership rules

- A user may only load plans they own
- A user may only log workouts against exercises inside plans they own
- AI adjustment proposals may only be generated or applied for plans the user owns

## Current enforcement

Shared ownership logic lives in [app/src/lib/plan-access.ts](/abs/path/c:/Users/beatt/projects/cursor/climb512/app/src/lib/plan-access.ts).

Key controls:

- `findOwnedPlanById()` scopes plan lookup by `plan.id` and `userId`
- `findOwnedPlanWithLogs()` only returns the authenticated user's current version and workout logs
- `upsertExerciseLogForUser()` verifies the submitted `exerciseKey` exists inside the user's current plan snapshot before writing a `WorkoutLog`

## Snapshot-model implications

The app no longer trusts relational exercise IDs from a normalized plan tree.

Instead, writes are authorized against:

- `planId`
- authenticated `userId`
- snapshot `exerciseKey`
- the plan's current `PlanVersion`

That keeps unauthorized users from forging writes against another user's plan data even if they guess a key.

## Current gaps

- the previous security Playwright spec was tied to deleted tables and has been removed
- security regression coverage should be rebuilt around the snapshot/version model

Recommended follow-up tests:

- user A cannot open user B's `/plan/[id]`
- user A cannot submit `logExercise` for user B's `planId` + `exerciseKey`
- user A cannot apply AI adjustments to user B's plan
