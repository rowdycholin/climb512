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

The first adjustment flow starts from the next current unlogged day forward, and the newer interactive flow can narrow that with an approved scope:

- if today has no logged exercises, the revised plan can start today
- if today has logged exercises, the revised plan should start on the next unlogged day
- scoped changes can be day-only, week-only, date-range, or future-from-day
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
- `PlanGenerationWeek`: one generated week snapshot per job/week while the worker builds a plan

Implemented schema addition:

- `PlanVersion.effectiveFromDay Int?`
- `PlanVersion.changeMetadata Json?`

The app also has `effectiveFromWeek`; day-level adjustment now uses absolute plan-day metadata. Adjustment metadata stores affected day refs, scope, and revert details where useful.

## Simulator Direction

The simulator should evolve into separate deterministic test helpers instead of one climbing-shaped prompt parser.

Recommended simulator modes:

- intake simulator: conversation plus checklist hints plus current draft -> `PlanRequest` draft and next question
- plan generation simulator: completed `PlanRequest` -> generated plan JSON
- adjustment simulator: deterministic scoped proposal/validation behavior for local tests until the real AI adjustment provider is plugged in

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

Goal: allow the user to chat about a plan change and create a new version without rewriting logged history.

Product direction: Phase 6 has two plan-change paths.

- Manual day edits are for precise changes to a specific day. They remain available even after a day has logs, but logged work is protected and only additive custom exercises can be saved.
- AI plan adjustments are for broader plan changes such as too hard, too easy, missed time, injury, travel, schedule changes, or a new goal. The first flow adjusted from the next unlogged day; Phase 8 adds conversational scope so a proposal can target one day, one week, a date range, or future days from a point.

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
  -> repair guidance stays anchored to the original plan goals, sport, target, schedule, and known constraints
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
- [x] Save each generated worker week in `PlanGenerationWeek` instead of creating one `PlanVersion` per week.
- [x] Update plan viewer to support partial snapshots.
- [x] Show generated weeks immediately.
- [x] Show placeholders for missing future weeks.
- [x] Show progress such as `Generating week X of Y`.
- [x] Poll or refresh while `generationStatus="generating"`.
- [x] Show generated weeks even when later-week generation fails.
- [x] Show failed week, last error, and a clear repair entry point when generation fails.
- [x] Add an AI repair chat for failed generation jobs.
- [x] Let repair chat collect user guidance such as simplify, reduce volume, avoid an exercise, change schedule, or continue from prior weeks.
- [ ] Ensure failed-week repair continues the same plan goals rather than letting the repair chat redefine the plan.
- [x] Resume generation from the failed week forward instead of restarting the entire plan.
- [x] Keep manual onboarding on the current generation path until the worker flow is stable, or explicitly migrate it as a separate step.

Recommended worker work:

- [x] Add a worker service to Docker Compose.
- [x] Worker polls pending `PlanGenerationJob` rows.
- [x] Worker locks one job at a time.
- [x] Worker generates exactly one next week per job iteration.
- [x] Worker passes prior generated week summaries into the next-week prompt.
- [x] Worker updates `PlanGenerationWeek` rows and progress after every generated week.
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

## Phase 8: Interactive AI Plan Adjustments

Goal: replace the current restrictive adjustment flow with a more conversational AI chat that can collect specific, nuanced change requests while still preserving locked workout history.

Why this is needed:

- the current adjustment flow is too narrow and mostly reason/category driven
- users need to describe specific changes in plain language
- examples include changing one future day, swapping exercises, reducing finger load, adding recovery, changing available days, or adapting around travel
- the AI should be able to ask follow-up questions before applying changes
- the app must still protect completed/logged work and keep the adjusted plan as the same saved plan
- the adjustment chat should visually match the intake chat so users understand it is the same kind of guided AI interaction
- users need a clear preview of where changes will happen before applying them, especially when a request affects many future days

Target flow:

```text
User opens Adjust Plan
  -> AI chat receives current plan summary, original plan goals, locked history, logs, and adjustable future range
  -> user describes the desired change
  -> AI infers whether the change is day-only, week-only, a date range, or future-from-day
  -> AI asks follow-up questions if the request is ambiguous or unsafe
  -> AI proposes scope, summary, and grouped change preview
  -> user confirms
  -> app validates that locked history is unchanged and changes stay inside the approved scope
  -> app saves a new PlanVersion on the same Plan
  -> future plan view reflects the adjustment and temporarily highlights affected days/sessions for review
```

Boundaries:

