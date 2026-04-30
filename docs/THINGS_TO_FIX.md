# Things To Fix

This file tracks known cleanup, risk, and follow-up items that are not blocking the current development flow.

## Dependency Audit

- [ ] Review and plan framework dependency updates from `npm audit`.
  - Current audit result: 8 total vulnerabilities, 4 high and 4 moderate.
  - `next` has multiple advisories around denial of service, request handling, image optimizer/cache behavior, and a transitive `postcss` advisory.
  - `eslint-config-next` pulls affected `@next/eslint-plugin-next` / `glob` versions.
  - `glob` has a command injection advisory for its CLI command execution path.
  - `prisma` audit output points through `@prisma/dev` and `@hono/node-server`.
  - Do not blindly run `npm audit fix --force`; npm suggests major-version changes, and the Prisma suggestion appears odd because the project is already on Prisma 7.x while audit suggests `6.19.3`.

## Testing And Tooling

- [x] Add unit tests for invalid AI intake responses.
- [x] Add a Playwright fallback test for invalid AI intake output once the real AI/simulator switch is implemented.
- [ ] Revisit `npm run lint`; it is noted as unreliable in current project notes.

## AI Intake

- [x] Add code-level AI intake fencing before enabling real model-backed intake.
  - Added a local relevance guard so unrelated or unsafe messages are refused before the intake simulator/provider boundary.
  - Added prompt-level task boundaries for future model-backed intake and live plan generation.
  - Kept the AI response limited to the existing `PlanIntakeAiResponse` schema and invalid `ready` output is discarded.
  - Unknown fields are stripped before the app sees validated response data.
  - Added unit coverage for valid responses, invalid responses, unknown fields, unsafe prompts, unrelated prompts, and short valid intake answers.
  - Added Playwright coverage that an unsafe prompt is refused and normal intake can continue.
- [x] Wire the real AI provider into the existing `PlanIntakeAiResponse` contract.
- [x] Ensure sport templates act as minimum required checklists, while the AI can ask additional one-question-at-a-time follow-ups when useful.
- [x] Provide current-date context to AI intake and normalize common relative or ambiguous start dates.
- [ ] Consider adding an `activityContext` / `customFields` escape hatch so `PlanRequest` does not over-constrain unusual activities.
- [x] Store the original `PlanRequest` in a durable plan/version snapshot once generation consumes `PlanRequest` directly.
- [x] Make the simulator use `PlanRequest` fields for event vs ongoing themes, strength support, and injury/avoid-exercise substitutions.

## Plan Adjustment

- [x] Add day-level adjustment metadata such as `PlanVersion.effectiveFromDay`.
- [x] Define the first `PlanAdjustmentRequest` contract and day-level locked-history helpers.
- [x] Keep manual day editing available for additive extra exercises on logged days.
- [x] Add the future plan adjustment flow that preserves logged workouts and adjusts from the next current unlogged day forward.
- [ ] Replace the deterministic future-plan adjustment rules with the real AI provider once the provider contract is ready.

## Plan Lifecycle

- [x] Remove the hidden `worker_generation_started` `PlanVersion` row.
  - Generation context now lives on `PlanGenerationJob.profileSnapshot`.
  - The first user-facing `PlanVersion` is created only when generation completes.
  - Added a migration cleanup path for old hidden shell rows without workout logs.
- [ ] Consider archive / soft-delete for plans before adding user-facing delete.
  - Current database relations use cascade delete, so deleting a `Plan` also deletes its `PlanVersion`, `PlanGenerationJob`, and `WorkoutLog` rows.
  - A user-facing "delete plan" action would currently be destructive to workout history.
  - Prefer an archived/hidden state for normal user cleanup, with hard delete reserved for explicit destructive admin/account-removal flows.
