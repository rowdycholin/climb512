# Rich Prose Plan Generation

## Purpose

The app can call a strong model, but the generated plans can still feel thinner than asking ChatGPT directly. The main reason is not just model quality. It is the product contract around the model:

- the app asks for compact JSON
- the generated output is forced into short, trackable exercise fields
- weeks are generated one at a time
- the UI mostly renders prescriptions, not coaching explanation
- validation rejects anything outside the expected shape

Direct ChatGPT can behave like a coach. The app currently asks the model to behave like a strict data API. To make app plans feel closer to a high-quality ChatGPT conversation, preserve structured data for logging but add a richer coaching layer around it.

## Current Constraints

Current plan generation has useful guardrails:

- JSON-only output
- exactly one week per provider call
- exactly 7 days per week
- compact day/session/exercise objects
- short notes and descriptions
- schema repair and validation
- safety rules such as avoiding full-crimp hangboard prescriptions

Those constraints make plans storable, editable, and trackable. They also flatten the coaching quality. A great training plan is not only "3 sets of 8"; it explains why the session exists, how hard it should feel, what to do if the athlete feels bad, how the week progresses, and what matters most.

## Recommended Direction

Keep the structured plan snapshot, but split generated output into two layers:

1. **Trackable prescription data**
   Sets, reps, duration, rest, intensity, exercise name, session duration, day focus, rest days, and workout logging keys.

2. **Rich coaching prose**
   Overview, rationale, weekly intent, progression logic, day coaching notes, session objectives, exercise cues, modifications, recovery advice, and "what to watch for."

The model should be allowed to write richer prose in dedicated fields, while the trackable fields stay normalized and strict.

## Schema Changes

Add optional rich fields to `PlanSnapshot`, `WeekSnapshot`, `DaySnapshot`, `SessionSnapshot`, and `ExerciseSnapshot`. These fields should be optional so old plans continue to load.

Suggested additions:

```ts
interface PlanSnapshot {
  planGuidance?: PlanGuidance | null;
  coachOverview?: string | null;
  athleteContextSummary?: string | null;
  progressionStrategy?: string | null;
  recoveryStrategy?: string | null;
  weeks: WeekSnapshot[];
}

interface WeekSnapshot {
  summary?: string | null;
  progressionNote?: string | null;
  coachRationale?: string | null;
  keyAdaptations?: string[] | null;
  watchouts?: string[] | null;
}

interface DaySnapshot {
  coachNotes?: string | null;
  readinessGuidance?: string | null;
  fallbackOption?: string | null;
}

interface SessionSnapshot {
  objective?: string | null;
  intensity?: string | null;
  warmup?: string | null;
  cooldown?: string | null;
  coachingFocus?: string | null;
  modificationGuidance?: string | null;
}

interface ExerciseSnapshot {
  prescriptionDetails?: string | null;
  modifications?: string | null;
  cues?: string[] | null;
  purpose?: string | null;
}
```

The app already has some of these fields. The next step is to make them first-class in prompts, validation, storage, and rendering instead of treating them as incidental extras.

## Prompt Changes

The current prompt says things like:

- "Keep all string values short"
- "notes: REQUIRED, max 10 words"
- "Return ONLY compact minified JSON"

Those instructions help parsing but suppress useful coaching. Replace global shortness rules with field-specific rules:

- trackable fields stay short
- prose fields may be 1-4 sentences
- lists should stay concise
- no markdown inside JSON strings
- no generic hype
- prose must explain decisions using athlete context

Example prompt direction:

```text
Use compact trackable fields for logging, but include rich coaching fields.
Exercise names, sets, reps, duration, rest, and load must be concise.
coachRationale, readinessGuidance, and modificationGuidance may be 1-4 sentences.
Explain why the week is structured this way based on the athlete's goal, level, age, equipment, constraints, and previous weeks.
```

Also ask the model to produce decisions, not just workouts:

- why this week exists
- what adaptation it targets
- how it progresses from previous weeks
- when to back off
- what to prioritize if time is short
- how to modify around soreness or fatigue

## Two-Pass Generation

Direct ChatGPT feels better because it can reason at the whole-plan level before writing details. The app should mimic that.

### Pass 1: Plan Strategy

Generate a full-block strategy before generating week details:

- athlete summary
- primary goal
- constraints and risks
- phase structure
- weekly progression table
- intensity distribution
- recovery strategy
- testing or benchmark points
- plan-specific principles

Store this in `PlanGenerationJob.profileSnapshot` or as a draft `PlanGuidance` object.

### Pass 2: Week Generation

Generate each week using:

- original `PlanRequest`
- user age
- plan strategy
- previous generated weeks
- repair feedback, if any

This keeps week generation grounded in a coherent block instead of having each week reinvent context.

