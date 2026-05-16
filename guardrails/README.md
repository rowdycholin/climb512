# Guardrails

This directory contains the opt-in NeMo Guardrails intake gateway.

The target is intake only. NeMo acts as a safety/style gateway around guided-intake model calls, while the TypeScript app remains responsible for structured state, JSON parsing, schema validation, readiness checks, plan validation, workout-log protection, and versioning.

## Modes

Default application behavior does not use this service:

```text
AI_GUARDRAILS_MODE=off
```

Guarded intake uses:

```text
AI_GUARDRAILS_MODE=intake
AI_GUARDRAILS_BASE_URL=http://guardrails:8000
```

When this mode is enabled, guided-intake calls route through `web -> guardrails -> configured backend`. The configured backend can be the local simulator or a live OpenAI-compatible provider.

## Local Docker

Start the normal stack without NeMo:

```bash
docker compose up -d --build web plan-worker
```

Start the guardrails service explicitly:

```bash
docker compose --profile guardrails up -d --build guardrails
```

The guardrails container maps the existing `ANTHROPIC_*` environment variables to the OpenAI-compatible variables expected by NeMo's OpenAI engine.

For NeMo simulator mode, `app/.env` should include:

```text
ANTHROPIC_BASE_URL=http://simulator:8787
ANTHROPIC_MODEL=simulator
AI_INTAKE_MODE=simulator
AI_GUARDRAILS_MODE=intake
AI_GUARDRAILS_BASE_URL=http://guardrails:8000
```

## Files

```text
guardrails/
  Dockerfile
  entrypoint.sh
  requirements.txt
  intake/
    config.template.yml
    actions.py
    rails/
      input.co
      output.co
```

The current rails use deterministic Python actions for common input policy checks and output JSON-envelope checks. Ambiguous input can still fall back to NeMo's LLM `self_check_input`; TypeScript remains the final authority after NeMo returns.
