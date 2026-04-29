# AI Plan Chat Roadmap

This document tracks the move from a climbing-specific onboarding form toward an AI-assisted plan chat that can support climbing, weight training, and later other sports.

The goal is to move carefully:

1. keep the app working at every step
2. avoid throwaway sport-specific parsing
3. make the AI chat guided but not hard-coded to one sport
4. keep structured JSON as the contract between chat, generation, and storage
5. preserve workout history when a user adjusts a plan
6. test each step before moving to the next one

## Current State

- [x] Manual onboarding still works for climbing plans.
- [x] Guided intake exists at `/intake`.
- [x] Guided intake asks one question at a time.
- [x] Guided intake builds a generic `PlanRequest`.
- [x] Guided intake includes event goals and ongoing goals.
- [x] Guided intake includes injuries, limitations, and exercises to avoid.
- [x] Guided intake includes weight training as part of a climbing-support plan.
- [x] Guided intake creates a `PlanGenerationJob` from `PlanRequest` and the worker generates the plan.
- [x] Manual onboarding still uses the legacy climbing-shaped `PlanInput`.
- [x] Playwright regression exists for guided intake and plan generation.
- [x] Manual onboarding still exists, but the product direction is to replace it with AI intake.

Current important files:

- `app/src/lib/plan-request.ts`
- `app/src/lib/plan-intake-ai.ts`
- `app/src/lib/intake-templates.ts`
- `app/src/lib/intake.ts`
- `app/src/components/PlanIntakeChat.tsx`
- `app/src/lib/ai-plan-generator.ts`
- `app/src/lib/plan-intake-ai.test.ts`
- `simulator/src/generate-plan.js`
- `testing/tests/intake.spec.ts`

## Decided Approach

### Use AI For Conversation, Not Hidden State

The AI chat should feel conversational and guided, but the app should remain in control of the durable state.

The app should send the AI:

- a system instruction that explains the app is building a training plan request
- the active intake template or interview profile
- the current `PlanRequest` draft
- conversation history
- the required JSON response schema
- any validation errors from the previous response

The AI should respond with one of two structured states:

```json
{
  "status": "needs_more_info",
  "message": "Great goal. What equipment do you have access to?",
  "planRequestDraft": {}
}
```

```json
{
  "status": "ready",
  "message": "I have enough to draft the plan. Please review this before I generate it.",
  "planRequestDraft": {}
}
```

The app validates the draft with Zod before accepting it. Invalid AI output should not mutate the saved draft.

The current implementation uses the real AI provider for intake when the app is pointed at a live backend. Local/simulator mode still has a deterministic fallback that returns the same `PlanIntakeAiResponse` contract, so tests can run without paid model calls.

The intake contract has a local safety fence before the simulator/provider boundary. Clearly unsafe, prompt-injection, credential-seeking, exploit, or unrelated general-assistant requests are refused locally without mutating the draft.

The live guided interview is now coach-led rather than template-led. It sends the current draft, recent conversation, and missing required fields to the model, then asks for the most useful next one-question follow-up. Sport templates remain as local fallback/checklist helpers rather than the primary user experience.

The intake prompt includes the browser's local date and time zone, and the date boundary normalizes relative or ambiguous date answers. `today`, `now`, `as soon as possible`, slash dates, and month-name dates such as `Monday May 4th` are normalized to `YYYY-MM-DD`. If the model returns a past year for a start date, the app rolls it forward to the next future occurrence.

The guided intake screen no longer shows an editable manual draft form or a visible Plan Draft panel. It submits the structured draft behind the scenes once enough information has been collected. The magic-wand generate button stays disabled until the draft passes the full `PlanRequest` schema, and the assistant tells the user to click the magic wand when the plan can be generated.

### Separate Intake From Plan Generation

Plan generation should be a separate step from the chat.

Recommended flow:

```text
AI chat
  -> validated PlanRequest JSON
  -> hidden structured draft submission once required fields are ready
  -> plan generation
  -> generated WeekData JSON
  -> plan version snapshot
```

