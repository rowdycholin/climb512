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
- [x] Guided intake sends `PlanRequest` directly to the plan generator.
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

The current implementation uses a simulator-backed version of this contract. The local guided intake still produces the draft deterministically, but the server action now validates that output as an AI-style response before returning it to the UI. The real AI provider should plug into this same interface later.

The guided interview now chooses an intake template. The supported profiles are `climbing_strength`, `running`, and `strength_training`; unknown sports use a generic fallback template so the app does not need one-off parser branches for every new sport.

The guided intake screen no longer shows an editable manual draft form or a visible Plan Draft panel. It submits the structured draft behind the scenes once enough information has been collected.

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

### Use `PlanRequest` As The Durable Intake Contract

`PlanRequest` should be the long-term input contract for plan generation.

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

The current `Plan`, `PlanVersion`, and `WorkoutLog` model can support the first version of AI-assisted adjustments.

Recommended rules:

- `Plan` represents the long-lived plan shown in My Plans.
- `PlanVersion` represents a generated snapshot of that plan at a point in time.
- `WorkoutLog` preserves what the user actually completed.
- Adjustments create a new `PlanVersion`, not a new `Plan`.
- The new version should preserve locked historical days and replace only the adjustable future days.
- Existing `WorkoutLog` rows should never be deleted or rewritten during adjustment.
- My Plans should show one plan, with the current version active.

Implemented schema addition:

- `PlanVersion.effectiveFromDay Int?`

The app also has `effectiveFromWeek`; day-level adjustment now uses absolute plan-day metadata. A later version may add more precise exercise-level metadata, but day-level is enough for the current implementation.

## Simulator Direction

The simulator should evolve into separate deterministic test helpers instead of one climbing-shaped prompt parser.

Recommended simulator modes:

- intake simulator: conversation plus template plus current draft -> `PlanRequest` draft and next question
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
- [x] Add retry/error handling when AI output fails validation.
- [x] Document the system prompt and JSON contract.
- [ ] Plug the real AI provider into the same interface after the simulator-backed contract is tested.

Validation before moving on:

- [ ] Unit tests for valid AI intake responses.
- [ ] Unit tests for invalid AI intake responses.
- [x] Playwright test using simulator-backed AI contract responses.
- [x] Playwright test for happy-path intake.
- [ ] Playwright test for invalid AI output fallback.
- [x] Full Playwright suite passes.

## Phase 3: Template-Guided Interview

Status: complete.

Goal: keep the AI chat guided without creating one-off sport parsers.

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

## Phase 7: Add More Sports

Do this only after `PlanRequest`, the generator, and the adjustment flow are stable.

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
