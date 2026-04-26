# CODEX Review

Date: 2026-04-23

Scope: Review of the repository with a focus on correctness, security, data integrity, operational readiness, and test coverage.

## Current status

This review was written against the older relational `TrainingProfile -> TrainingPlan -> Week -> Day -> Exercise` model.

The application has since moved to:

- `Plan`
- `PlanVersion`
- `WorkoutLog`

with JSON snapshots for plan storage.

Because of that, many schema-specific details below are historical context rather than a description of the current schema.

## Findings

### 1. Resolved: Any authenticated user can view another user's training plan by guessing its ID

Status:

- resolved on 2026-04-23
- the plan page now loads through ownership-checked helpers
- unauthorized access returns `notFound()`

### 2. Resolved: Exercise logging does not verify that the exercise belongs to the current user

Status:

- resolved on 2026-04-23
- workout logging now verifies the submitted snapshot `exerciseKey` belongs to a plan owned by the current user

### 3. Resolved: Plan creation is not transactional, so failures leave orphaned or incomplete data behind

Status:

- resolved on 2026-04-23
- AI output is generated before durable writes begin
- creation now persists the plan through the snapshot-based flow instead of the older partial relational write path

### 4. Resolved: The data model does not enforce user ownership at the database level

Status:

- resolved on 2026-04-23
- the current schema uses proper relations among `User`, `Plan`, `PlanVersion`, and `WorkoutLog`

### 5. Resolved: Docker migration step hides failures and can report success after partial schema application

Status:

- resolved on 2026-04-23
- SQL failures are no longer masked
- applied migrations are tracked in `_app_migrations`

### 6. Resolved: The advertised lint workflow was not automation-safe

Status:

- resolved on 2026-04-26
- `app/.eslintrc.json` is now committed
- `npm run lint` runs non-interactively and exits normally

Remaining note:

- lint is now automation-safe
- teams may still want to tighten or expand rules over time, but the setup gap itself is closed

### 7. Resolved: The end-to-end suite depended on the external AI provider

Current state:

- Docker now routes plan generation to the local simulator by default
- the onboarding generation test can run against the simulator without paid API calls
- Playwright now runs headlessly by default
- `testing` now has runnable Playwright npm scripts
- CI now starts the simulator-backed Docker stack before running Playwright

Remaining recommendation:

- keep any live-provider smoke checks separate and optional

## Additional recommendations

- continue rebuilding security E2E coverage around `Plan`, `PlanVersion`, and `WorkoutLog`
- clean up remaining documentation drift when product direction changes
- continue moving the plan-editing experience toward direct editing first
- treat the current AI week-adjustment prototype as experimental until the redesign lands
