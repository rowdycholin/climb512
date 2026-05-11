# Timings

Date sampled: 2026-05-09

This document compares the current simulator-backed guided-intake route with the NeMo-gated simulator route.

## Timing Collection Note

For NeMo timing runs, send one normal intake transaction through `web -> guardrails -> backend` before starting the measured log window. This primes the NeMo server, LangChain/OpenAI client path, and backend model route. Do not include that first transaction in extracted timing stats; otherwise the cold-start setup cost can skew the NeMo median, average, and max.

Use `testing/tests/intake-route-timing.spec.ts` as the primary guided-intake timing benchmark. Unlike `intake-route-parity.spec.ts`, it uses fixed expected turn counts and fails if a route reaches ready early or late. This keeps NeMo and non-NeMo timing samples apples-to-apples.

For simulator-backed routes, the first sport-selection message in each scenario is handled before the model-backed intake call, so the browser sends 33 scripted turns while the `web` timing logs contain 29 `ai-intake` response samples:

| Scenario | Scripted browser turns | Timed AI responses |
|---|---:|---:|
| climbing | 8 | 7 |
| cycling | 9 | 8 |
| running | 8 | 7 |
| strength and conditioning | 8 | 7 |
| total | 33 | 29 |

For live AI backend routes, the timing spec uses a slightly longer scripted profile because the live model asks more schedule/current-level/safety checkpoints than the deterministic simulator. Live routes stop once the Generate button unlocks, so the measured response count can differ between direct AI and NeMo even when both use the same max script.

## Non-NeMo Simulator Run

Configuration:

```text
ANTHROPIC_BASE_URL=http://simulator:8787
AI_INTAKE_MODE=simulator
AI_GUARDRAILS_MODE=off
ANTHROPIC_MODEL=simulator
```

Route:

```text
browser -> web -> simulator
```

Original full-suite test window started at `2026-05-09T00:28:09Z`.

Full-suite result:

| Check | Result |
|---|---|
| `simulator/npm test` | passed, 19 tests |
| `app/npm run test:unit` | failed, 110 passed / 1 failed before stale adjustment-contract assertion was updated |
| `app/npx tsc --noEmit` | passed |
| `testing/npm test` | failed, 26 passed / 22 failed |

Important Playwright note: `testing/tests/intake-route-parity.spec.ts` passed all four non-NeMo parity scenarios: climbing, cycling, running, and strength and conditioning. The broader Playwright failures are stale/brittle expectations in older intake, adjustment, dashboard, editor, and completion tests.

Original guided-intake timing from `web` logs:

| Source | OK | Count | Min | Median | Average | Max |
|---|---:|---:|---:|---:|---:|---:|
| simulator | true | 35 | 4ms | 8ms | 12.8ms | 77ms |

Original simulator-side intake generation timing:

| Count | Min | Median | Average | Max |
|---:|---:|---:|---:|---:|
| 35 | 0ms | 0ms | 2.1ms | 61ms |

Fixed timing-spec result:

| Check | Result |
|---|---|
| `testing/npm run test:intake-timing` | passed 4 / 4 |

Post timing-spec guided-intake timing from `web` logs, sampled since `2026-05-09T03:20:59Z`:

| Source | OK | Count | Min | Median | Average | Max |
|---|---:|---:|---:|---:|---:|---:|
| simulator | true | 29 | 4ms | 5ms | 7.1ms | 38ms |

Post timing-spec simulator-side intake generation timing:

| Count | Min | Median | Average | Max |
|---:|---:|---:|---:|---:|
| 29 | 0ms | 0ms | 0.7ms | 8ms |

Representative `web` log shape:

```text
[ai-intake] response id=... source=simulator surface=intake model=simulator ok=true status=needs_more_info durationMs=...
```

Representative `simulator` log shape:

```text
[simulator] generated intake status=needs_more_info scenario=baseline seed=demo-seed mode=none durationMs=...
```

## NeMo-Gated Simulator Run

Configuration:

```text
ANTHROPIC_BASE_URL=http://simulator:8787
AI_INTAKE_MODE=simulator
AI_GUARDRAILS_MODE=intake
AI_GUARDRAILS_BASE_URL=http://guardrails:8000
ANTHROPIC_MODEL=simulator
```

Route:

```text
browser -> web -> guardrails -> simulator
```

Initial full-suite test window started at `2026-05-09T00:37:35Z`.

Full-suite result:

| Check | Result |
|---|---|
| `simulator/npm test` | passed, 19 tests |
| `app/npm run test:unit` | passed, 111 tests |
| `app/npx tsc --noEmit` | passed |
| `testing/npm test` | failed, 22 passed / 26 failed |

Important initial NeMo note: the four route-parity Playwright scenarios did not reach ready state through NeMo. All logged NeMo-gated intake responses from this run failed app-side parse/validation.

Guided-intake timing from `web` logs:

| Source | OK | Count | Min | Median | Average | Max |
|---|---:|---:|---:|---:|---:|---:|
| nemo-guardrails | false | 51 | 123ms | 201ms | 347.7ms | 2924ms |

Simulator-side intake generation timing behind NeMo:

| Count | Min | Median | Average | Max |
|---:|---:|---:|---:|---:|
| 51 | 0ms | 1ms | 1.0ms | 18ms |

Representative `web` log shape:

```text
[ai-intake] response id=... source=nemo-guardrails surface=intake model=simulator ok=false durationMs=... errorType=parse-or-validation
```

The simulator remained fast behind NeMo, so the observed NeMo timing was mostly guardrails overhead plus response-shape handling. The blocker was correctness, not raw simulator latency.

Root cause found afterward: NeMo's input self-check prompt included the original guided-intake instruction marker, `Return a PlanIntakeAiResponse JSON object`. The simulator matched that marker first and answered the self-check with intake JSON instead of the required `yes` or `no`. NeMo interpreted that as a blocked input and returned a refusal, which the app correctly failed to parse as `PlanIntakeAiResponse`.

## NeMo-Gated Simulator Run After Self-Check Fix

Change tested:

- `simulator/src/server.js` now detects NeMo guardrail input/output self-check prompts before guided-intake prompts.
- The simulator returns strict `yes` / `no` self-check responses.
- The decision logic inspects only the checked user message or model response, not NeMo's surrounding policy instructions.

Focused validation result:

| Check | Result |
|---|---|
| `simulator/npm test` | passed, 22 tests |
| `app/npm run validate:nemo-intake -- --normal-only` | passed all normal scenarios |
| `testing/npx playwright test tests/intake-route-parity.spec.ts` | passed 4 / 4 |

The Playwright route-parity scenarios passed for climbing, cycling, running, and strength and conditioning through:

```text
browser -> web -> guardrails -> simulator
```

Post-fix guided-intake timing from `web` logs, sampled since `2026-05-09T02:34:00Z`:

| Source | OK | Count | Min | Median | Average | Max |
|---|---:|---:|---:|---:|---:|---:|
| nemo-guardrails | true | 29 | 257ms | 313ms | 360.5ms | 733ms |

Post-fix simulator-side logs for the same window:

| Measurement | Count | Min | Median | Average | Max |
|---|---:|---:|---:|---:|---:|
| intake generation | 66 | 0ms | 0ms | 0.5ms | 4ms |
| guardrail self-check responses | 132 | n/a | n/a | n/a | n/a |

Representative post-fix `web` log shape:

```text
[ai-intake] response id=... source=nemo-guardrails surface=intake model=simulator ok=true status=needs_more_info durationMs=...
```

## NeMo-Gated Simulator Run After Quiet/Usage Fix

Change tested:

- `guardrails/entrypoint.sh` starts NeMo with `--no-verbose`.
- `guardrails/Dockerfile` patches the NeMo server package so `LLMRails` is created with `verbose=False`; in NeMo Guardrails `0.21.0`, the server path otherwise hardcodes verbose logging.
- `guardrails/entrypoint.sh` sets `MAIN_MODEL_ENGINE=openai` explicitly.
- `simulator/src/server.js` now includes an OpenAI-style `usage` object in chat-completions responses.

