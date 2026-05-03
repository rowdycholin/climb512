# Backend Timings

Date sampled: 2026-05-03

## NeMo Timings

These timings come from recent Docker logs while guided intake was routed through NeMo:

- Web/app source marker: `source=nemo-guardrails`
- Guardrails route: `web -> guardrails -> AI backend`
- Guardrails checks enabled: input self-check, main intake generation, output self-check

The web log measures total app-observed wait time for the intake backend call. The guardrails log measures NeMo's internal processing time and splits it into the three upstream LLM calls.

### Web Perspective

Recent `[ai-intake]` timings from the `web` container:

| Turn | Status | Duration |
|---:|---|---:|
| 1 | needs_more_info | 6.857s |
| 2 | needs_more_info | 5.137s |
| 3 | needs_more_info | 4.696s |
| 4 | needs_more_info | 5.258s |
| 5 | needs_more_info | 4.695s |
| 6 | needs_more_info | 5.457s |
| 7 | needs_more_info | 4.955s |
| 8 | needs_more_info | 24.112s |
| 9 | ready | 26.993s |
| 10 | needs_more_info | 6.542s |
| 11 | needs_more_info | 56.184s |
| 12 | needs_more_info | 22.838s |
| 13 | needs_more_info | 10.608s |
| 14 | ready | 12.062s |

Summary:

- Count: 14 guided-intake calls
- Minimum: 4.695s
- Median: 6.700s
- Average: 14.028s
- Maximum: 56.184s
- Calls at or above 10s: 6 of 14
- Calls at or above 20s: 4 of 14

### Guardrails Perspective

Recent NeMo `Total processing took` summaries captured from the `guardrails` container:

| Turn | Total NeMo Time | Input Self-Check | Main Intake Generation | Output Self-Check |
|---:|---:|---:|---:|---:|
| 1 | 6.53s | 1.28s | 3.43s | 1.34s |
| 2 | 56.17s | 2.68s | 22.79s | 30.20s |
| 3 | 22.83s | 15.04s | 6.56s | 0.69s |
| 4 | 10.59s | 1.75s | 6.47s | 1.81s |
| 5 | 12.05s | 1.20s | 8.40s | 1.94s |

Summary:

- Count: 5 complete NeMo timing summaries captured in the sampled guardrails log tail
- Minimum total NeMo time: 6.53s
- Median total NeMo time: 12.05s
- Average total NeMo time: 21.63s
- Maximum total NeMo time: 56.17s
- Average input self-check: 4.39s
- Average main intake generation: 9.53s
- Average output self-check: 7.20s

### Notes

- The web and guardrails timings align closely where both perspectives were captured. For example, the web saw `56.184s` while NeMo reported `56.17s`, and the web saw `22.838s` while NeMo reported `22.83s`.
- The long delays appear to be inside the guarded route, not in React/UI rendering or app post-processing.
- The log messages that say `Should this response be blocked? Answer only "yes" or "no".` are NeMo output self-check prompts. They are not shown to the user.
- One slow sample spent `30.20s` on the output self-check alone. Another spent `15.04s` on the input self-check.
- Because NeMo currently performs three upstream LLM calls per guided-intake turn, latency can vary significantly even when the main intake generation itself is reasonable.

## Direct AI Timings

These timings come from recent Docker logs after guided intake was switched away from NeMo:

- Web/app source marker: `source=direct-ai`
- Route: `web -> AI backend`
- Guardrails mode: `AI_GUARDRAILS_MODE=off`
- Intake mode: `AI_INTAKE_MODE=live`

The web log measures total app-observed wait time for the direct intake backend call.

### Web Perspective

Recent `[ai-intake]` timings from the `web` container:

| Turn | Status | Duration |
|---:|---|---:|
| 1 | needs_more_info | 2.046s |
| 2 | needs_more_info | 2.333s |
| 3 | needs_more_info | 2.125s |
| 4 | needs_more_info | 2.003s |
| 5 | needs_more_info | 2.712s |
| 6 | needs_more_info | 2.764s |
| 7 | needs_more_info | 3.183s |
| 8 | needs_more_info | 3.746s |
| 9 | needs_more_info | 3.400s |
| 10 | needs_more_info | 3.546s |
| 11 | needs_more_info | 3.923s |
| 12 | ready | 3.777s |

Summary:

- Count: 12 guided-intake calls
- Minimum: 2.003s
- Median: 2.974s
- Average: 2.963s
- Maximum: 3.923s
- Calls at or above 10s: 0 of 12
- Calls at or above 20s: 0 of 12

## NeMo Vs Direct AI Comparison

| Metric | NeMo-Gated Intake | Direct AI Intake |
|---|---:|---:|
| Sample size | 14 web calls | 12 web calls |
| Minimum | 4.695s | 2.003s |
| Median | 6.700s | 2.974s |
| Average | 14.028s | 2.963s |
| Maximum | 56.184s | 3.923s |
| Calls at or above 10s | 6 of 14 | 0 of 12 |
| Calls at or above 20s | 4 of 14 | 0 of 12 |

### Comparison Notes

- Direct AI was consistently faster in this sample, with all guided-intake calls under 4 seconds.
- NeMo-gated intake had several normal-feeling calls around 5-7 seconds, but also had large outliers above 20 seconds and one above 56 seconds.
- The guardrails-side split shows the outliers were caused by NeMo's upstream LLM calls, especially self-checks, not by app-side processing.
- The largest observed NeMo output self-check took 30.20 seconds by itself, which explains why logs showing `Should this response be blocked? Answer only "yes" or "no".` can coincide with long waits.

## Future Runs

Collect future timing samples from the web logs with:

```powershell
docker compose logs -f web
```

Direct mode should show:

```text
[ai-intake] source=direct-ai status=... durationMs=...
```

NeMo mode should show:

```text
[ai-intake] source=nemo-guardrails status=... durationMs=...
```

For NeMo-specific breakdowns, also inspect:

```powershell
docker compose --profile guardrails logs -f guardrails
```
