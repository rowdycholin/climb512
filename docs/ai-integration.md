# AI Integration

## Current status

The stable AI integration today is **plan generation**. The app also has a guided intake screen that produces a generic `PlanRequest` before generation.

File:

- `app/src/lib/ai-plan-generator.ts`
- `app/src/lib/plan-request.ts`
- `app/src/lib/intake.ts`

The repository still contains AI week-adjustment prototype code in:

- `app/src/lib/ai-plan-adjuster.ts`

but that path is no longer the main product direction and should be treated as experimental.

## Plan generation

Legacy generator input:

- goals
- current grade
- target grade
- age from the registered user record
- weeks duration
- days per week
- equipment
- discipline

`Plan.startDate` is saved on the `Plan` record for calendar positioning. It is not currently sent as an AI generation input.

## Guided intake

The `/intake` route is the first step toward a generic chat-based plan intake. Today it is intentionally conservative:

- it is a rule-based interview flow, not a remote AI call
- it asks for sport/discipline, goal, timeline, equipment, strength training, start date, current level, schedule, and injuries/limitations
- it extracts a generic `PlanRequest` from the user's answers
- the user can edit the draft before generation
- it adapts `PlanRequest` to the legacy `PlanInput` shape that the current generator uses
- it still targets the current climbing plan generator

This keeps the UI and validation path ready for a future model-backed intake while giving the simulator and generator a clear migration target.

Output:

- an array of generated week objects
- each week contains 7 days
- each day contains sessions and exercises

That raw result is converted into:

- `profileSnapshot`
- `planSnapshot`

and persisted as a new `PlanVersion`.

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
- manual onboarding inputs and the guided-intake legacy adapter output become `PlanVersion.profileSnapshot`
- user history stays in `WorkoutLog`

That makes generated plans easier to revise later without destroying historical logs.
