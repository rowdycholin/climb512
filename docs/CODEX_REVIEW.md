# CODEX Review

Date: 2026-04-23

Scope: Review of the `climb512` repository with a focus on correctness, security, data integrity, operational readiness, and test coverage.

Note:
- This review was written against the older relational `TrainingProfile -> TrainingPlan -> Week -> Day -> Exercise` model.
- The app now uses `Plan` + `PlanVersion` JSON snapshots plus `WorkoutLog`.
- Findings remain useful as historical context, but schema-specific references below should be read in that context.

## Findings

### 1. Resolved: Any authenticated user can view another user's training plan by guessing its ID

File: [app/src/app/plan/[id]/page.tsx](/c:/Users/beatt/projects/cursor/climb512/app/src/app/plan/[id]/page.tsx:12)

The plan page loads a plan with:

```ts
await prisma.trainingPlan.findUnique({
  where: { id: params.id },
  ...
});
```

There is no ownership check tying the requested plan to `session.userId`. That means any logged-in user who obtains or guesses a valid plan ID can read another user's goals, grade, age, equipment, and exercise history.

Recommendation:
- Change the lookup to enforce `profile.userId === session.userId`.
- Return `notFound()` or a 403-style path when the plan does not belong to the current user.
- Add an end-to-end test proving cross-user access is denied.

Status:
- Resolved on 2026-04-23.
- The plan page now loads through an ownership-checked helper that enforces `profile.userId === session.userId`.
- Unauthorized access returns `notFound()`.
- Playwright coverage was added to verify cross-user plan access is denied.

### 2. Resolved: Exercise logging does not verify that the exercise belongs to the current user

File: [app/src/app/actions.ts](/c:/Users/beatt/projects/cursor/climb512/app/src/app/actions.ts:179)

`logExercise()` trusts the submitted `exerciseId` and immediately performs an upsert keyed by `(exerciseId, userId)`. There is no check that the exercise is part of a plan owned by the logged-in user.

Impact:
- A logged-in user can create or overwrite log entries for another user's exercises if they know an `exerciseId`.
- This is a direct authorization bypass on a mutation endpoint.

Recommendation:
- Load the exercise through `session -> day -> week -> plan -> profile.userId` ownership constraints before upserting.
- Reject unknown or unauthorized exercise IDs.
- Add Playwright coverage for "user A cannot log user B's exercise".

Status:
- Resolved on 2026-04-23.
- Exercise logging now checks whether the exercise belongs to a plan owned by the current user before upserting.
- Unauthorized exercise log writes are rejected.
- Playwright coverage was added to verify cross-user exercise logging is blocked.

### 3. Resolved: Plan creation is not transactional, so failures leave orphaned or incomplete data behind

File: [app/src/app/actions.ts](/c:/Users/beatt/projects/cursor/climb512/app/src/app/actions.ts:85)

`createPlan()` creates the profile first, then calls the AI service, then inserts the nested plan structure row-by-row. If the AI call fails, or if any later insert throws, the database can be left with:

- a `TrainingProfile` that has no plan
- a `TrainingPlan` with only some weeks, days, or sessions inserted

This will be especially painful under intermittent API failures or deploy-time schema drift.

Recommendation:
- Validate and generate the plan data before writing any durable records when possible.
- Wrap the DB writes in a Prisma transaction.
- Consider nested `create` operations or batched inserts instead of long sequential loops.

Status:
- Resolved on 2026-04-23.
- `createPlan()` now generates AI output before durable writes begin.
- Profile and nested plan persistence now run inside a single Prisma transaction using nested creates.
- This removes the orphaned-profile and partial-plan write path called out in the review.

### 4. Resolved: The data model does not enforce user ownership at the database level

File: [app/prisma/schema.prisma](/c:/Users/beatt/projects/cursor/climb512/app/prisma/schema.prisma:16)

