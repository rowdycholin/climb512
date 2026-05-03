# Guardrails

This directory contains the opt-in NeMo Guardrails proof-of-concept scaffold for Phase 10.

The initial target is intake only. NeMo should act as a safety/style gateway around live AI intake calls, while the TypeScript app remains responsible for structured state, JSON parsing, schema validation, readiness checks, plan validation, workout-log protection, and versioning.

## Modes

Default application behavior does not use this service:

```text
AI_GUARDRAILS_MODE=off
```

Future intake-gated behavior will use:

```text
AI_GUARDRAILS_MODE=intake
AI_GUARDRAILS_BASE_URL=http://guardrails:8000
```

Batch 1 only adds the service and configuration skeleton. App routing to this service is intentionally deferred to the integration batch.

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

The rails are intentionally light placeholders in Batch 1. Security rails, output-shape checks, and conversational style rails should be added in later batches.
