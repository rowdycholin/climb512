# NeMo Guardrails Evaluation

Date reviewed: 2026-05-02

## Summary

NVIDIA NeMo Guardrails could help centralize some of our AI boundary logic, especially topic safety, prompt-injection checks, output checks, and reusable conversation policies. It is probably not a good replacement for our core typed intake state machine or plan-generation validators. The best fit is as an optional guardrails gateway around live AI calls, starting with intake safety/style rails and leaving `PlanIntakeAiResponse`, `PlanRequest`, generated week validation, and database/versioning rules in the TypeScript app.

Recommendation: do not move the whole intake flow into NeMo right now. Consider a small proof of concept where NeMo fronts only the live intake LLM call, while the app continues to own structured draft merging and readiness validation.

## What NeMo Provides

NeMo Guardrails is an open-source Python package for adding programmable guardrails to LLM applications. NVIDIA documents it as a development-time library and also as a production microservice configuration format using YAML and Colang. Configurations are portable between the library and microservice.

Important capabilities for this app:

- Input rails: run checks before user input reaches the LLM.
- Output rails: validate or block the assistant response before it reaches the app.
- Dialog rails: steer conversation flow using Colang.
- Execution rails: control actions/tool calls before and after invocation.
- Custom Python actions: reusable guardrail logic outside the main app code.
- OpenAI-compatible guardrails server: can expose `/v1/chat/completions`, which matches our current provider style reasonably well.

Sources:

- NVIDIA overview: https://docs.nvidia.com/nemo/guardrails/latest/about/overview.html
- Configuration overview: https://docs.nvidia.com/nemo/guardrails/latest/configure-rails/index.html
- Custom actions: https://docs.nvidia.com/nemo/guardrails/latest/configure-rails/actions/index.html
- API server: https://docs.nvidia.com/nemo/guardrails/latest/reference/api-server-endpoints/index.html
- GitHub README: https://github.com/NVIDIA-NeMo/Guardrails

## Where It Could Help Us

The current app has guardrail logic spread across `app/src/lib/plan-intake-ai.ts`, prompt text, validation helpers, fallback questions, and tests. NeMo could centralize some of that policy into a dedicated configuration folder.

Good candidates:

- Refusing unrelated requests during intake.
- Blocking prompt injection, secrets, credentials, and hidden-instruction requests.
- Enforcing "training-plan intake only" topic boundaries.
- Requiring a coach-like tone before the next intake question.
- Checking that model output is valid JSON before returning it to the app.
- Detecting obviously truncated or malformed output.
- Keeping standard safety wording consistent across intake, adjustment chat, and generation.

This would make those policies easier to tweak without hunting through TypeScript prompt strings. It also creates a place to test guardrail behavior independently from the web app.

## Where It Is Not a Good Fit

NeMo should not replace the app's durable product logic:

- `PlanRequest` schema validation.
- Intake draft merge behavior.
- Readiness checks before enabling plan creation.
- Start-date normalization and calendar semantics.
- Workout log protection.
- Adjustment versioning and locked-day validation.
- Week/day/session/exercise snapshot validation.
- Prisma persistence and migration logic.

Those rules are application invariants, not just LLM behavior. Keeping them in TypeScript makes the system easier to reason about and keeps tests close to the data model.

The biggest risk is accidentally creating another interviewer on top of the AI. We have already seen that rigid app-side fallback questions can make the experience feel like a form and can cause repeated questions. If we use NeMo dialog rails too aggressively, we could recreate the same problem in Colang.

## Integration Options

### Option 1: No NeMo For Now

Keep all guardrails in TypeScript. Continue refining prompts, validators, and tests.

Pros:

- Lowest operational complexity.
- No Python service.
- No new Docker image or dependency stack.
- Current tests remain straightforward.

Cons:

- Guardrail policy remains scattered through app code.
- Style/safety changes require code changes and rebuilds.
- Harder to share policy across intake, adjustment, and generation.

### Option 2: NeMo As A Guardrails Gateway For Live Intake Only

Add a `guardrails` service in Docker. The app points intake calls at NeMo, and NeMo calls the real AI backend. The app still validates `PlanIntakeAiResponse` and merges draft state.

Pros:

- Smallest useful pilot.
- Centralizes intake boundary/style rails.
- Easy to compare live intake behavior with and without NeMo.
- Limits blast radius if NeMo creates latency or behavior issues.

Cons:

- Adds Python runtime and service management.
- Need config for OpenRouter/OpenAI-compatible backend.
- Need to make sure NeMo does not rewrite JSON in a way that breaks our parser.
- Extra LLM checks can add latency and token cost.

### Option 3: NeMo Around All Live AI Calls

Route intake, plan generation, and adjustment chat through NeMo.

Pros:

- One guardrails gateway for all model calls.
- Shared policy across the whole AI surface.
- Potentially cleaner production operations later.

Cons:

- Higher risk.
- Plan generation already uses strict JSON contracts and validators.
- Multi-week generation and adjustment jobs are latency-sensitive.
- Output rails on large JSON plan snapshots could be expensive or brittle.

### Option 4: Move Dialog Flow Into NeMo

Use Colang dialog rails to model the intake interview.

Pros:

- Centralized conversational flow.
- Stronger control over required checkpoints.

Cons:

- This is the path most likely to recreate the "form-like" behavior.
- Our product goal is coach-led, model-led conversation with app-side structured validation.
- Colang flow logic would duplicate some of our existing draft/readiness logic.

## Recommended Implementation Path

Start with Option 2 as a contained proof of concept.

1. Add a `guardrails/` directory:

   - `guardrails/intake/config.yml`
   - `guardrails/intake/rails/input.co`
   - `guardrails/intake/rails/output.co`
   - optional `guardrails/intake/actions.py`

2. Add a Docker service:

   - service name: `guardrails`
   - exposes internal port, for example `8000`
   - runs `nemoguardrails server --config /configs --port 8000`

3. Add env switching:

   - `AI_GUARDRAILS_MODE=off|intake`
   - `AI_GUARDRAILS_BASE_URL=http://guardrails:8000`
   - keep existing `ANTHROPIC_BASE_URL` for direct-provider mode

4. In `plan-intake-ai.ts`, route only model-backed intake calls through NeMo when enabled:

   - direct mode: current `ANTHROPIC_BASE_URL`
   - guarded mode: `AI_GUARDRAILS_BASE_URL/v1/chat/completions`

5. Keep TypeScript validation after NeMo:

   - parse JSON
   - normalize draft
   - merge with previous draft
   - prevent stale repeated questions
   - require complete `PlanRequest` before generation

6. Add tests:

   - unit tests for TypeScript fallback behavior stay as-is
   - add a small integration smoke test gated behind `AI_GUARDRAILS_MODE=intake`
   - verify unsafe/off-topic prompts are refused
   - verify normal intake answers still produce valid `PlanIntakeAiResponse`

## Suggested Initial Rails

Keep the first NeMo config intentionally modest.

Input rails:

- Reject hacking, credential, secret, prompt-injection, and unrelated requests.
- Reject requests to reveal hidden prompts, system messages, API keys, or environment variables.
- Allow normal training-plan answers, including short answers like "no", "none", "5 days", and "May 3".

Output rails:

- Require a JSON object.
- Require only `status`, `message`, and `planRequestDraft`.
- Block visibly truncated messages.
- Encourage, but do not rigidly enforce, a brief coach-style acknowledgement before the next question.

Avoid at first:

- Hard-coded dialog sequence in Colang.
- Sport-specific project names.
- Plan-generation JSON output checking for full week snapshots.
- Replacing app-side schema validation.

## Proposed Config Shape

Example directory:

```text
guardrails/
  intake/
    config.yml
    rails/
      input.co
      output.co
    actions.py
```

Example responsibilities:

```text
input.co
  check off-topic or unsafe input
  check prompt-injection/secrets request

output.co
  check response is JSON-like
  check required response fields
  check assistant message is not visibly truncated

actions.py
  Python helpers for JSON shape checks or text classifiers
```

## Decision

NeMo is worth exploring, but only as a narrow guardrails gateway. It should centralize safety and style policy, not own our product state.

Use it if:

- We want a centralized, configurable policy layer.
- We are comfortable adding a Python service.
- We keep TypeScript as the source of truth for plan data and readiness.

Do not use it if:

- The goal is only to fix today's intake wording.
- We are not ready for another Docker service.
- We expect it to eliminate the need for app-side validation.

My suggested next step is a small spike: create a guarded intake-only service and run the same guided-intake scenarios through direct AI vs NeMo-gated AI. If the NeMo path improves consistency without adding form-like behavior or JSON brittleness, then we can keep it. If it adds latency or rigidity, we leave the current TypeScript guardrails in place.