`TrainingProfile.userId` and `ExerciseLog.userId` are plain strings, not foreign keys to `User`. The migrations also create the `User` table separately without backfilling relations.

Impact:
- Orphaned data is possible if a user record is deleted or corrupted.
- The database cannot help enforce ownership consistency.
- Future queries become easier to get wrong because integrity only exists in application code.

Recommendation:
- Add explicit Prisma relations from `TrainingProfile` to `User` and from `ExerciseLog` to `User`.
- Add database foreign keys and appropriate `onDelete` behavior.
- Consider uniqueness rules that match the product intent, such as whether a user should have many profiles or one current profile plus many plans.

Status:
- Resolved on 2026-04-23.
- Prisma relations were added from `TrainingProfile` to `User` and from `ExerciseLog` to `User`.
- Database foreign keys and supporting indexes were added in a follow-up migration.
- The migration now fails fast if orphaned ownership rows exist, preventing silent integrity drift.

### 5. Resolved: Docker migration step hides failures and can report success after partial schema application

File: [docker-compose.yml](/c:/Users/beatt/projects/cursor/climb512/docker-compose.yml:15)

The migration container runs:

```sh
psql ... -f $$f || true
```

That `|| true` suppresses migration errors, so Compose can continue even if one or more migrations fail. This can leave the app booting against a partially migrated schema.

Recommendation:
- Remove `|| true` so startup fails fast on schema problems.
- Prefer `prisma migrate deploy` in the app image or a dedicated migration image rather than replaying raw SQL with shell globbing.

Status:
- Resolved on 2026-04-23.
- The Docker migration flow no longer suppresses SQL failures with `|| true`.
- Migrations are now tracked in `_app_migrations`, so previously applied SQL files are not replayed blindly on every startup.
- New migration errors now stop startup instead of being masked.

### 6. Medium: The advertised lint workflow is not automation-safe

File: [app/package.json](/c:/Users/beatt/projects/cursor/climb512/app/package.json:1)

Running `npm run lint` prompts for initial Next.js ESLint setup instead of executing a non-interactive check. That means CI cannot rely on the script, and contributors may assume linting exists when it does not.

Observed on 2026-04-23:
- `npm run lint` launched the interactive `next lint` setup prompt instead of returning lint results.

Recommendation:
- Commit an ESLint config and make `npm run lint` fully non-interactive.
- Add lint to CI once the config is in place.

### 7. Medium: The end-to-end suite depends on the external AI provider, making tests slow and flaky

File: [testing/tests/onboarding.spec.ts](/c:/Users/beatt/projects/cursor/climb512/testing/tests/onboarding.spec.ts:44)

The onboarding happy-path test performs a real plan generation and waits up to 90 seconds. This couples the test suite to API credentials, network availability, token budgets, and model behavior.

Recommendation:
- Mock the AI layer in E2E or route plan generation through a test double.
- Keep one optional smoke test for the live provider if needed, but separate it from the default CI path.

## Additional recommendations

- Replace manual cascade deletion in `cascadeDeletePlan()` with database-level cascades or a transaction-backed deletion strategy. The current loop is slow and failure-prone.
- Add server-side validation for onboarding inputs with Zod before writing records or calling the AI provider.
- Fix the recurring mojibake or encoding artifacts visible in source and docs. This affects prompts, UI labels, and documentation readability.
- Prefer `next/link` over raw `<a href>` for in-app navigation.
- Add tests for the highest-risk gaps:
  - unauthorized plan view
  - unauthorized exercise logging
  - partial failure during plan creation
  - deleting multiple plans with mixed ownership

## Verification notes

- Reviewed the app router pages, server actions, Prisma schema, Docker Compose setup, and Playwright tests.
- `npm run lint` could not complete because the repository has not finished ESLint setup and currently prompts interactively.
- `npm run build` did not complete in this sandbox because Next.js failed with `spawn EPERM`; that result is environment-limited, so it should be rechecked in normal local or CI execution.