## Whole-Plan Coherence

Current worker generation is sequential, which is good, but the prompt should lean harder on previous weeks:

- summarize total load so far
- identify the current phase
- explain the progression from prior week
- avoid repeating identical sessions
- preserve named preferences and constraints
- maintain a realistic fatigue curve

Each generated week should include a short `coachRationale` that explicitly references the block phase and prior week.

## Intake Context

The intake chat currently collects plan fields, but some useful context can be lost. Recommendations:

- pass user age into intake chat, not only generation
- preserve a richer `athleteNarrative` alongside structured fields
- capture training history, recent consistency, time per session, and recovery capacity
- capture "why this goal matters" when the user volunteers it
- capture preferred coaching style only if naturally useful

Add optional fields to `PlanRequest`:

```ts
athleteNarrative?: string;
trainingHistory?: string;
recentTrainingLoad?: string;
sessionLengthPreference?: string;
recoveryCapacity?: string;
motivationContext?: string;
```

These should not be required. They should enrich plans when available.

## Validation Strategy

Do not loosen validation for the trackable core. Instead, validate rich prose separately.

Strict validation:

- week/day/session/exercise shape
- week numbers
- day numbers and day names
- rest day consistency
- exercise prescription fields
- locked history protection
- safety rules

Soft validation:

- prose length bounds
- no markdown
- no disallowed topics
- no medical diagnosis
- no contradictions with constraints

If rich prose fails validation, strip or repair that field without discarding the whole week. A plan with valid prescriptions and missing prose is better than a failed generation.

## UI Rendering

The UI needs to show richer coaching without making logging harder.

Recommended presentation:

- plan overview section with strategy and recovery guidance
- week header with rationale and progression note
- day card with coach notes and readiness guidance
- session header with objective and intensity
- exercise row remains compact
- expandable "why this matters" or "modify this" areas

Do not bury the actual workout under prose. The user should be able to scan the prescription quickly, then expand coaching detail when needed.

## Adjustment Flow

AI adjustments should update both prescription and rationale.

When a user asks to make the plan easier, change schedule, or adjust around fatigue, the model should return:

- what changed
- why it changed
- which days/weeks were affected
- updated coaching notes
- updated recovery guidance

The current adjustment flow already has `changeMetadata`. Use that metadata in the UI to explain the change like a coach would, not just highlight modified days.

## Provider Settings

Model choice matters, but it will not fully solve the issue alone. A stronger model still produces constrained output if the prompt and schema demand compact JSON.

Recommended model/backend posture:

- use the strongest available model for plan strategy and adjustment reasoning
- optionally use a cheaper model for deterministic extraction or simple repair
- keep simulator mode for tests
- log provider errors clearly, but never log API keys

If cost becomes a concern, use the rich two-pass approach selectively:

- full rich strategy for new plans
- smaller rich update for adjustments
- no rich regeneration for simple manual edits

## Implementation Batches

The changes should be delivered in small batches. Each batch should leave the app working, keep old plans readable, and avoid changing more than one layer of the system at once.

## Batch 1: Snapshot Compatibility Foundation

Goal: make the data model ready for richer coaching without changing model behavior yet.

Scope:

- add optional rich prose fields to TypeScript snapshot interfaces
- update snapshot parsing and normalization to preserve these fields
- make sure old snapshots without rich fields still parse
- add tests for backwards compatibility

Likely files:

- `app/src/lib/plan-snapshot.ts`
- `app/src/lib/plan-snapshot.test.ts`
- any components that destructure snapshot objects too narrowly

Suggested fields:

- `PlanSnapshot.coachOverview`
- `PlanSnapshot.athleteContextSummary`
- `PlanSnapshot.progressionStrategy`
- `PlanSnapshot.recoveryStrategy`
- `WeekSnapshot.coachRationale`
- `WeekSnapshot.keyAdaptations`
- `WeekSnapshot.watchouts`
- `DaySnapshot.readinessGuidance`
- `DaySnapshot.fallbackOption`
- `SessionSnapshot.coachingFocus`
- `SessionSnapshot.modificationGuidance`
- `ExerciseSnapshot.cues`
- `ExerciseSnapshot.purpose`

Validation:

- `npm run test:unit`
- `npx tsc --noEmit`
- load an existing plan generated before this change

Exit criteria:

- no prompt changes yet
- no UI redesign yet
- old plans render exactly as before
- rich fields survive parse/build/serialize round trips when present

## Batch 2: Render Existing Rich Fields

Goal: show richer coaching fields that already exist or can be safely present, without changing generation yet.

Scope:

- render plan-level overview and progression guidance if available
- render week summary/progression notes more prominently
- render day coach notes/readiness guidance when present
- render session objective/intensity/warmup/cooldown/modification guidance when present
- keep exercise rows compact and log-friendly

