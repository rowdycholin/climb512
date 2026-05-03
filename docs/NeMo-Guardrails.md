# NeMo Guardrails Evaluation

Date reviewed: 2026-05-02

## Summary

NVIDIA NeMo Guardrails can help centralize some of our AI boundary logic, especially topic safety, prompt-injection checks, output checks, and reusable conversation policies. It is not a replacement for our core typed intake state machine or plan-generation validators. The selected path is to keep NeMo as an optional guardrails gateway around live guided-intake calls, while leaving `PlanIntakeAiResponse`, `PlanRequest`, generated week validation, and database/versioning rules in the TypeScript app.

Recommendation: keep NeMo for initial guided intake only. Do not move the whole intake flow into NeMo, and do not expand NeMo to AI Adjust or plan generation until the intake route has more red-team coverage.

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

Continue with Option 2 as the selected contained direction.

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

NeMo is worth keeping for initial guided intake, but only as a narrow guardrails gateway. It should centralize safety and style policy, not own our product state.

Use it if:

- We want a centralized, configurable policy layer.
- We are comfortable adding a Python service.
- We keep TypeScript as the source of truth for plan data and readiness.

Do not use it if:

- The goal is only to fix today's intake wording.
- We are not ready for another Docker service.
- We expect it to eliminate the need for app-side validation.

The current decision is to keep the guarded intake-only service because the live NeMo-gated route is behaving much better than the earlier direct/simulator-only path. The next step is continued validation and red-team coverage, not immediate expansion to every AI surface.

## Implementation Status

### Phase 10 Batch 1

The repository now includes an opt-in guardrails service skeleton:

- `guardrails/Dockerfile`
- `guardrails/entrypoint.sh`
- `guardrails/requirements.txt`
- `guardrails/intake/config.template.yml`
- `guardrails/intake/rails/input.co`
- `guardrails/intake/rails/output.co`
- `guardrails/intake/actions.py`

Docker Compose includes a `guardrails` service behind the explicit `guardrails` profile. It is not started by default.

Environment defaults:

- `AI_GUARDRAILS_MODE=off`
- `AI_GUARDRAILS_BASE_URL=http://guardrails:8000`

Batch 1 does not route application traffic through NeMo yet. That is intentionally deferred until the app integration batch so the current simulator/direct-AI paths keep working unchanged.

### Phase 10 Batch 2

The intake config now enables NeMo's built-in `self check input` flow with a custom prompt in `guardrails/intake/prompts.yml`.

The first-pass input rail is designed to block:

- prompt injection and jailbreak attempts
- requests to reveal hidden prompts, system/developer messages, internal instructions, or guardrail policy
- requests for API keys, credentials, environment variables, database URLs, private files, or internal configuration
- clearly malicious cyber requests such as credential theft, malware, or data exfiltration
- unrelated unsafe requests that would pull intake away from training-plan creation

The prompt explicitly allows concise normal intake answers, including `no`, `none`, `no constraints`, `no injuries`, dates, numbers, days of week, sport names, equipment lists, injury/limitation details, and avoided-exercise preferences.

The refusal style is defined in `guardrails/intake/rails/input.co` and redirects the user back to the current training-plan question.

Manual smoke-test prompts live in `docs/nemo-guardrails-test-prompts.md`.

This is still a gateway-only experiment. The app is not yet routing intake calls through NeMo, and TypeScript validation remains authoritative.

### Phase 10 Batch 3

The intake config now also enables NeMo's built-in `self check output` flow with a custom prompt in `guardrails/intake/prompts.yml`.

The first-pass output rail is designed to block:

- responses that are not JSON-like
- responses that include markdown fences or prose outside the JSON object
- visibly truncated responses
- responses that reveal hidden prompts, system/developer messages, guardrail policy, secrets, environment variables, API keys, database URLs, private files, or internal configuration
- unsafe cyber instructions or credential/data-exfiltration guidance
- hostile, shaming, or unrelated intake messages

The output rail intentionally does not replace TypeScript parsing and schema validation. It only checks whether the response appears suitable to hand back to the app. The app remains responsible for authoritative validation of `PlanIntakeAiResponse`, draft merging, duplicate-question prevention, and readiness.

The prompt encourages a brief coach-like acknowledgement plus the next useful question, but it should not block safe JSON only because the tone is plain.

## Batch 4 Implementation Result

The web app now routes only model-backed guided-intake calls through NeMo when `AI_GUARDRAILS_MODE=intake`.

- Guarded intake calls use `AI_GUARDRAILS_BASE_URL/v1/chat/completions`.
- Direct live intake calls keep using `ANTHROPIC_BASE_URL/v1/chat/completions` when guardrails mode is off.
- Guarded mode takes precedence over simulator/local intake so NeMo is not silently bypassed during testing.
- Plan generation, the plan worker, and adjustment generation still use the direct AI backend.
- The response still passes through the TypeScript `PlanIntakeAiResponse` parser, draft merge, no-duplicate-question guard, and readiness checks after NeMo returns.
- Intake logs include a sanitized source marker such as `source=direct-ai` or `source=nemo-guardrails`, response status, and draft key count. They do not log API keys, prompts, full payloads, or user answers.
- If the guardrails service is unavailable or returns a non-OK response, the user sees the existing intake retry flow and the server logs a concise fallback reason.

Only the services required for the selected mode need to be recreated. For guarded intake in Docker, start or rebuild the `guardrails` service and recreate `web`; `plan-worker` does not need to be recreated unless the direct generation backend settings changed.

Important limitation: the current local simulator primarily supports plan-generation prompts. If NeMo is configured to call the simulator as its backing model, guarded intake may fail visibly until the simulator grows an intake-compatible chat-completions response. That failure is preferable to silently bypassing NeMo and producing misleading green tests.

## Batch 5 Validation Result

The validation runbook lives in `docs/nemo-intake-validation.md`.

The app includes a synthetic validation harness:

```bash
cd app
npm run validate:nemo-intake
npm run validate:nemo-intake -- --rails-smoke
```

The harness compares normal intake scenarios, terse answers, and app-level red-team refusals through the currently configured intake route. The optional `--rails-smoke` mode sends a small direct smoke set to the NeMo OpenAI-compatible endpoint, which helps distinguish app-side refusals from NeMo-side refusals.

Decision status: keep NeMo for initial guided intake.

The live NeMo-gated intake route has been exercised and is now the preferred direction for intake validation. The app remains the final authority after NeMo returns:

- It parses and normalizes the `PlanIntakeAiResponse`.
- It merges the response with locally recovered draft state.
- It preserves combined answers such as `energy systems training for climbing` as both sport context and goal/focus context.
- It prevents completed-field repeated questions.
- It trims model responses to one user-facing question while preserving a friendly acknowledgement.
- It enforces final `PlanRequest` validation before generation.

Known follow-ups:

- Continue red-team testing for prompt injection, hidden-prompt extraction, secrets, unrelated malicious requests, terse valid answers, and unusual but valid training preferences.
- Capture real transcript regressions as unit tests.
- Keep Batch 5A as the path to a fully local `web -> guardrails -> simulator` baseline.
- Defer NeMo for AI Adjust and plan generation until guided intake remains stable under additional testing.

