# AI Simulator

## Current status

The simulator is now implemented as a separate top-level service in:

- `simulator/`

It currently supports **plan generation only**, including the sequential worker's next-week prompts.

Interactive plan-adjustment testing uses deterministic app-side helpers in `app/src/lib/plan-adjustment-chat.ts` and `app/src/app/actions.ts`; it is not handled by this Docker simulator service.

Out of scope for now:

- remote future-plan adjustment generation
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
- `errorWeek`
- `errorOnce`
- supported scenarios

## Docker behavior

In Docker, the `web` and `plan-worker` services point `ANTHROPIC_BASE_URL` at:

```text
http://simulator:8787
```

So guided-intake plan generation uses the simulator when `app/.env` points `ANTHROPIC_BASE_URL` at `http://simulator:8787`. `web` creates the generation job, and `plan-worker` sends the sequential week prompts to the simulator. To switch between simulator and a live backend, copy the appropriate env file to `app/.env` and recreate `web` plus `plan-worker`.

## Runtime controls

Environment variables:

```text
AI_SIMULATOR_SEED=demo-seed
AI_SIMULATOR_SCENARIO=baseline
AI_SIMULATOR_LATENCY_MS=0
AI_SIMULATOR_ERROR_MODE=none
AI_SIMULATOR_ERROR_WEEK=
AI_SIMULATOR_ERROR_ONCE=0
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

Batch 5 repair testing can target a later week:

```bash
AI_SIMULATOR_ERROR_MODE=http_500
AI_SIMULATOR_ERROR_WEEK=3
AI_SIMULATOR_ERROR_ONCE=0
```

With that setup, Week 1 and Week 2 can generate normally, Week 3 fails until the error mode is cleared, and the app can show the failed-job repair UI. After entering repair guidance, clear the error mode and restart the simulator/worker; the worker can resume from Week 3.

Use `AI_SIMULATOR_ERROR_ONCE=1` when you want to test a transient provider error that succeeds on retry. Because the generator retries failed model calls before marking the job failed, one-time errors may recover without showing the repair UI.

## Logging

The simulator logs plan-generation requests so you can tail it during testing:

```bash
docker compose logs -f web plan-worker simulator
```

Example line:

```text
[simulator] accepted prompt type=next-week user=testuser1 week=1/4 scenario=baseline mode=none
[simulator] generated plan week type=next-week user=testuser1 week=1/4 daysPerWeek=3 discipline=bouldering grades=V4->V6 scenario=baseline seed=demo-seed mode=none
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

## Test guard rule

Any Playwright test that can trigger AI-backed generation must be simulator-gated. Use `skipIfWebIsNotSimulator(test)` when only the web service can call the backend, and `skipIfWorkerStackIsNotSimulator(test)` when the plan worker is involved. This keeps automated tests from accidentally spending live-provider tokens or depending on nondeterministic model output.

## Future improvements

The next reasonable simulator improvements would be:

- more scenarios
- an HTTP adjustment simulator that consumes `PlanAdjustmentRequest`
- fixture-backed regression cases
- stronger log visibility and request introspection
- explicit scenario overrides from tests

## Planned Intake Simulator Migration

### Current State

The simulator service currently handles plan-generation prompts only.

Current simulator-mode routing is split:

```text
Guided intake chat:
browser -> web container -> deterministic TypeScript intake logic

Plan generation:
plan-worker container -> simulator container -> generated week JSON
```

That means guided intake logs use:

```text
source=local-simulator
```

In this context, `local-simulator` means app-local deterministic intake logic running inside the `web` container. It does not mean the Docker `simulator` service handled the intake chat. This naming is confusing and should be changed as part of the migration.

The reason this logic lives in the web app today is historical and practical:

- the deterministic intake fallback existed before the Docker simulator service became the main local AI backend
- intake needed to work without any network call during early UI and unit-test development
- Zod validation, draft merging, duplicate-question protection, and readiness rules were already app-owned invariants
- the Docker simulator was built first for plan generation because that path was the expensive/live-AI path

The end state should keep app-owned invariants in the web app, but move most fake model behavior for intake into the simulator service.

### Target State

Target simulator-mode routing:

```text
Guided intake chat:
browser -> web container -> simulator container -> simulated PlanIntakeAiResponse JSON
web container -> validate, merge, enforce readiness

Plan generation:
plan-worker container -> simulator container -> generated week JSON
```

The simulator should produce OpenAI-compatible chat-completions responses for intake prompts, just as it already does for plan-generation prompts.

The web app should still remain authoritative for:

- session handling
- parsing and validating `PlanIntakeAiResponse`
- merging drafts
- direct-answer recovery hints
- no-duplicate-question protection
- preferred workout day, preferred rest day, and final-review readiness checkpoints
- final `PlanRequest` validation
- plan creation and job creation

The simulator should own:

- deterministic fake intake response generation
- intake prompt detection
- simulator intake latency/error controls
- simulator-side intake logs
- route visibility showing that intake actually crossed the HTTP simulator boundary

### Batch 1: Document And Rename The Current Route

Goal: reduce confusion before changing behavior.

- [ ] Update `docs/ai-simulator.md` so it accurately reflects the current simulator state.
- [ ] Explicitly document that `AI_INTAKE_MODE=local` runs deterministic intake inside the `web` container.
- [ ] Explicitly document that `ANTHROPIC_BASE_URL=http://simulator:8787` is used by plan generation, not by local guided-intake chat when `AI_INTAKE_MODE=local`.
- [ ] Rename log source `local-simulator` to a clearer name such as `local-intake` or `deterministic-intake`.
- [ ] Update timing docs and validation docs that currently refer to `source=local-simulator`.
- [ ] Keep backward-compatible wording in docs for older logs, for example: older logs may show `source=local-simulator`.