Likely files:

- `app/src/components/PlanViewer.tsx`
- `app/src/components/PlanWorkspace.tsx`
- `app/src/components/PlanPageShell.tsx`
- related CSS/Tailwind layout classes

UI rules:

- do not hide the actual workout under prose
- prose should be scannable and optional
- use progressive disclosure for longer coaching text
- avoid making logged-workout controls harder to reach

Validation:

- `npx tsc --noEmit`
- `npm run build`
- visual check on desktop and mobile widths
- open a plan with and without rich fields

Exit criteria:

- existing plans still feel unchanged or slightly better
- if rich fields are missing, the UI has no empty headings
- logging a workout still works normally

## Batch 3: Prompt Wording for Rich Weekly Output

Goal: improve generated week quality using the current one-week generation flow.

Scope:

- update weekly generation prompts to request richer optional fields
- replace global "all strings must be short" with field-specific rules
- keep trackable prescription fields concise
- allow coaching fields to be 1-4 sentences
- preserve JSON-only output and strict shape

Likely files:

- `app/src/lib/ai-plan-generator.ts`
- `app/src/lib/ai-plan-generator.test.ts`
- simulator fixtures if they assert exact generated shape

Prompt changes:

- ask for `coachRationale` on each week
- ask for readiness/fallback guidance on days when useful
- ask for session objectives and modification guidance
- ask the model to explain how the week serves the athlete's goal, age, level, schedule, equipment, and constraints
- keep exercise names, sets, reps, duration, rest, load, and grade short

Validation:

- `npm run test:unit`
- `npx tsc --noEmit`
- generate a short 2-4 week plan against simulator/local mode
- generate one live-provider plan and inspect whether rich fields appear

Exit criteria:

- plan generation still succeeds
- generated plans contain useful prose fields
- no logging regressions
- no explosion in invalid JSON rate

## Batch 4: Soft Validation and Prose Repair

Goal: prevent rich prose from making the whole plan fragile.

Scope:

- validate prescription data strictly
- validate rich prose softly
- strip or truncate bad rich fields instead of rejecting the week
- keep safety rules authoritative
- add tests for malformed prose

Likely files:

- `app/src/lib/ai-plan-generator.ts`
- `app/src/lib/plan-snapshot.ts`
- `app/src/lib/ai-plan-generator.test.ts`

Soft validation examples:

- prose length bounds
- no markdown headings inside JSON strings
- no diagnosis or medical treatment claims
- no contradiction with injuries or avoid-exercise constraints
- no unsupported sport changes

Validation:

- `npm run test:unit`
- tests for missing, overlong, or malformed rich fields
- tests that a valid prescription with bad prose still saves after prose cleanup

Exit criteria:

- bad prose does not fail an otherwise usable generated week
- unsafe prescription still fails
- validation errors are logged with useful context

## Batch 5: Intake Context Enrichment

Goal: capture more of what makes a direct ChatGPT conversation useful.

Scope:

- pass registered user age into intake chat context
- add optional narrative fields to `PlanRequest`
- preserve user-provided nuance as structured narrative, not only `planStructureNotes`
- ask follow-up questions only when the answer materially improves the plan

Likely files:

- `app/src/app/actions.ts`
- `app/src/lib/plan-request.ts`
- `app/src/lib/intake.ts`
- `app/src/lib/plan-intake-ai.ts`
- `app/src/lib/plan-intake-ai.test.ts`

Possible optional fields:

- `athleteNarrative`
- `trainingHistory`
- `recentTrainingLoad`
- `sessionLengthPreference`
- `recoveryCapacity`
- `motivationContext`

Validation:

- `npm run test:unit`
- intake tests for age context and narrative preservation
- check that the magic-wand readiness gate still depends only on required fields

Exit criteria:

- intake does not become a long questionnaire
- plans preserve more user nuance
- existing drafts without narrative fields still work

## Batch 6: Full-Block Strategy Generation

Goal: mimic the way ChatGPT thinks through the whole plan before writing workouts.

Scope:

- introduce a `PlanStrategy` or richer `PlanGuidance` object
- generate strategy once before weekly generation
- store strategy in the job/profile context or plan snapshot
- feed strategy into each weekly generation prompt

Likely files:

- `app/src/lib/ai-plan-generator.ts`
- `app/src/lib/plan-generation-worker.ts`
- `app/src/lib/plan-snapshot.ts`
- Prisma JSON usage only; no schema migration should be needed if stored inside existing JSON columns

Strategy should include:

- athlete summary
- goal interpretation
- main constraints and risks
- phase structure
- progression table
- recovery strategy
- intensity distribution
- benchmarks or testing points
- plan-specific coaching principles

Validation:

- `npm run test:unit`
- `npx tsc --noEmit`
- worker test or manual worker run against simulator
- live-provider smoke test on a short plan

Exit criteria:

- each generated week references the same coherent strategy
- phase progression is visible across weeks
- strategy failure has a fallback path to current generation

## Batch 7: Prior-Week Coherence Improvements

Goal: reduce repetitive weeks and make progression feel intentional.

Scope:

- improve prior-week summaries passed to the model
- include load, intensity, focus, and key exercises from previous weeks
- ask the model to explain what changed from the previous week
- avoid repeating identical sessions unless intentionally planned

Likely files:

- `app/src/lib/ai-plan-generator.ts`
- `app/src/lib/plan-generation-worker.ts`
- `app/src/lib/plan-generation-state.ts`

Validation:

- generate a 6-8 week plan
- inspect week-to-week variety and progression
- ensure repaired weeks still respect prior context

Exit criteria:

- weeks progress without sudden spikes
- repeated workouts are intentional and explained
- phase and fatigue curve are visible in summaries

## Batch 8: Rich Adjustment Explanations

Goal: make AI plan adjustments explain themselves like a coach.

Scope:

- update adjustment prompts to return prescription changes plus rationale changes
- store adjustment rationale in `changeMetadata`
- render adjustment summaries and reasons in version history or transient apply state
- update affected day/week rich fields when a plan changes

Likely files:

- `app/src/lib/plan-adjustment-chat.ts`
- `app/src/lib/ai-plan-adjustment-chat.ts`
- `app/src/app/actions.ts`
- `app/src/components/PlanAdjuster.tsx`
- `app/src/components/PlanPageShell.tsx`

Validation:

- adjustment tests
- manual adjustment on an unlogged future week
- verify locked history remains unchanged

Exit criteria:

- adjustment explains what changed and why
- affected future days update both prescription and coaching fields
- locked/logged days remain protected

## Batch 9: Provider and Cost Controls

Goal: keep richer generation practical to run.

Scope:

- add model selection guidance for strategy vs weekly generation if needed
- add clearer logs for strategy generation, weekly generation, and repair
- track duration and failure mode per generation step
- keep simulator/local paths deterministic

Likely files:

- `app/src/lib/ai-plan-generator.ts`
- `app/src/lib/plan-generation-worker.ts`
- `docs/ai-integration.md`
- env examples or docs

Validation:

- provider error logs do not leak keys
- simulator mode still works
- live mode gives enough timing/error detail to debug failures

Exit criteria:

- richer generation can be debugged from logs
- model/provider changes remain env-driven
- no secrets are logged

## Batch 10: Product Polish and Regression Pass

Goal: make the richer plan feel native in the app.

Scope:

- tune copy density
- improve empty states
- check mobile layout
- check logged-week display
- verify plan completion/dashboard summaries still read well
- add docs for the new generation behavior

Likely files:

- `app/src/components/*`
- `app/src/app/plan/[id]/page.tsx`
- `docs/ai-integration.md`
- `docs/overview.md`

Validation:

- `npm run test:unit`
- `npx tsc --noEmit`
- `npm run build`
- relevant Playwright tests if available
- manual smoke test: register, intake, generate, view, log, adjust

Exit criteria:

- plans feel richer without feeling cluttered
- core workout logging remains fast
- old and new plans both render cleanly

## Suggested Delivery Order

Recommended order:

1. [x] Batch 1: Snapshot Compatibility Foundation
2. [x] Batch 2: Render Existing Rich Fields
3. [x] Batch 3: Prompt Wording for Rich Weekly Output
4. [x] Batch 4: Soft Validation and Prose Repair
5. [x] Batch 5: Intake Context Enrichment
6. [x] Batch 6: Full-Block Strategy Generation
7. [x] Batch 7: Prior-Week Coherence Improvements
8. [x] Batch 8: Rich Adjustment Explanations
9. [x] Batch 9: Provider and Cost Controls
10. [x] Batch 10: Product Polish and Regression Pass

First useful milestone:

- complete Batches 1-4
- generated plans should already feel meaningfully richer
- no database migration should be required
- old plans should continue working

Second useful milestone:

- complete Batches 5-7
- plans should start feeling coherent across the whole block, not just richer per week

Third useful milestone:

- complete Batches 8-10
- adjustments, logs, docs, and UI polish catch up with the richer generation model

## Success Criteria

The generated plan should feel better when:

- the user can understand why each week exists
- sessions include usable intensity and modification guidance
- the plan adapts to age, recovery, equipment, and constraints
- the week-to-week progression feels intentional
- the user can still log workouts quickly
- old plans still render
- malformed prose does not break plan generation

The goal is not to make the app return a ChatGPT essay. The goal is to combine ChatGPT-like coaching intelligence with app-native structure, editing, and workout tracking.