This gives the user a clear checkpoint before a full plan is generated. It also makes the system easier to test, because intake extraction and plan generation can be validated separately.

### Replace Manual Intake With AI Intake Over Time

Manual onboarding is useful while the AI intake is being built, but it is not the long-term primary flow.

The intended direction is:

```text
Manual onboarding remains available during transition
  -> AI intake reaches feature parity
  -> AI intake becomes the primary plan creation path
  -> manual onboarding is retired or kept only as an advanced/debug fallback
```

### Use `PlanRequest` As The Current Intake Envelope

`PlanRequest` is the current structured envelope for plan generation. It should not become a rigid forever-schema that blocks activities with unusual planning needs.

The app should treat `PlanRequest` as:

- a shared minimum contract for common training-plan fields
- an adapter boundary between chat and generation
- a place to store broadly useful context

It should not prevent sport- or activity-specific context from being carried forward. A future version may add an `activityContext` or `customFields` object so unusual sports can preserve richer details without forcing everything into generic fields.

It should represent:

- sport
- disciplines
- goal type
- goal description
- target date when one exists
- training block length when the goal is ongoing
- days per week
- current level
- target level when one exists
- start date
- equipment
- training focus
- injuries and limitations
- exercises to avoid
- strength training inclusion and focus areas

This avoids baking climbing-only concepts like `currentGrade` and `targetGrade` into the generic intake.

### Keep `PlanInput` As A Compatibility Adapter

Manual onboarding and some compatibility snapshots still use legacy fields:

- goals
- current grade
- target grade
- age
- weeks duration
- days per week
- equipment
- discipline

Current transition shape:

```text
Manual onboarding -> legacy PlanInput -> generator compatibility path
```

The guided-intake path now follows the target shape:

```text
Guided intake -> PlanRequest -> generic generator/simulator
```

The legacy adapter remains for manual onboarding and compatibility snapshots.

### Start With Climbing Plus Weight Training

This is a useful scope because climbing and strength training naturally fit together.

For now, weight training should be modeled as support for climbing rather than a totally separate sport. The request model should still allow a future pure strength-training sport profile.

Do not hard-code too much around a single objective like the Nose. Specific objectives can improve defaults, but they should not define the architecture.

### Support Event And Ongoing Goals

The intake must support:

- dated goals, such as a trip, race, event, competition, or goal route
- ongoing goals, such as staying in shape, getting stronger, improving endurance, or maintaining fitness

For dated goals, the app can derive the training block length from the target date.

For ongoing goals, the app should ask for a training block length directly.

### Preserve History During Plan Adjustments

Users should be able to adjust a plan mid-plan when it is too hard, too easy, or life changes.

The adjustment should start from the next current unlogged day forward:

- if today has no logged exercises, the revised plan can start today
- if today has logged exercises, the revised plan should start on the next unlogged day
- completed or logged workouts should never be rewritten
- previous workout logs should remain visible after the plan changes
- the adjusted plan should remain the same plan in My Plans, not appear as a separate plan

The app should create a new `PlanVersion` for the adjusted plan. Workout logs from before the adjustment stay tied to the older version. Future workout logs use the current version.

## Data And Versioning Rules

The current `Plan`, `PlanVersion`, and `WorkoutLog` model can support the first version of AI-assisted adjustments. Worker-based generation will add explicit plan-generation state and job tracking.

Recommended rules:

- `Plan` represents the long-lived plan shown in My Plans.
- `PlanVersion` represents a generated snapshot of that plan at a point in time.
- `WorkoutLog` preserves what the user actually completed.
- Adjustments create a new `PlanVersion`, not a new `Plan`.
- The new version should preserve locked historical days and replace only the adjustable future days.
- Existing `WorkoutLog` rows should never be deleted or rewritten during adjustment.
- My Plans should show one plan, with the current version active.

Planned generation additions:

- `Plan.generationStatus`: `generating`, `ready`, or `failed`
- `Plan.generationError`: nullable failure message
- `Plan.generatedWeeks`: number of completed generated weeks
- `PlanGenerationJob`: durable job row for sequential week generation