### Batch 2: Add Intake Prompt Detection To The Simulator

Goal: let the simulator recognize intake prompts without changing web routing yet.

- [ ] Add intake prompt detection in `simulator/src/server.js`.
- [ ] Detect prompts built by `buildCoachIntakePrompt`, for example by matching `Return a PlanIntakeAiResponse JSON object` or a more explicit marker added to the prompt.
- [ ] Return a clear unsupported-prompt error for unknown prompt types, while keeping existing plan-generation support unchanged.
- [ ] Log distinct prompt types:

```text
[simulator] accepted prompt type=intake ...
[simulator] accepted prompt type=next-week ...
```

- [ ] Add simulator unit tests for prompt detection.
- [ ] Update `docs/ai-simulator.md` after this batch so the current API section lists intake as recognized if detection has landed.

### Batch 3: Implement Simulated Intake Responses

Goal: move most fake intake behavior from the web app into the simulator service.

- [ ] Add a simulator intake generator, for example `simulator/src/generate-intake.js`.
- [ ] Make it return valid `PlanIntakeAiResponse` JSON in an OpenAI-compatible chat-completions response.
- [ ] Preserve deterministic behavior for common guided-intake paths:
  - supported sport selection
  - running goal such as 10K
  - block length
  - days per week
  - start date
  - current level
  - equipment
  - strength preference
  - injuries/limitations
  - preferred workout days
  - preferred rest days
  - final review
- [ ] Keep responses model-like enough to exercise app-side parsing, merging, duplicate-question cleanup, and readiness checks.
- [ ] Add simulator tests for normal intake, terse answers like `no`, and final-review completion.
- [ ] Update `docs/ai-simulator.md` after this batch so it reflects that the simulator can generate intake responses, not only recognize intake prompts.

### Batch 4: Add Simulator-Backed Intake Mode In The Web App

Goal: route guided intake over HTTP to the simulator in simulator mode.

- [ ] Add a distinct intake mode such as:

```text
AI_INTAKE_MODE=simulator
```

- [ ] Keep `AI_INTAKE_MODE=local` available as a pure in-web deterministic fallback if it is still useful for unit tests.
- [ ] When `AI_INTAKE_MODE=simulator`, make `continuePlanIntakeWithAiContract` use the normal model-backed transport pointed at `ANTHROPIC_BASE_URL`.
- [ ] Use a clear source marker such as:

```text
source=simulator-intake
```

- [ ] Do not bypass NeMo when `AI_GUARDRAILS_MODE=intake`; guarded mode should still take precedence and route to `AI_GUARDRAILS_BASE_URL`.
- [ ] Update `app/.env-simulator` to use `AI_INTAKE_MODE=simulator` once the service supports intake.
- [ ] Update tests that currently assume simulator/local backend means no HTTP intake call.
- [ ] Update `docs/ai-simulator.md` after this batch with the new routing diagram and env settings.

### Batch 5: Add Latency And Error Controls For Intake

Goal: make simulator-backed intake useful for performance and error-path testing.

- [ ] Extend simulator latency controls to intake responses.
- [ ] Extend simulator error modes to intake:
  - HTTP 500
  - timeout
  - invalid JSON
  - truncated JSON
  - schema-invalid `PlanIntakeAiResponse`
- [ ] Add logs with timing-friendly fields, for example:

```text
[simulator] generated intake scenario=baseline mode=none durationMs=...
```

- [ ] Add app-side tests or Playwright smoke coverage proving intake fallback/error UI still works.
- [ ] Update `docs/ai-simulator.md` after this batch with the supported intake error modes.

### Batch 6: Update Validation And Timing Runbooks

Goal: make future measurements unambiguous.

- [ ] Update `docs/timings.md` to distinguish:
  - local in-web deterministic intake
  - simulator-backed intake
  - direct live AI intake
  - NeMo-gated intake
- [ ] Update `docs/nemo-intake-validation.md` so simulator-backed intake is not confused with NeMo-gated simulator mode.
- [ ] Update `docs/backend_timings.md` examples to use the new source names.
- [ ] Add commands for collecting simulator-backed intake logs:

```powershell
docker compose logs web simulator --no-color --timestamps --since 24h
```

- [ ] Update `docs/ai-simulator.md` after this batch with the final runbook links and current recommended simulator workflow.

### Batch 7: Retire Or Narrow The In-Web Intake Simulator

Goal: reduce duplicate logic after HTTP simulator intake is stable.

- [ ] Decide whether to keep `AI_INTAKE_MODE=local`.
- [ ] If kept, document it as a unit-test/development-only fallback, not the default simulator path.
- [ ] If removed, migrate tests to either:
  - pure helper-level unit tests, or
  - simulator-backed integration tests.
- [ ] Remove duplicate fake-model behavior from `app/src/lib/plan-intake-ai.ts` once it is safely covered in `simulator/src/generate-intake.js`.
- [ ] Keep app-side validation and readiness guards in place regardless of simulator behavior.
- [ ] Update `docs/ai-simulator.md` after this batch so it reflects the actual current state and no longer describes retired paths as active.

### Open Decisions

- Should the default simulator env become `AI_INTAKE_MODE=simulator` as soon as Batch 4 lands, or should it stay `local` until Playwright coverage is updated?
- Should simulator intake reuse the TypeScript intake helpers through a shared package, or should the Node simulator have its own small deterministic implementation?
- Should the simulator expose a debug endpoint for the last intake request, similar to a lightweight transcript inspector?
- Should `source=simulator-intake` describe the app transport source, or should source remain provider-oriented, such as `source=simulator` with `surface=intake`?