- adjustments must not edit logged days or completed exercise logs
- adjustments should default to preserving the original plan goal unless the user explicitly asks to change the goal
- goal-changing adjustments should be clearly labeled as a goal change before confirmation
- injury-related changes should bias conservative and may ask for clarification
- the app should reject or re-ask when the AI output modifies locked history, removes required identifiers, or returns an invalid snapshot
- the user should see a short summary of what changed before applying it
- the user should see the inferred scope before applying it
- scope choices should stay small: `day_only`, `week_only`, `date_range`, or `future_from_day`
- the UI may offer a scope override, but the main path should be conversational and AI-inferred
- large changes should be grouped by week/day pattern instead of shown as a long wall of text
- after applying, the plan viewer should make adjusted areas discoverable for the current review only; after refresh, logout, or returning later, the plan should look normal

Recommended implementation batches:

**Batch 1: Adjustment Chat Contract**

- [x] Define a conversational adjustment state shape.
- [x] Add message history for the active adjustment session.
- [x] Include original `PlanRequest`, current `PlanVersion`, locked-history range, workout logs, and adjustable future days in the model context.
- [x] Add prompt boundaries that keep normal adjustments tied to the original plan goals.
- [x] Require the model to either ask one follow-up question or return a structured proposal.

**Batch 2: Proposal and Validation**

- [x] Define an adjustment proposal schema with summary, changed weeks/days, effective-from day, and revised future snapshot.
- [x] Validate that locked historical days are unchanged.
- [x] Validate that exercise/session/day identifiers remain stable where required.
- [x] Validate that the proposal does not change the plan goal unless the user explicitly requested a goal change.
- [x] Store rejected proposal reasons for debugging.

**Batch 2A: AI-Inferred Adjustment Scope**

Goal: let the user describe the adjustment naturally while making the model propose an explicit scope that the app can validate.

Scope contract:

```ts
type AdjustmentScope =
  | { type: "day_only"; startWeek: number; startDay: number; endWeek: number; endDay: number }
  | { type: "week_only"; startWeek: number; endWeek: number }
  | { type: "date_range"; startWeek: number; startDay: number; endWeek: number; endDay: number }
  | { type: "future_from_day"; startWeek: number; startDay: number };
```

Recommended work:

- [x] Add scope to the adjustment proposal schema and saved change metadata.
- [x] Let the AI infer scope from the user's message, such as "today only", "next week", "while traveling", or "from Friday onward".
- [x] If scope is unclear, have the AI ask one follow-up question instead of defaulting to the rest of the plan.
- [x] Show the inferred scope in the proposal before apply, such as "Scope: Week 3 only".
- [x] Add a lightweight UI override for scope when the AI guesses wrong.
- [x] Server-validate that the adjusted snapshot only changes days inside the approved scope.
- [x] Keep logged days locked even when they fall inside the requested scope.
- [x] Add simulator support for obvious scope phrases so tests can cover day-only, week-only, and future-from-day behavior.
- [x] Add Playwright coverage that a week-only adjustment does not change later weeks.
- [x] Add Playwright coverage that a day-only adjustment does not change other days in the same week.

**Batch 3: User Experience**

- [x] Replace or rework the current restrictive Adjust Plan panel.
- [x] Let users chat freely about the change they want.
- [x] Show AI follow-up questions inline.
- [x] Show a confirmation step with a concise change summary.
- [x] Let users cancel, revise, or apply the proposal.
- [x] Keep manual day editing available for one-off day-specific edits.

**Batch 4: Save and Versioning**

- [x] Save confirmed adjustments as a new `PlanVersion`.
- [x] Preserve old workout logs against prior versions.
- [x] Keep the same `Plan` row in My Plans.
- [x] Store the latest adjustment summary in version history.
- [x] Consider adding adjustment-session records if chat history needs to be retained. Decision: defer until chat history needs to persist beyond the active adjustment session.

**Batch 5: Chat Polish and Change Preview**

- [x] Match the adjustment chat input layout to the intake chat, including the right-side arrow/send icon placement.
- [x] Remove the visually separate large send button once the inline send affordance is in place.
- [x] Make follow-up and proposal responses feel more conversational, including simulator responses where needed.
- [x] Add a proposal preview with a verbal summary plus grouped affected weeks/days.
- [x] Collapse repetitive broad changes into patterns, such as "Weeks 2-8: Thursday rest moved to Saturday."
- [x] Show expandable detail for users who want to inspect every affected day/session.
- [x] Add an "Adjusted" badge or subtle highlight on affected future days after apply.
- [x] Make adjustment highlights transient: visible immediately after apply, but gone after refresh, logout, or returning later.
- [x] Consider adding `PlanVersion.changeMetadata Json?` to persist exact changed week/day/session refs for reliable post-refresh highlighting. Added `changeMetadata`.
- [x] Until metadata exists, store the clearest possible grouped summary in `changeSummary`. Metadata now exists, and `changeSummary` still stores a readable grouped summary.

**Batch 6: Version History and Revert**

