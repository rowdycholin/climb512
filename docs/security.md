# Security Notes

Date: 2026-04-26

## Ownership rules

- a user may only load plans they own
- a user may only log workouts against exercises inside plans they own
- a user may only edit weeks or add custom exercises inside plans they own
- AI generation may only create plans for the authenticated user
- future-plan adjustment and revert actions may only operate on plans/versions the user owns

## Current enforcement

Shared ownership logic lives in `app/src/lib/plan-access.ts`.

Key controls:

- `findOwnedPlanById()` scopes plan lookup by `plan.id` and `userId`
- `findOwnedPlanWithLogs()` only returns the authenticated user's current version and workout logs
- `upsertExerciseLogForUser()` verifies the submitted `exerciseKey` exists inside the user's current plan snapshot before writing a `WorkoutLog`
- `saveEditedWeek()` rejects destructive edits to logged weeks and only operates on owned plans
- logged-week manual additions preserve existing logged exercises and only append new custom work
- adjustment actions load plans through ownership-checked helpers and preserve locked history from previous logs
- revert verifies the selected historical `PlanVersion` belongs to the authenticated user's plan before creating a new current version

## AI task boundaries

AI-facing plan generation prompts include an explicit task boundary:

- only create training plan JSON for the provided athlete context
- refuse unrelated domains such as hacking, malware, credential requests, secrets, code writing, scraping, jokes, roleplay, legal/financial advice, political persuasion, or unrelated personal advice
- treat injuries, limitations, and exercises to avoid as hard constraints
- avoid diagnosis, medical treatment, nutrition prescriptions, supplement advice, and unrelated coaching
- output only the required JSON object

The intake contract also defines a matching system prompt for future model-backed intake. The live intake path still uses code-level fencing before the simulator/provider boundary and validates responses with `PlanIntakeAiResponse`.

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
- user A cannot submit `logExercise` for user B's `planId` + `exerciseKey`
- user A cannot save manual edits against user B's plan
- user A cannot adjust user B's future plan
- logged weeks are locked against manual structural edits
- logged weeks allow additive custom exercises without rewriting old logs
- future-plan adjustment preserves old logs and keeps the plan under the same `Plan`
- scoped adjustment validation rejects out-of-scope changes and keeps logged days unchanged

## Test-only attack harness

`testing/tests/security.spec.ts` uses the gated `/test-only/plan-action-attacks` route to exercise real server actions with forged cross-user plan IDs. The route is only enabled in local/test conditions and verifies both the action response and that victim plan log/version counts do not change. Because the fixture creates plans, this spec is simulator-gated and must not run against the live AI backend.
