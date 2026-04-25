# AI Integration

## Current status

The stable AI integration today is **plan generation**.

File:

- `app/src/lib/ai-plan-generator.ts`

The repository still contains AI week-adjustment prototype code in:

- `app/src/lib/ai-plan-adjuster.ts`

but that path is no longer the main product direction and should be treated as experimental.

## Plan generation

Input:

- goals
- current grade
- target grade
- age
- weeks duration
- days per week
- equipment
- discipline

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

When the app is pointed at a local simulator-like base URL, it may include the current username in a request header so simulator logs can show who triggered plan generation.

That username header is **not** sent to live provider URLs such as OpenRouter.

## Storage model impact

AI output is not written into normalized `Week/Day/Exercise` tables.

Instead:

- generated plans become `PlanVersion.planSnapshot`
- onboarding inputs become `PlanVersion.profileSnapshot`
- user history stays in `WorkoutLog`

That makes generated plans easier to revise later without destroying historical logs.
