# AI Simulator

## Current status

The simulator is implemented as a separate top-level service in:

- `simulator/`

It currently supports:

- guided-intake responses for the app's `PlanIntakeAiResponse` prompt contract
- plan-generation responses, including the sequential worker's next-week prompts

Interactive plan-adjustment testing uses deterministic app-side helpers in `app/src/lib/plan-adjustment-chat.ts` and `app/src/app/actions.ts`; it is not handled by this Docker simulator service.

Out of scope for now:

- remote future-plan adjustment generation
- conversational coaching flows

## Why it exists

The simulator lets the app exercise guided intake and plan generation without spending money on a live model during normal development, Docker demos, or automated tests.

## Current structure

- `simulator/package.json`
- `simulator/Dockerfile`
- `simulator/src/server.js`
- `simulator/src/generate-intake.js`
- `simulator/src/generate-plan.js`
- `simulator/src/templates.js`

## Current API

### `POST /v1/chat/completions`

Accepts an OpenAI-compatible chat completions payload.

Supported prompt families:

- NeMo guardrail self-check prompts that require a strict `yes` or `no`
- guided-intake prompts containing the app's `PlanIntakeAiResponse` instruction marker
- plan-generation prompts for single-week and next-week generation

Guardrail self-check prompts are detected before guided-intake prompts because NeMo can include the original intake prompt marker inside the self-check text. Normal training-plan self-checks return `no`; clearly unsafe checked content returns `yes`.

Guided-intake prompts return simulated `PlanIntakeAiResponse` JSON inside an OpenAI-compatible chat-completions response. Plan-generation prompts return generated week JSON.

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

### `GET /debug/last-request`

Returns a redacted summary of the most recent simulator request. This is intended for local development only.

The response includes prompt type, scenario, error mode, selected non-secret headers, prompt character count, and a short prompt preview. Authorization is redacted.

### `GET /debug/requests`

Returns the most recent redacted simulator request summaries, capped to a small in-memory list.

## Docker behavior

In Docker, the `web` and `plan-worker` services point `ANTHROPIC_BASE_URL` at:

```text
http://simulator:8787
```

With `AI_INTAKE_MODE=simulator`, guided intake also sends its OpenAI-compatible chat-completions request to the simulator service. `web` still validates and merges the response before the UI sees it.

For plan generation, `web` creates the generation job, and `plan-worker` sends the sequential week prompts to the simulator.

To switch between simulator and a live backend, copy the appropriate env file to `app/.env` and recreate `web` plus `plan-worker`.

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
- `schema_invalid` / `schema-invalid` for guided-intake responses only

Plan-generation repair testing can target a later week:

```bash
AI_SIMULATOR_ERROR_MODE=http_500
AI_SIMULATOR_ERROR_WEEK=3
AI_SIMULATOR_ERROR_ONCE=0
```

With that setup, Week 1 and Week 2 can generate normally, Week 3 fails until the error mode is cleared, and the app can show the failed-job repair UI. After entering repair guidance, clear the error mode and restart the simulator/worker; the worker can resume from Week 3.

Use `AI_SIMULATOR_ERROR_ONCE=1` when you want to test a transient provider error that succeeds on retry. Because the generator retries failed model calls before marking the job failed, one-time errors may recover without showing the repair UI.

## Logging

The simulator logs guided-intake and plan-generation requests so you can tail it during testing:

```bash
docker compose logs -f web plan-worker simulator
```

Example line:

```text
[simulator] accepted prompt type=intake scenario=baseline mode=none
[simulator] generated intake status=needs_more_info scenario=baseline seed=demo-seed mode=none durationMs=1
[simulator] accepted prompt type=guardrail-input-check scenario=baseline mode=none
[simulator] generated guardrail check type=guardrail-input-check decision=no
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
- guided-intake flow checks
- Playwright onboarding generation tests
- plan-page and editor UI tests that should avoid paid generation calls
- manual testing of the plan-generation path
- parser and error-handling checks

## Test guard rule

Any Playwright test that can trigger AI-backed generation must be simulator-gated. Use `skipIfWebIsNotSimulator(test)` when only the web service can call the backend, and `skipIfWorkerStackIsNotSimulator(test)` when the plan worker is involved. This keeps automated tests from accidentally spending live-provider tokens or depending on nondeterministic model output.

The route-parity Playwright coverage lives in `testing/tests/intake-route-parity.spec.ts`. It runs the same guided-intake readiness scenarios against either:

- non-NeMo simulator intake: `web -> simulator`
- NeMo-gated simulator intake: `web -> guardrails -> simulator`

The parity scenarios cover climbing, cycling, running, and strength and conditioning. The spec skips itself unless the current Docker stack is simulator-backed with `AI_INTAKE_MODE=simulator` or `AI_GUARDRAILS_MODE=intake`.

## Future improvements

The next reasonable simulator improvements would be:

- more scenarios
- an HTTP adjustment simulator that consumes `PlanAdjustmentRequest`
- fixture-backed regression cases
- stronger scenario-specific intake fixtures
- explicit scenario overrides from tests

## Intake Simulator Migration

### Current State

The simulator service now handles guided-intake and plan-generation prompts.

Current simulator-mode routing:

```text
Guided intake chat:
browser -> web container -> simulator container -> simulated PlanIntakeAiResponse JSON
web container -> validate, merge, enforce readiness

Plan generation:
plan-worker container -> simulator container -> generated week JSON
```

Current guided-intake logs should use:

```text
source=simulator surface=intake
```

Older logs may show `source=local-intake` or `source=local-simulator`; those lines mean app-local deterministic intake logic ran inside the `web` container. They do not mean the Docker `simulator` service handled the intake chat.

The reason this logic lives in the web app today is historical and practical:

- the deterministic intake fallback existed before the Docker simulator service became the main local AI backend
- intake needed to work without any network call during early UI and unit-test development
- Zod validation, draft merging, duplicate-question protection, and readiness rules were already app-owned invariants
- the Docker simulator was built first for plan generation because that path was the expensive/live-AI path

The current simulator-backed intake path keeps app-owned invariants in the web app, while moving most fake model behavior for intake into the simulator service.

### Target State

The main target routing is now in place:

```text
Guided intake chat:
browser -> web container -> simulator container -> simulated PlanIntakeAiResponse JSON
web container -> validate, merge, enforce readiness

Plan generation:
plan-worker container -> simulator container -> generated week JSON
```

The simulator produces OpenAI-compatible chat-completions responses for intake prompts, just as it already does for plan-generation prompts.

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

- [x] Update `docs/ai-simulator.md` so it accurately reflects the current simulator state.
- [x] Explicitly document that `AI_INTAKE_MODE=local` runs deterministic intake inside the `web` container.
- [x] Explicitly document that `ANTHROPIC_BASE_URL=http://simulator:8787` is used by plan generation, not by local guided-intake chat when `AI_INTAKE_MODE=local`.
- [x] Rename log source `local-simulator` to `local-intake`.
- [x] Update timing docs and validation docs that currently refer to `source=local-simulator`.
- [x] Keep backward-compatible wording in docs for older logs, for example: older logs may show `source=local-simulator`.

### Batch 2: Add Intake Prompt Detection To The Simulator

Goal: let the simulator recognize intake prompts without changing web routing yet.

- [x] Add intake prompt detection in `simulator/src/server.js`.
- [x] Detect prompts built by `buildCoachIntakePrompt` by matching `Return a PlanIntakeAiResponse JSON object`.
- [x] Route recognized intake prompts to the simulator intake generator while keeping existing plan-generation support unchanged.
- [x] Log distinct prompt types where supported or rejected:

```text
[simulator] accepted prompt type=intake ...
[simulator] generated intake status=...
[simulator] accepted prompt type=next-week ...
```

- [x] Add simulator unit tests for prompt detection.
- [x] Update `docs/ai-simulator.md` after this batch so the current API section lists intake as recognized.

### Batch 3: Implement Simulated Intake Responses

Goal: move most fake intake behavior from the web app into the simulator service.

- [x] Add a simulator intake generator, `simulator/src/generate-intake.js`.
- [x] Make it return valid `PlanIntakeAiResponse` JSON in an OpenAI-compatible chat-completions response.
- [x] Preserve deterministic behavior for common guided-intake paths:
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
- [x] Keep responses model-like enough to exercise app-side parsing, merging, duplicate-question cleanup, and readiness checks.
- [x] Add simulator tests for normal intake, terse answers like `no`, and final-review completion.
- [x] Update `docs/ai-simulator.md` after this batch so it reflects that the simulator can generate intake responses, not only recognize intake prompts.

