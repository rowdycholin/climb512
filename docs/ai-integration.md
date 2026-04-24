# AI Integration

## Overview

The app currently uses AI in two places:

1. initial plan generation
2. week adjustments for reorder or difficulty changes

Both integrations use an OpenAI-compatible chat completions endpoint via plain `fetch`.

## Plan generation

File: `app/src/lib/ai-plan-generator.ts`

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

- an array of week objects
- each week contains 7 days
- each day contains sessions and exercises

That raw result is converted into:

- `profileSnapshot`
- `planSnapshot`

and persisted as a new `PlanVersion`.

## Adjustment generation

File: `app/src/lib/ai-plan-adjuster.ts`

Supported modes:

- `reorder`
- `difficulty`

Important constraint:

- the AI is not allowed to invent arbitrary structure changes
- proposals are validated against the existing week before they can be accepted

For `reorder`:

- the AI only reassigns existing training-day IDs to new weekday slots
- rest days are rebuilt deterministically by the app

For `difficulty`:

- the AI may revise the week content
- but it must preserve the same week/day/session/exercise IDs and counts

Accepted adjustments create a new `PlanVersion`.

## Response handling

Both integrations:

- request JSON-only output
- strip markdown fences if needed
- parse the model response
- raise an error if parsing or validation fails

Plan generation also includes truncated JSON repair so partially cut-off responses can sometimes still yield a valid shorter plan.

## Environment variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | provider key |
| `ANTHROPIC_BASE_URL` | provider base URL |
| `ANTHROPIC_MODEL` | model identifier |
| `ANTHROPIC_MAX_TOKENS` | output token cap |

Default provider setup:

```text
ANTHROPIC_BASE_URL=https://openrouter.ai/api
ANTHROPIC_MODEL=anthropic/claude-haiku-4-5
```

## Storage model impact

AI output is no longer written directly into relational week/day/exercise tables.

Instead:

- generated plans become `PlanVersion.planSnapshot`
- accepted AI adjustments become later `PlanVersion` rows
- user history stays in `WorkoutLog`

This makes AI output easier to review, compare, and replace without destroying prior history.