Focused validation result:

| Check | Result |
|---|---|
| `simulator/npm test` | passed, 22 tests |
| `app/npm run validate:nemo-intake -- --normal-only` | passed all normal scenarios |
| `testing/npx playwright test tests/intake-route-parity.spec.ts` | passed 4 / 4 |

Post-change guided-intake timing from `web` logs, sampled since `2026-05-09T02:51:20Z` after an initial priming transaction. This run used `intake-route-parity.spec.ts`; future timing runs should use `intake-route-timing.spec.ts` for a fixed 33-scripted-turn / 29-timed-response sample.

| Source | OK | Count | Min | Median | Average | Max |
|---|---:|---:|---:|---:|---:|---:|
| nemo-guardrails | true | 29 | 66ms | 79ms | 83.5ms | 130ms |

Post-change simulator-side logs for the same window:

| Measurement | Count | Min | Median | Average | Max |
|---|---:|---:|---:|---:|---:|
| intake generation | 65 | 0ms | 0ms | 0.3ms | 1ms |
| guardrail self-check responses | 130 | n/a | n/a | n/a | n/a |

Guardrails log observations for the same window:

| Observation | Count |
|---|---:|
| `AttributeError` callback warnings | 0 |
| `LLM Prompt` dumps | 0 |
| `LLM Completion` dumps | 0 |
| total processing lines | 65 |

The guardrails logs still show three startup/deprecation warnings, but the repeated callback warning and full prompt/completion dumps are gone.

## Fixed Timing Spec Check

The fixed timing spec was added after the quiet/usage run to make future timing windows more consistent:

```powershell
npm --prefix testing run test:intake-timing
```

Validation on the current NeMo-gated simulator stack:

| Check | Result |
|---|---|
| `testing/npm run test:intake-timing` | passed 4 / 4 |

Sampled since `2026-05-09T03:15:06Z`, the fixed timing spec produced:

| Source | OK | Count | Min | Median | Average | Max |
|---|---:|---:|---:|---:|---:|---:|
| nemo-guardrails | true | 29 | 65ms | 77ms | 82.1ms | 167ms |

## Real AI Backend Runs

These runs used the OpenRouter-backed Anthropic model configured in `app/.env-aibackend` and `app/.env-aibackend-nemo`.

### Direct Real AI Backend

Configuration:

```text
AI_INTAKE_MODE=live
AI_GUARDRAILS_MODE=off
ANTHROPIC_MODEL=anthropic/claude-haiku-4-5
```

Route:

```text
browser -> web -> OpenRouter/Anthropic
```

Focused validation result:

| Check | Result |
|---|---|
| `testing/npm run test:intake-timing` | passed 4 / 4 |

Sampled since `2026-05-09T12:21:30Z`, the live timing spec produced:

| Source | OK | Count | Min | Median | Average | Max |
|---|---:|---:|---:|---:|---:|---:|
| direct-ai | true | 40 | 1711ms | 2792ms | 2879.5ms | 5082ms |

### NeMo-Gated Real AI Backend

Configuration:

```text
AI_INTAKE_MODE=live
AI_GUARDRAILS_MODE=intake
AI_GUARDRAILS_BASE_URL=http://guardrails:8000
ANTHROPIC_BASE_URL=https://openrouter.ai/api
ANTHROPIC_MODEL=anthropic/claude-haiku-4-5
```

Route:

```text
browser -> web -> guardrails -> OpenRouter/Anthropic
```

Before the measured window, one climbing intake pass was run as a NeMo priming transaction and excluded from these stats.

Focused validation result:

| Check | Result |
|---|---|
| `npx playwright test tests/intake-route-timing.spec.ts --grep "climbing"` | passed 1 / 1 as priming transaction |
| `testing/npm run test:intake-timing` | passed 4 / 4 |