Implemented schema addition:

- `PlanVersion.effectiveFromDay Int?`

The app also has `effectiveFromWeek`; day-level adjustment now uses absolute plan-day metadata. A later version may add more precise exercise-level metadata, but day-level is enough for the current implementation.

## Simulator Direction

The simulator should evolve into separate deterministic test helpers instead of one climbing-shaped prompt parser.

Recommended simulator modes:

- intake simulator: conversation plus checklist hints plus current draft -> `PlanRequest` draft and next question
- plan generation simulator: completed `PlanRequest` -> generated plan JSON
- adjustment simulator: `PlanAdjustmentRequest` plus current plan and logs -> revised future plan JSON

This keeps the simulator useful for local development and Playwright tests without forcing sport-specific parsing into production code.

## Phase 1: Generic Intake Foundation

- [x] Create `PlanRequest` schema.
- [x] Include event and ongoing goal support.
- [x] Include climbing disciplines.
- [x] Include weight-training support fields.
- [x] Include injuries, limitations, and avoid-exercise fields.
- [x] Create adapter from `PlanRequest` to legacy `PlanInput`.
- [x] Update guided intake to build `PlanRequest`.
- [x] Keep the guided intake UI chat-driven while maintaining a validated structured draft behind the scenes.
- [x] Add Playwright regression for guided intake.
- [x] Update docs and `CLAUDE.md`.

Validation before marking complete:

- [x] `cd app && npx tsc --noEmit`
- [x] `cd app && npm run build`
- [x] `cd testing && npx playwright test tests/intake.spec.ts`
- [x] `cd testing && npm test`

## Phase 2: AI-Led Intake Contract

Goal: define the structured contract used by the real AI chat, then make the simulator return that same contract before wiring in the real AI provider.

Recommended work:

- [x] Define `PlanIntakeAiResponse`.
- [x] Define allowed statuses such as `needs_more_info` and `ready`.
- [x] Add Zod validation for AI responses.
- [x] Update the simulator/local intake path to return the same response contract.
- [x] Make the app reject invalid AI output without mutating the draft.
- [x] Keep the final `PlanRequest` available to the generation action before generation.
- [x] Add local intake fencing for unsafe or unrelated chat messages.
- [x] Add prompt-level task boundaries for intake and plan generation.
- [x] Add retry/error handling when AI output fails validation.
- [x] Document the system prompt and JSON contract.
- [x] Plug the real AI provider into the same interface after the simulator-backed contract is tested.

Validation before moving on:

- [x] Unit tests for valid AI intake responses.
- [x] Unit tests for invalid AI intake responses.
- [x] Unit tests for unsafe/unrelated intake message fencing.
- [x] Unit tests for prompt boundary text.
- [x] Playwright test using simulator-backed AI contract responses.
- [x] Playwright test for happy-path intake.
- [x] Playwright test for unsafe prompt refusal while keeping intake usable.
- [x] Playwright test for invalid AI output fallback.
- [x] Full Playwright suite passes.

## Phase 3: Template-Guided Interview

Status: complete as local fallback/checklist infrastructure. The live product direction has shifted from template-led scripting to coach-led AI intake.

Goal: keep the AI chat guided without creating one-off sport parsers. Templates should provide minimum required field hints and deterministic local fallback behavior, not a rigid script in live mode.

Recommended work:

- [x] Move the current climbing plus strength interview into a template registry.
- [x] Define a reusable `IntakeTemplate` type.
- [x] Each template should declare:
  - sport/profile ID
  - guiding questions
  - required `PlanRequest` fields
  - optional follow-up fields
  - validation hints
  - generation hints
- [x] Keep the first template as `climbing_strength`.
- [x] Add running and strength-training templates with sport-specific prompts.
- [x] Add a generic fallback template for unknown sports.
- [x] Avoid adding scattered `if sport === ...` logic across the app.

Possible template shape:

```ts
interface IntakeTemplate {
  id: string;
  label: string;
  requiredFields: string[];
  guidingQuestions: string[];
  generationHints: string[];
}
```

