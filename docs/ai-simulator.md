# AI Simulator Options

## Goal

Provide a zero-cost AI backend simulator for local development, Docker demos, and automated testing so the app can:

- generate plans
- exercise the same parsing and validation code paths as live plan generation
- avoid paid model calls during routine testing

The preferred design is to keep the simulator completely separate from the production app code in its own top-level `simulator/` directory.

This document is intentionally scoped to **plan generation only**.

AI-based plan adjustments are out of scope for now because that feature direction is likely to be redesigned rather than extended from the current implementation.

## Current scope

The simulator only needs to satisfy the current plan generation path:

- [app/src/lib/ai-plan-generator.ts](/abs/path/c:/Users/beatt/projects/cursor/climb512/app/src/lib/ai-plan-generator.ts)

Out of scope:

- AI reorder adjustments
- AI difficulty adjustments
- any future conversational coaching workflow

Those should be revisited later when the AI adjustment UX and backend contract are redesigned.

## Requirements

The simulator should:

- be free to run
- work in Docker and local dev
- support plan generation requests only
- return valid JSON in the same broad shape as the live provider
- be deterministic enough for tests
- be easy to turn on and off with env vars

Nice to have:

- optional seeded randomness for more realistic outputs
- response delay controls to simulate network/model latency
- error-mode toggles to test retries and parse failures

## Option 1: In-Process Mock Provider

### How it works

Add a small abstraction layer in the app:

- `generatePlanWithAI()` stops calling `fetch()` directly
- it calls a shared provider interface such as `completeJson({ kind, prompt, input })`
- when `AI_PROVIDER=mock`, the app uses in-process TypeScript generation instead of HTTP

Example:

- `app/src/lib/ai-provider.ts`
- `app/src/lib/mock-ai-provider.ts`

The mock provider would:

- generate week JSON from the structured `PlanInput`
- return objects that match the same parsed schema used today

### Pros

- fastest and simplest runtime
- no extra container or service
- easiest to debug
- easiest to make deterministic for tests
- strongest type safety because it lives in the same codebase

### Cons

- does not exercise the HTTP integration layer
- can drift away from real provider response shapes if not maintained
- less realistic if we want to test transport failures, timeouts, or malformed bodies
- weak separation from production app code

### Best fit

- unit/integration testing
- local dev when speed matters most
- deterministic CI

## Option 2: Local HTTP Simulator Service

### How it works

Run a local service that mimics the OpenAI-compatible API:

- listens on something like `http://simulator:8787/v1/chat/completions`
- Docker and local env point `ANTHROPIC_BASE_URL` to that service
- the app continues using `fetch()` unchanged

The service would inspect the request and return generated week JSON for plan generation prompts.

It should be implemented in its own top-level directory, for example:

- `simulator/`
- `simulator/package.json`
- `simulator/src/server.ts`
- `simulator/src/routes/chat-completions.ts`
- `simulator/src/lib/generate-plan.ts`
- `simulator/src/lib/templates.ts`

Not recommended:

- a Next route inside `app/`, because that blurs the boundary between the real app and the fake provider

### Pros

- preserves the current HTTP call pattern
- exercises headers, request body shape, response parsing, and network errors
- easy to add simulation modes:
  - slow responses
  - 500s
  - invalid JSON
  - truncated output
- strong separation from app code

### Cons

- more moving parts than an in-process provider
- another service to start and maintain
- slightly slower and noisier in tests

### Best fit

- full-stack E2E testing
- Docker demo mode
- verifying provider integration behavior without paid calls

## Option 3: Recorded Fixture Replay

### How it works

Capture a library of real plan-generation responses once, then replay them locally.

The replay layer maps known inputs to stored outputs:

- `simulator/fixtures/plan-generation/*.json`

At runtime:

- compute a lookup key from the request
- load a stored response
- return it either in-process or over a mock HTTP endpoint

### Pros

- realistic output style if fixtures came from real model responses
- highly deterministic
- very cheap to run after fixtures exist
- useful for regression testing parser behavior

### Cons

- narrow coverage unless many fixtures are curated
- brittle when prompts evolve
- not flexible for arbitrary user inputs in manual testing
- requires periodic fixture refresh if response contracts change

### Best fit

- regression suites
- parser validation
- stable smoke tests

## Option 4: Rule-Based Plan Generator Service

### How it works

Use a deterministic rule engine to generate believable week JSON without any real model call.

For plan generation:

- derive training days from `daysPerWeek`
- assign themes by week number and training phase
- choose exercise templates by discipline and equipment
- return compact strings that match the current schema contract