Sampled since `2026-05-09T12:25:52Z`, the live NeMo timing spec produced:

| Source | OK | Count | Min | Median | Average | Max |
|---|---:|---:|---:|---:|---:|---:|
| nemo-guardrails | true | 37 | 3508ms | 4842ms | 4887.1ms | 6319ms |

Guardrails log observations for the same measured window:

| Observation | Count |
|---|---:|
| `AttributeError` callback warnings | 0 |
| `LLM Prompt` dumps | 0 |
| `LLM Completion` dumps | 0 |
| error/exception lines | 0 |

Real-backend interpretation:

- Both direct AI and NeMo-gated live routes successfully completed the four guided-intake scenarios.
- The NeMo-gated live route added roughly 2.0 seconds to the median guided-intake response in this sample: 4842ms vs. 2792ms.
- The NeMo-gated live route added roughly 2.0 seconds to the average guided-intake response in this sample: 4887.1ms vs. 2879.5ms.
- The live backend is less deterministic than the simulator, so direct AI produced 40 timed responses while NeMo produced 37 timed responses with the same max scripted profile.

## Comparison

| Route | Successful Intake Calls | Failed Intake Calls | Median Web Duration | Average Web Duration | Max Web Duration |
|---|---:|---:|---:|---:|---:|
| `web -> simulator`, original parity/full-suite window | 35 | 0 | 8ms | 12.8ms | 77ms |
| `web -> simulator`, fixed timing spec | 29 | 0 | 5ms | 7.1ms | 38ms |
| `web -> guardrails -> simulator`, before self-check fix | 0 | 51 | 201ms | 347.7ms | 2924ms |
| `web -> guardrails -> simulator`, after self-check fix | 29 | 0 | 313ms | 360.5ms | 733ms |
| `web -> guardrails -> simulator`, after quiet/usage fix | 29 | 0 | 79ms | 83.5ms | 130ms |
| `web -> OpenRouter/Anthropic`, direct live backend | 40 | 0 | 2792ms | 2879.5ms | 5082ms |
| `web -> guardrails -> OpenRouter/Anthropic`, primed NeMo live backend | 37 | 0 | 4842ms | 4887.1ms | 6319ms |

Interpretation:

- Non-NeMo simulator intake is healthy and very fast in the current setup.
- NeMo-gated simulator intake is now functionally healthy with the simulator self-check fix.
- The quiet/usage fix made the guarded simulator path much faster in this run by removing verbose prompt/completion logging and callback warning overhead.
- The guarded path is now roughly tens of milliseconds per intake turn in the simulator setup, while the direct simulator route is single-digit to low-double-digit milliseconds.
- The fixed timing Playwright test is the primary apples-to-apples timing check across both routes; the route-parity test remains useful as a broader regression check.

## Log Commands

```powershell
docker compose logs web --no-color --timestamps --since 2026-05-09T00:28:09Z
docker compose logs simulator --no-color --timestamps --since 2026-05-09T00:28:09Z
docker compose logs guardrails --no-color --timestamps --since 2026-05-09T00:37:35Z
docker compose logs web --no-color --timestamps --since 2026-05-09T02:34:00Z
docker compose logs simulator --no-color --timestamps --since 2026-05-09T02:34:00Z
docker compose logs web --no-color --timestamps --since 2026-05-09T02:51:20Z
docker compose logs simulator --no-color --timestamps --since 2026-05-09T02:51:20Z
docker compose logs guardrails --no-color --timestamps --since 2026-05-09T02:51:20Z
docker compose logs web --no-color --timestamps --since 2026-05-09T03:20:59Z
docker compose logs simulator --no-color --timestamps --since 2026-05-09T03:20:59Z
docker compose logs web --no-color --timestamps --since 2026-05-09T12:21:30Z
docker compose logs web --no-color --timestamps --since 2026-05-09T12:25:52Z
docker compose logs guardrails --no-color --timestamps --since 2026-05-09T12:25:52Z
npm --prefix testing run test:intake-timing
```
