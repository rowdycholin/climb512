# AI Simulator

## Current status

The simulator is now implemented as a separate top-level service in:

- `simulator/`

It currently supports **plan generation only**, including the sequential worker's next-week prompts.

Out of scope for now:

- future-plan adjustment generation
- remote AI intake responses
- conversational coaching flows

## Why it exists

The simulator lets the app exercise the plan-generation path without spending money on a live model during normal development, Docker demos, or automated tests.

## Current structure

- `simulator/package.json`
- `simulator/Dockerfile`
- `simulator/src/server.js`
- `simulator/src/generate-plan.js`
- `simulator/src/templates.js`

## Current API

### `POST /v1/chat/completions`

Accepts an OpenAI-compatible chat completions payload and returns generated week JSON for plan-generation prompts.

### `GET /health`

Simple liveness check.

### `GET /config`

Returns the active simulator runtime config:

- `seed`
- `scenario`
- `latencyMs`
- `errorMode`
- supported scenarios

## Docker behavior

In Docker, the `web` service points `ANTHROPIC_BASE_URL` at:

```text
http://simulator:8787
```

So plan generation uses the simulator by default unless you explicitly override the base URL.

## Runtime controls

Environment variables:

```text
AI_SIMULATOR_SEED=demo-seed
AI_SIMULATOR_SCENARIO=baseline
AI_SIMULATOR_LATENCY_MS=0
AI_SIMULATOR_ERROR_MODE=none
```

### Seed

`AI_SIMULATOR_SEED` makes generated plans deterministic for the same input + scenario combination.

### Scenario

Current scenarios:

- `baseline`
- `hangboard_bouldering`
- `sport_endurance`
- `deload_preview`

### Latency

`AI_SIMULATOR_LATENCY_MS` adds an artificial delay before the response.

### Error mode

Current error modes:

- `none`
- `http_500`
- `timeout`
- `invalid_json`
- `truncated_json`

## Logging

The simulator logs plan-generation requests so you can tail it during testing:

```bash
docker compose logs -f simulator
```

Example line:

```text
[simulator] generated plan user=testuser1 weeks=4 daysPerWeek=2 sport=climbing goalType=event discipline=bouldering scenario=baseline seed=demo-seed mode=none
```

The login ID header is only sent when the app is talking to a simulator-like local backend, not to a live provider.

## Current generator behavior

The simulator uses a rule-based generator:

- training day pattern comes from `daysPerWeek`
- theme comes from week number, phase, and event vs ongoing goal type
- exercise templates come from sport and discipline
- strength-training requests add support sessions/exercises
- injuries, limitations, and exercises to avoid can substitute safer exercise variants
- equipment can swap in specific exercise variants
- grade, age, and goals are included in the generated plan shape but are still used lightly
- seeded randomness adds controlled variation

This keeps plans believable enough for UI testing without pretending to be a real model.

## Recommended use

- Docker demos
- Playwright onboarding generation tests
- plan-page and editor UI tests that should avoid paid generation calls
- manual testing of the plan-generation path
- parser and error-handling checks

## Future improvements

The next reasonable simulator improvements would be:

- more scenarios
- an adjustment simulator that consumes `PlanAdjustmentRequest`
- fixture-backed regression cases
- stronger log visibility and request introspection
- explicit scenario overrides from tests