Validation before moving on:

- [x] Existing intake test still passes.
- [x] Add regression coverage for choosing climbing, running, strength-training, and generic fallback templates.
- [x] Add unit tests for choosing the correct template.
- [x] Add unit tests for required-field progression.
- [x] Run full Playwright suite.

## Phase 4: Plan Generator Consumes `PlanRequest`

Status: complete.

Goal: stop making the generator and simulator depend on legacy climbing-shaped `PlanInput`.

Recommended work:

- [x] Add a generator function that accepts `PlanRequest`.
- [x] Update `ai-plan-generator.ts` to include structured `PlanRequest` JSON in the prompt.
- [x] Update simulator request handling to consume `PlanRequest` directly.
- [x] Keep a fallback path for legacy `PlanInput` during the transition.
- [x] Store the original `PlanRequest` in the generated version snapshot.
- [x] Generate different plans for:
  - climbing-only plans
  - climbing plus strength plans
  - ongoing goals with no target date
  - event goals with a target date
  - injuries and limitations

Recommended first storage step:

- [x] store `planRequest` inside `PlanVersion.profileSnapshot`

This avoids a schema migration and fits the current snapshot model.

Validation before moving on:

- [x] Generated plans reflect injuries and strength-training requests.
- [x] Generated plans differ between event and ongoing goals.
- [x] Existing plan viewer still works with generated snapshots.
- [x] Manual onboarding still generates a plan.
- [x] Full Playwright suite passes.

## Phase 5: Plan Adjustment Request

Status: complete.

Goal: define the JSON contract for mid-plan changes before adding the user-facing adjustment flow.

Recommended work:

- [x] Define `PlanAdjustmentRequest`.
- [x] Include reason for change, such as too hard, too easy, missed time, injury, travel, or new goal.
- [x] Include desired effective date or let the app calculate the next unlogged day.
- [x] Include locked context:
  - completed days
  - logged exercises
  - current plan version
  - original `PlanRequest`
  - user feedback
- [x] Add a helper that finds the next current unlogged day.
- [x] Add a helper that splits the plan into locked historical days and adjustable future days.
- [x] Add validation that adjusted output does not alter locked historical days.
- [x] Add `PlanVersion.effectiveFromDay Int?`.

Implemented in `app/src/lib/plan-adjustment-request.ts`. `effectiveFromDay` is an absolute plan-day number, where day 1 is week 1 day 1 and day 8 is week 2 day 1.

Validation before moving on:

- [x] Unit tests for next-unlogged-day calculation.
- [x] Unit tests for locked-history validation.
- [x] Migration applies cleanly on a fresh database.
- [x] Existing plan completion tests still pass.

## Phase 6: AI-Assisted Plan Adjustment

Status: complete for the first day-level adjustment flow. The current implementation uses deterministic adjustment rules behind the `PlanAdjustmentRequest` contract; a later iteration can replace that generator step with the real AI provider without changing the request/validation boundary.

Goal: allow the user to chat about a plan change and create a new version from the next unlogged day forward.

Product direction: Phase 6 has two plan-change paths.

- Manual day edits are for precise changes to a specific day. They remain available even after a day has logs, but logged work is protected and only additive custom exercises can be saved.
- AI plan adjustments are for broader future-plan changes such as too hard, too easy, missed time, injury, travel, schedule changes, or a new goal. These should start from the next unlogged day and preserve locked history.

Recommended flow:

```text
User says the plan is too hard/easy or needs to change
  -> AI chat creates PlanAdjustmentRequest JSON
  -> app validates the request
  -> app identifies locked past days and adjustable future days
  -> plan generator creates revised future days
  -> app merges locked past with revised future
  -> app saves a new PlanVersion on the same Plan
```

Recommended work:

- [x] Add an adjustment entry point from the plan detail page.
- [x] Keep manual day editing available for specific-day changes.
- [x] Allow additive manual exercises on logged weeks while preserving existing logged exercises.
- [x] Replace the old week-only coach prototype with the day-level `PlanAdjustmentRequest` flow.
- [x] Add adjustment chat UI.
- [x] Pass the adjustment flow only the context it needs:
  - original plan request
  - current version summary
  - locked past summary
  - adjustable future plan
  - recent workout logs
  - user feedback
- [x] Save adjusted output as a new `PlanVersion`.
- [x] Keep My Plans showing one plan.
- [x] Show previous logs normally after adjustment.
- [x] Add a visible indication that the plan was adjusted.

Validation before moving on:

- [x] Playwright test for adding and logging a manual extra exercise after a day has logs.
- [x] Playwright test for making a plan easier from today when today is unlogged.
- [x] Playwright test for making a plan easier from the next day when today has logs.
- [x] Playwright test that old logs remain visible after adjustment.
- [x] Playwright test that My Plans still shows one plan.
- [x] Full Playwright suite passes.

## Phase 7: Sequential Worker-Based Plan Generation

Goal: improve plan quality and responsiveness by generating plans one week at a time through a worker service instead of generating every week in parallel.

Rationale:

- true progression needs each week to know what happened in prior weeks
- parallel generation only knows week number, total weeks, and phase hints
- users should not wait for the full plan before seeing anything
- a worker can keep generating later weeks while the user reviews Week 1
- failures in later weeks should not discard the whole plan
- users should be able to recover from later-week failures through an AI repair chat that completes the remaining plan

Target flow:

```text
AI intake completes
  -> app creates Plan with generationStatus="generating"
  -> app creates initial PlanVersion with empty or partial snapshot
  -> app creates PlanGenerationJob
  -> worker generates Week 1
  -> plan page shows Week 1 and placeholders for remaining weeks
  -> worker generates Week 2 using Week 1 summary
  -> worker generates Week 3 using prior-week summary
  -> ...
  -> worker marks Plan generationStatus="ready"
```

Failure recovery flow:

```text
Worker fails while generating a later week
  -> app keeps the already generated weeks visible
  -> plan status becomes failed
  -> plan page shows the failed week and error summary
  -> user opens an AI repair chat
  -> user can clarify constraints, simplify the plan, or ask the coach to continue differently
  -> app creates or updates a PlanGenerationJob from the failed week forward
  -> worker resumes sequential generation using prior generated weeks plus repair feedback
  -> plan status returns to generating, then ready
```

Recommended implementation batches:

**Batch 1: Foundation**

- [x] schema fields on `Plan`
- [x] `PlanGenerationJob` table
- [x] helper functions for job state and progress
- [x] partial snapshot / plan viewer support
- [x] progress UI and placeholders
- [x] no change to the real generation flow yet

**Batch 2: Sequential Generation Core**

- [x] `generateNextWeekFromPlanContext`
- [x] previous-week summaries
- [x] next-week prompt changes
- [x] validation for one generated week
- [x] unit tests for prompt construction and week validation

**Batch 3: Worker**

- [x] worker service
- [x] Docker Compose worker
- [x] job polling and locking
- [x] one-week-at-a-time updates
- [x] job completion and failure handling

**Batch 4: Product Integration**

- [x] guided intake creates plan/job instead of blocking on all weeks
- [x] plan page polls while generating
- [x] user sees Week 1 / partial plan while remaining weeks build
- [x] manual onboarding remains on the existing path until the worker flow is stable

**Batch 5: Failure Repair Chat**

- [x] simulator support for week-targeted failures
- [x] failed job UI
- [x] AI repair chat
- [x] repair feedback storage
- [x] resume generation from failed week forward

Recommended schema additions:

- [x] Add `Plan.generationStatus`.
- [x] Add `Plan.generationError`.
- [x] Add `Plan.generatedWeeks`.
- [x] Add `PlanGenerationJob` table with:
  - `planId`
  - `userId`
  - `status`
  - `totalWeeks`
  - `nextWeekNum`
  - `lastError`
  - `lockedAt`
  - timestamps

Recommended app work:

- [x] Change guided-intake plan creation to create the plan/job quickly instead of blocking on all weeks.
- [x] Save a partial `PlanVersion.planSnapshot` as each week is generated.
- [x] Update plan viewer to support partial snapshots.
- [x] Show generated weeks immediately.
- [x] Show placeholders for missing future weeks.
- [x] Show progress such as `Generating week X of Y`.
- [x] Poll or refresh while `generationStatus="generating"`.
- [x] Show generated weeks even when later-week generation fails.
- [x] Show failed week, last error, and a clear repair entry point when generation fails.
- [x] Add an AI repair chat for failed generation jobs.
- [x] Let repair chat collect user guidance such as simplify, reduce volume, avoid an exercise, change schedule, or continue from prior weeks.
- [x] Resume generation from the failed week forward instead of restarting the entire plan.
- [x] Keep manual onboarding on the current generation path until the worker flow is stable, or explicitly migrate it as a separate step.

Recommended worker work:

- [x] Add a worker service to Docker Compose.
- [x] Worker polls pending `PlanGenerationJob` rows.
- [x] Worker locks one job at a time.
- [x] Worker generates exactly one next week per job iteration.
- [x] Worker passes prior generated week summaries into the next-week prompt.
- [x] Worker updates the partial snapshot and progress after every generated week.
- [x] Worker marks job and plan ready when all weeks are generated.
- [x] Worker marks job and plan failed with an error message when generation cannot recover automatically.
- [x] Worker can resume a failed job from `nextWeekNum` after repair feedback is added.

Recommended generator work:

- [x] Add `generateNextWeekFromPlanContext`.
- [x] Pass full `PlanRequest`, including future `activityContext` / `customFields`.
- [x] Pass previously generated week summaries.
- [x] Pass current week number and total weeks.
- [x] Ask the model to progress from previous volume, intensity, exercises, and recovery load.
- [x] Include repair feedback when regenerating after a failed week.
- [x] Validate each generated week before saving it.

Validation before moving on:

- [x] Unit tests for generation job state transitions.
- [x] Unit tests for next-week prompt context including previous week summary.
- [x] Worker integration test for generating a multi-week plan to ready status.
- [x] Playwright test that Week 1 appears before the full plan is complete.
- [x] Playwright test that placeholders/progress are shown for missing weeks.
- [x] Playwright test that the plan becomes ready after worker completion.
- [x] Failure/retry test for simulator week-targeted failure controls.
- [x] Worker failure/repair integration test for a failed generation job.
- [x] Playwright test that failed later-week generation keeps earlier weeks visible.
- [x] Playwright test that AI repair chat can resume and complete a failed plan.
- [x] Existing plan viewer, logging, manual edits, and adjustment tests still pass.

## Phase 8: Add More Sports

Do this only after `PlanRequest`, the generator, the adjustment flow, and worker-based generation are stable.

Candidate additions:

- general strength training
- running
- cycling
- hiking / mountaineering conditioning

Before adding a sport, define:

- sport template
- required intake fields
- current-level format
- target-level or event format
- common equipment
- session types
- progression rules
- injury concerns
- simulator behavior
- tests

Do not add a sport by adding scattered sport-specific branches across the app. Add a profile/template and make the generator/simulator consume the same generic request shape.

## Open Questions

- Should `PlanRequest` stay in `PlanVersion.profileSnapshot`, or should it later move to a dedicated column/table?
- Should `PlanRequest` grow an `activityContext` / `customFields` escape hatch for sports with planning needs that do not fit the generic envelope?
- Should weight training become a separate sport profile or remain a climbing support module?
- How closely should the simulator emulate the real AI provider versus only providing deterministic test plans?
- Should the app show explicit warnings when injuries are entered?
- Should injury exercise avoidance be handled by deterministic app rules, AI prompt instructions, or both?
- Should adjusted plan versions show a comparison view against the previous version?

## Definition Of Done For Each Step

Each checklist item should be marked complete only after:

- implementation is done
- docs are updated
- relevant focused tests pass
- full Playwright suite passes when the change affects app behavior
- any known limitations are written down
