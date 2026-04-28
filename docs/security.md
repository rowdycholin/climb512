# Security Notes

Date: 2026-04-26

## Ownership rules

- a user may only load plans they own
- a user may only log workouts against exercises inside plans they own
- a user may only edit weeks or add custom exercises inside plans they own
- AI generation may only create plans for the authenticated user
- future-plan adjustment actions may only operate on plans the user owns

## Current enforcement

Shared ownership logic lives in `app/src/lib/plan-access.ts`.

Key controls:

- `findOwnedPlanById()` scopes plan lookup by `plan.id` and `userId`
- `findOwnedPlanWithLogs()` only returns the authenticated user's current version and workout logs
- `upsertExerciseLogForUser()` verifies the submitted `exerciseKey` exists inside the user's current plan snapshot before writing a `WorkoutLog`
- `saveEditedWeek()` rejects destructive edits to logged weeks and only operates on owned plans
- logged-week manual additions preserve existing logged exercises and only append new custom work
- `adjustFuturePlan()` loads plans through ownership-checked helpers and preserves locked history from previous logs

## Snapshot-model implications

The app does not trust relational exercise IDs from a normalized plan tree.

Instead, writes are authorized against:

- `planId`
- authenticated `userId`
- snapshot `exerciseKey`
- the plan's current `PlanVersion`

That keeps unauthorized users from forging writes against another user's plan data even if they guess a key.

## Simulator privacy rule

When the app is pointed at the local simulator, it may send the session login ID in a request header so the simulator logs can show who triggered plan generation.

That login header is not sent to live provider URLs.

## Current regression coverage

- user A cannot open user B's `/plan/[id]`
- plan logging verifies ownership and snapshot exercise membership before writing
- logged weeks are locked against manual structural edits
- logged weeks allow additive custom exercises without rewriting old logs
- future-plan adjustment preserves old logs and keeps the plan under the same `Plan`

## Recommended follow-up tests

- user A cannot submit `logExercise` for user B's `planId` + `exerciseKey`
- user A cannot save manual edits against user B's plan
- user A cannot adjust user B's future plan
