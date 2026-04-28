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

- [ ] Add unit tests for invalid AI intake responses.
- [ ] Add a Playwright fallback test for invalid AI intake output once the real AI/simulator switch is implemented.
- [ ] Revisit `npm run lint`; it is noted as unreliable in current project notes.

## AI Intake

- [ ] Wire the real AI provider into the existing `PlanIntakeAiResponse` contract.
- [ ] Ensure sport templates act as minimum required checklists, while the AI can ask additional one-question-at-a-time follow-ups when useful.
- [x] Store the original `PlanRequest` in a durable plan/version snapshot once generation consumes `PlanRequest` directly.
- [x] Make the simulator use `PlanRequest` fields for event vs ongoing themes, strength support, and injury/avoid-exercise substitutions.

## Plan Adjustment

- [x] Add day-level adjustment metadata such as `PlanVersion.effectiveFromDay`.
- [x] Define the first `PlanAdjustmentRequest` contract and day-level locked-history helpers.
- [x] Keep manual day editing available for additive extra exercises on logged days.
- [x] Add the future plan adjustment flow that preserves logged workouts and adjusts from the next current unlogged day forward.
- [ ] Replace the deterministic future-plan adjustment rules with the real AI provider once the provider contract is ready.