### Batch 4: Add Simulator-Backed Intake Mode In The Web App

Goal: route guided intake over HTTP to the simulator in simulator mode.

- [x] Add a distinct intake mode:

```text
AI_INTAKE_MODE=simulator
```

- [x] Keep `AI_INTAKE_MODE=local` available as a pure in-web deterministic fallback for unit tests and debugging.
- [x] When `AI_INTAKE_MODE=simulator`, make `continuePlanIntakeWithAiContract` use the normal model-backed transport pointed at `ANTHROPIC_BASE_URL`.
- [x] Use provider-oriented source and surface markers:

```text
source=simulator surface=intake
```

- [x] Do not bypass NeMo when `AI_GUARDRAILS_MODE=intake`; guarded mode still takes precedence and routes to `AI_GUARDRAILS_BASE_URL`.
- [x] Update `app/.env-simulator` to use `AI_INTAKE_MODE=simulator` once the service supports intake.
- [x] Update tests that currently assume simulator/local backend means no HTTP intake call.
- [x] Update `docs/ai-simulator.md` after this batch with the new routing diagram and env settings.

### Batch 5: Add Latency And Error Controls For Intake

Goal: make simulator-backed intake useful for performance and error-path testing.

- [x] Extend simulator latency controls to intake responses.
- [x] Extend simulator error modes to intake:
  - [x] HTTP 500
  - [x] timeout
  - [x] invalid JSON
  - [x] truncated JSON
  - [x] schema-invalid `PlanIntakeAiResponse`
- [x] Add logs with timing-friendly fields, for example:

```text
[simulator] generated intake scenario=baseline mode=none durationMs=...
```

- [x] Add app-side tests proving intake fallback/error handling still works.
- [x] Update `docs/ai-simulator.md` after this batch with the supported intake error modes.

### Batch 6: Update Validation And Timing Runbooks

Goal: make future measurements unambiguous.

- [x] Update `docs/timings.md` to distinguish:
  - local in-web deterministic intake
  - simulator-backed intake
  - direct live AI intake
  - NeMo-gated intake
- [x] Update `docs/nemo-intake-validation.md` so simulator-backed intake is not confused with NeMo-gated simulator mode.
- [x] Update `docs/backend_timings.md` examples to use the new source names.
- [x] Add commands for collecting simulator-backed intake logs:

```powershell
docker compose logs web simulator --no-color --timestamps --since 24h
```

- [x] Update `docs/ai-simulator.md` after this batch with the final runbook links and current recommended simulator workflow.
- [x] Add route-parity Playwright coverage for climbing, cycling, running, and strength and conditioning so the same scenarios can run with NeMo off or NeMo intake mode on.
- [x] Teach the simulator to answer NeMo input/output self-check prompts with strict `yes` or `no` responses before checking for the intake marker. This keeps NeMo from treating simulator-generated intake JSON as a failed self-check.

### Batch 7: Retire Or Narrow The In-Web Intake Simulator

Goal: reduce duplicate logic after HTTP simulator intake is stable.

- [x] Decide whether to keep `AI_INTAKE_MODE=local`.
- [x] If kept, document it as a unit-test/development-only fallback, not the default simulator path.
- [x] Decide not to remove `AI_INTAKE_MODE=local`; keep it as a narrow in-web fallback for helper-level tests and debugging.
- [x] Keep app-side validation and readiness guards in place regardless of simulator behavior.
- [x] Update `docs/ai-simulator.md` after this batch so it reflects the actual current state and no longer describes the older local path as the default.

### Decisions

- Default simulator env: `app/.env-simulator` now uses `AI_INTAKE_MODE=simulator`. Keep `AI_INTAKE_MODE=local` as a narrow fallback for helper-level unit tests or debugging.
- Simulator implementation: use a separate small deterministic implementation in the simulator service first. Do not share too much app code, because the simulator should exercise the HTTP/model boundary like an external service.
- Shared fixtures: prefer shared transcript fixtures and expected draft snapshots over shared implementation code.
- Debug endpoint: the simulator now exposes local-only `GET /debug/last-request` and `GET /debug/requests` endpoints with auth redacted.
- Log naming: keep `source` provider-oriented and add `surface` for the feature area. Preferred examples:

```text
source=simulator surface=intake
source=simulator surface=plan-generation
source=direct-ai surface=intake
source=nemo-guardrails surface=intake
```
