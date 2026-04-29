# AI Integration

## Current status

The stable AI integration today is **plan generation**. The app also has a guided intake screen that produces a generic `PlanRequest` before generation.

Files:

- `app/src/lib/ai-plan-generator.ts`
- `app/src/lib/plan-generation-worker.ts`
- `app/src/worker/plan-generation-worker.ts`
- `app/src/lib/plan-request.ts`
- `app/src/lib/intake.ts`
- `app/src/lib/plan-adjustment-request.ts`

The plan page also has a day-level future adjustment flow in:

- `app/src/components/PlanAdjuster.tsx`
- `app/src/app/actions.ts` (`adjustFuturePlan`)

That adjustment flow uses deterministic rewriting today, but it is shaped around `PlanAdjustmentRequest` so a real AI adjustment provider can be plugged in later. The older constrained week-adjustment helper in `app/src/lib/ai-plan-adjuster.ts` still exists as legacy prototype code.

## Plan generation

Manual onboarding still uses the legacy generator input:

- goals
- current grade
- target grade
- age from the registered user record
- weeks duration
- days per week
- equipment
- discipline

Guided intake creates a plan shell, stores the original `PlanRequest` in `PlanVersion.profileSnapshot.planRequest`, and creates a `PlanGenerationJob`. The `plan-worker` service then generates one week at a time and saves a new partial `PlanVersion` after each week.

Manual onboarding still generates the full plan in the request/response path until the worker flow is stable.

`Plan.startDate` is saved on the `Plan` record for calendar positioning. It is included in the structured request for guided intake but the durable calendar anchor remains the `Plan.startDate` column.

## Guided intake

The `/intake` route is the first step toward a generic chat-based plan intake. Today it is intentionally conservative:

- it uses the live AI provider for a coach-led interview when pointed at a live backend
- local/simulator mode can still use deterministic fallback extraction for tests and demos
- it asks flexible follow-up questions around sport/discipline, goal, timeline, equipment, strength training, start date, current level, schedule, preferences, and injuries/limitations
- it extracts a generic `PlanRequest` from the user's answers
- the structured draft stays hidden from the UI and is submitted once required fields are ready
- it creates a `PlanGenerationJob` from the completed `PlanRequest`
- the simulator consumes `PlanRequest` fields for sport selection, event vs ongoing goals, strength support, and injury/avoid-exercise substitutions

The model still has to return the validated `PlanIntakeAiResponse` JSON contract. Invalid output falls back without mutating the draft.

The intake prompt includes today's date. The server also normalizes common date answers and guards against past start dates, including natural inputs like `today`, `now`, `as soon as possible`, `10/15/26`, and `Monday May 4th`.

Worker output:

- one generated week object per job iteration
- each week contains 7 days
- each day contains sessions and exercises

That raw result is converted into:

- `profileSnapshot`
- partial `planSnapshot`

and persisted as a new `PlanVersion` after each generated week.

## Plan adjustment

Future-plan adjustment starts from the plan page's `Adjust Plan` panel:

1. the user selects a change reason and describes what should change
2. the app calculates the next unlogged plan day
3. locked historical days and recent logs are summarized in a `PlanAdjustmentRequest`
4. the future portion of the plan is rewritten
5. locked history is validated as unchanged
6. the adjusted snapshot is saved as a new `PlanVersion`

The current rewrite step is deterministic. The intended AI integration point is the same request/response boundary, not a direct mutation of stored logs or old versions.

## Response handling

Plan generation:

- requests JSON-only output
- strips markdown fences if needed
- parses the returned content
- repairs some truncated JSON responses when possible
- normalizes week/day/session/exercise fields into the app's plan types

## Runtime backends

The app uses an OpenAI-compatible `chat/completions` transport via plain `fetch`.

There are currently two backend modes:

### Docker default

- `ANTHROPIC_BASE_URL=http://simulator:8787`
- generation goes to the local simulator service

### Live provider

- `ANTHROPIC_BASE_URL=https://openrouter.ai/api`
- generation goes to the configured remote provider

The app appends `/v1/chat/completions` itself.

## Environment variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | backend auth token |
| `ANTHROPIC_BASE_URL` | provider base URL |
| `ANTHROPIC_MODEL` | model identifier |
| `ANTHROPIC_MAX_TOKENS` | output token cap |
| `ANTHROPIC_INTAKE_MAX_TOKENS` | intake response token cap |
| `AI_INTAKE_MODE=local` | force deterministic local intake fallback |

## Privacy note

When the app is pointed at a local simulator-like base URL, it may include the current session login ID in a request header so simulator logs can show who triggered plan generation.

That login header is **not** sent to live provider URLs such as OpenRouter.

## Storage model impact

AI output is not written into normalized `Week/Day/Exercise` tables.

Instead:

- generated plans become `PlanVersion.planSnapshot`
- manual onboarding inputs and guided-intake `PlanRequest` context become `PlanVersion.profileSnapshot`
- future adjustments become new `PlanVersion` rows with `changeType = "ai_future_adjustment"` and `effectiveFromDay`
- user history stays in `WorkoutLog`

That makes generated plans easier to revise later without destroying historical logs.