Status note: pause additional version-history polish until worker generation checkpoints are moved out of `PlanVersion`. `PlanVersion` should represent user-facing plan revisions, not every background week-generation checkpoint.

Chunk 1: Version History List + Revert

- [x] Add a version history entry point on the plan page.
- [x] List previous `PlanVersion` records with version number, date, change type, summary, and effective-from day/week.
- [x] Add a revert action that verifies ownership and creates a new `PlanVersion` copied from the selected historical version.
- [x] Set reverted versions to `changeType = "revert"` and `changeSummary = "Reverted to Version X"` or similar.
- [x] Update `Plan.currentVersionId` to the newly created revert version instead of mutating the old version.
- [x] Preserve all existing workout logs; do not delete logs from versions that are no longer current.
- [x] Ensure new logs after revert attach to the new current version.
- [ ] Add core tests for ownership checks and deeper log preservation.
- [x] Add browser coverage for version listing and revert behavior.

Chunk 2: Move Worker Checkpoints Out Of PlanVersion

Goal: keep progressive week-by-week generation while preventing the plan-worker from creating one `PlanVersion` per generated week.

Target model:

```prisma
model PlanGenerationWeek {
  id           String            @id @default(cuid())
  jobId        String
  job          PlanGenerationJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  planId       String
  userId       String
  weekNum      Int
  status       String            @default("ready")
  weekSnapshot Json
  createdAt    DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime          @updatedAt @db.Timestamptz(3)

  @@unique([jobId, weekNum])
  @@index([planId])
  @@index([userId])
}
```

Implementation steps:

- [x] Add `PlanGenerationWeek` and a `PlanGenerationJob.weeks` relation.
- [x] Update guided-intake generation to create the plan/job without creating user-facing worker checkpoint versions.
- [x] Update the worker to save each generated week into `PlanGenerationWeek` instead of creating a new `PlanVersion` for every week.
- [x] Keep updating `Plan.generatedWeeks`, `generationStatus`, and `generationError` so the plan page can show progress.
- [x] Compose generated week rows into a temporary display `PlanSnapshot` while generation is in progress or failed.
- [x] When all weeks are generated, compose the full snapshot and create exactly one user-facing `PlanVersion` with `changeType = "generated"`.
- [x] Set `Plan.currentVersionId` only when the final generated version is ready, or clearly define how the initial shell version behaves until then.
- [x] Update failed-week repair to resume from `PlanGenerationWeek` rows and optionally delete/regenerate rows from the failed week forward.
- [x] Update version history so newly generated plans no longer create worker checkpoint versions; the operational shell and old dev-data worker versions remain hidden.
- [x] Keep existing dev data as-is unless a cleanup migration is explicitly needed; use the new flow for newly generated plans.
- [x] Add tests that a generated plan creates one user-facing generated version, not one version per week.
- [x] Add tests that progressive UI still shows Week 1 before the full plan is complete.
- [x] Add tests that repair resumes from the failed week using prior generated week rows.

Implementation note: while a plan is still generating, `Plan.currentVersionId` points at a hidden operational shell version that stores the profile/request context. Generated week snapshots live in `PlanGenerationWeek` and are composed for display. When all weeks are ready, the worker creates the first user-facing generated version and makes it current.

Chunk 3: Read-Only Historical Preview

- [ ] Let users preview a previous version in read-only mode using the existing plan viewer where possible.
- [ ] Clearly label historical previews so users do not confuse them with the active plan.
- [ ] Disable logging, manual edits, AI adjustments, completion, and revert-from-preview controls when previewing unless explicitly supported.
- [ ] Decide how old-version workout logs should display, since logs are attached to the version where they were created.
- [ ] Add Playwright coverage for opening and closing historical preview mode.

**Batch 7: Tests**

- [ ] Unit tests for adjustment prompt/context construction.
- [ ] Unit tests for proposal validation.
- [ ] Test that locked history cannot be changed.
- [ ] Playwright test for a simple future-day exercise swap.
- [ ] Playwright test for a schedule change across future weeks.
- [ ] Playwright test for a broad repeated change, such as moving all future Thursday rest days to Saturday.
- [ ] Playwright test that changed days are summarized/highlighted after apply.
- [ ] Playwright test for an injury-related conservative adjustment.
- [ ] Playwright test that a goal change requires explicit confirmation.
- [ ] Existing logging, manual edit, and plan viewer tests still pass.

Related Phase 7 repair follow-up:

- [ ] Update failed-week repair prompts so repair is framed as completing the existing plan, not creating a new goal or materially changing the plan purpose.
- [ ] Include original plan goals and generated prior-week summaries in the repair chat visible context.
- [ ] Add validation or prompt checks that reject repair output that changes the sport, primary goal, target date, target level, or block length unless the user is moved into the full adjustment flow.

## Phase 9: Add More Sports

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
