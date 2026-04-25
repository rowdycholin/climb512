# Security Notes

Date: 2026-04-25

## Ownership rules

- a user may only load plans they own
- a user may only log workouts against exercises inside plans they own
- a user may only edit weeks inside plans they own
- AI generation may only create plans for the authenticated user
- AI week-adjustment prototype actions may only operate on plans the user owns

## Current enforcement

Shared ownership logic lives in [app/src/lib/plan-access.ts](/abs/path/c:/Users/beatt/projects/cursor/climb512/app/src/lib/plan-access.ts).

Key controls:

- `findOwnedPlanById()` scopes plan lookup by `plan.id` and `userId`
- `findOwnedPlanWithLogs()` only returns the authenticated user's current version and workout logs
- `upsertExerciseLogForUser()` verifies the submitted `exerciseKey` exists inside the user's current plan snapshot before writing a `WorkoutLog`
- `saveEditedWeek()` rejects edits to logged weeks and only operates on owned plans

## Snapshot-model implications

The app does not trust relational exercise IDs from a normalized plan tree.

Instead, writes are authorized against:

- `planId`
- authenticated `userId`
- snapshot `exerciseKey`
- the plan's current `PlanVersion`

That keeps unauthorized users from forging writes against another user's plan data even if they guess a key.

## Simulator privacy rule

When the app is pointed at the local simulator, it may send the username in a request header so the simulator logs can show who triggered plan generation.

That username header is not sent to live provider URLs.

## Current gaps

- the older security Playwright spec was tied to deleted tables and has been removed
- security regression coverage should be rebuilt around the snapshot/version model
- the AI week-adjustment prototype is still present and should be treated carefully until that feature is redesigned

## Recommended follow-up tests

- user A cannot open user B's `/plan/[id]`
- user A cannot submit `logExercise` for user B's `planId` + `exerciseKey`
- user A cannot save manual edits against user B's plan
- user A cannot apply AI prototype adjustments to user B's plan
