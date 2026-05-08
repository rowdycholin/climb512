# Timings

Date sampled: 2026-05-08

## Configuration

These timings were captured from the local Docker stack while the app was configured for simulator mode.

This was not a NeMo Guardrails run.

Observed `web` container environment:

```text
ANTHROPIC_BASE_URL=http://simulator:8787
AI_INTAKE_MODE=local
AI_GUARDRAILS_MODE=off
ANTHROPIC_MODEL=simulator
```

Important route details:

- Guided intake used the app's local deterministic simulator path: `source=local-simulator`.
- NeMo Guardrails was off: `AI_GUARDRAILS_MODE=off`.
- No `source=nemo-guardrails` lines appeared in the sampled logs.
- Plan generation used the simulator service through `ANTHROPIC_BASE_URL=http://simulator:8787`.

## Guided Intake

Source logs:

```powershell
docker compose logs web --no-color --timestamps --since 24h
```

Recent `[ai-intake]` response timings:

| Turn | Source | Status | Duration |
|---:|---|---|---:|
| 1 | local-simulator | needs_more_info | 11ms |
| 2 | local-simulator | needs_more_info | 5ms |
| 3 | local-simulator | needs_more_info | 6ms |
| 4 | local-simulator | needs_more_info | 5ms |
| 5 | local-simulator | needs_more_info | 3ms |
| 6 | local-simulator | needs_more_info | 2ms |
| 7 | local-simulator | needs_more_info | 3ms |
| 8 | local-simulator | needs_more_info | 3ms |
| 9 | local-simulator | needs_more_info | 3ms |
| 10 | local-simulator | needs_more_info | 3ms |

Summary:

- Count: 10 guided-intake calls
- Minimum: 2ms
- Median: 3ms
- Average: 4.4ms
- Maximum: 11ms
- Calls at or above 1s: 0 of 10
- Calls at or above 10s: 0 of 10

Representative log shape:

```text
[ai-intake] response id=... source=local-simulator model=local ok=true status=needs_more_info durationMs=...
```

## Plan Generation

Source logs:

```powershell
docker compose logs plan-worker --no-color --timestamps --since 24h
docker compose logs simulator --no-color --timestamps --since 24h
```

The worker generated a 4-week running plan with `daysPerWeek=5`.

The plan worker currently does not emit explicit `durationMs` fields for week generation, so these are approximate durations from the worker container timestamps between `generating` and `saved week` lines.

| Week | Approx Worker Duration |
|---:|---:|
| 1 | 137ms |
| 2 | 54ms |
| 3 | 51ms |
| 4 | 69ms |

Worker summary:

- Weeks generated: 4
- Approx average worker generation span: 78ms per week
- Approx worker span from first claim to final ready save: 5.13s
- Configured inter-week delay: 1500ms

Simulator service logs confirmed four `/v1/chat/completions` requests for `type=next-week`, one for each generated week. Those simulator logs are useful for route confirmation, but the worker logs are the better source for this timing estimate because they contain the job lifecycle lines.

## Notes

- These numbers should be used as a simulator/local baseline only.
- They are not comparable to NeMo Guardrails latency except as a "guardrails off" baseline.
- For NeMo comparison runs, look for `source=nemo-guardrails` in `web` logs and inspect the `guardrails` container logs separately.