This is the most practical “fake AI” option for the current app because it supports arbitrary plan-generation inputs without relying on live provider calls.

### Pros

- flexible for arbitrary testing inputs
- deterministic enough for CI
- can be made realistic enough for manual testing
- works well as the core logic behind a standalone simulator service

### Cons

- more implementation work than a simple mock
- still not a real model
- requires thought to keep outputs varied but valid

### Best fit

- ongoing demo mode
- local manual testing
- Docker-based development

## Comparison

| Option | Realism | Simplicity | Tests | Exercises HTTP layer | Flexibility | Separation |
|---|---|---:|---:|---:|---:|---:|
| In-process mock | Medium | High | High | No | Medium | Low |
| Local HTTP simulator | High | Medium | High | Yes | Medium | High |
| Fixture replay | Medium | Medium | High | Optional | Low | High |
| Rule-based generator service | Medium-High | Medium | High | Yes, if wrapped in HTTP | High | High |

## Recommendation

Recommend **a rule-based plan generator exposed through a separate top-level `simulator/` HTTP service**.

In practice that means:

1. build a small rule-based simulator service in `simulator/`
2. expose it through a local OpenAI-compatible mock endpoint
3. switch between real AI and simulator with env vars

This gives the best balance for this project because:

- it preserves the current `fetch()` integration path
- it works cleanly in Docker
- it supports both manual testing and Playwright tests
- it can generate arbitrary plans instead of only replaying canned fixtures
- it can still offer deterministic modes for CI
- it keeps the fake backend clearly separate from production app code
- it avoids investing in AI-adjustment simulation before that feature is redesigned

## Recommended Design

### Environment switch

Add env vars such as:

```text
AI_MODE=live | simulate
AI_SIMULATOR_SEED=demo-seed
AI_SIMULATOR_LATENCY_MS=0
AI_SIMULATOR_ERROR_MODE=none
```

Behavior:

- `AI_MODE=live`: current provider behavior
- `AI_MODE=simulate`: point the app to the local simulator service

Suggested base URLs:

- local dev: `ANTHROPIC_BASE_URL=http://localhost:8787`
- Docker: `ANTHROPIC_BASE_URL=http://simulator:8787`

### Suggested architecture

Simulator service:

- `simulator/`
- `simulator/package.json`
- `simulator/src/server.ts`
- `simulator/src/routes/chat-completions.ts`
- `simulator/src/lib/generate-plan.ts`
- `simulator/src/lib/templates.ts`

Responsibilities:

- generate week JSON from `PlanInput`
- support seeded deterministic output
- optionally simulate provider-like errors and latency

The simulator should return a response shaped like:

```json
{
  "choices": [
    {
      "message": {
        "content": "{\"weekNum\":1,\"theme\":\"Foundation\",\"days\":[...]}"
      },
      "finish_reason": "stop"
    }
  ]
}
```

That keeps [ai-plan-generator.ts](/abs/path/c:/Users/beatt/projects/cursor/climb512/app/src/lib/ai-plan-generator.ts) very close to its current behavior while preserving a clean app/provider boundary.

### Suggested routing logic

The simulator can detect plan-generation requests from the existing prompt shape for now.

Longer-term, a cleaner design would be to pass explicit metadata into a shared AI client:

- `taskType: "plan_generation"`

That would reduce prompt parsing fragility and make the simulator contract clearer.

## Example behaviors

### Plan generation

Inputs:

- `daysPerWeek=3`
- `discipline=bouldering`
- `equipment=["hangboard"]`

Simulator output:

- 3 training days + 4 rest days
- week theme based on phase
- strength/power exercises chosen from a template library
- compact strings matching current schema rules

## Error simulation modes

The simulator should support a few targeted failure modes:

- `none`
- `http_500`
- `timeout`
- `invalid_json`
- `truncated_json`

That will let us test:

- retry behavior
- JSON repair
- user-facing error messages

## Rollout Plan

### Phase 1

- add simulator doc and env contract
- implement rule-based simulator service in `simulator/`
- support plan generation only

### Phase 2

- wire it into Docker compose
- run it as a separate `simulator` service
- add Playwright config for simulator mode

### Phase 3

- add deterministic fixture-backed scenarios for regression tests
- add error simulation modes

## Recommended first implementation

If we want the smallest useful first step:

- create `simulator/`
- create a local mock chat completions endpoint in that service
- gate it with `AI_MODE=simulate`
- support:
  - plan generation
  - deterministic seed
  - optional latency and error modes

That would give us a practical, no-cost testing mode without changing the product UX or spending API money during normal development.
