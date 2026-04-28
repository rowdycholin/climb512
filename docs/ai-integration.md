# AI Integration

## Current status

The stable AI integration today is **plan generation**. The app also has a guided intake screen that produces a generic `PlanRequest` before generation.

Files:

- `app/src/lib/ai-plan-generator.ts`
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

Guided intake generation sends the structured `PlanRequest` directly to the generator and stores the original request in `PlanVersion.profileSnapshot.planRequest`.

`Plan.startDate` is saved on the `Plan` record for calendar positioning. It is included in the structured request for guided intake but the durable calendar anchor remains the `Plan.startDate` column.

## Guided intake

The `/intake` route is the first step toward a generic chat-based plan intake. Today it is intentionally conservative:

- it is a rule-based interview flow, not a remote AI call
- it asks for sport/discipline, goal, timeline, equipment, strength training, start date, current level, schedule, and injuries/limitations
- it extracts a generic `PlanRequest` from the user's answers
- the structured draft stays hidden from the UI and is submitted once required fields are ready
- it sends `PlanRequest` to the generator
- the simulator consumes `PlanRequest` fields for sport selection, event vs ongoing goals, strength support, and injury/avoid-exercise substitutions

This keeps the UI and validation path ready for a future model-backed intake while giving the simulator and generator a clear migration target.

Output:

- an array of generated week objects
- each week contains 7 days
- each day contains sessions and exercises

That raw result is converted into:

- `profileSnapshot`
- `planSnapshot`

and persisted as a new `PlanVersion`.

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
