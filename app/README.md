# Climb512 App

This directory contains the Next.js 14 App Router application and Prisma schema for Climb512.

## Common Commands

```bash
npm install
npx prisma generate
npm run dev -- --hostname 0.0.0.0 --port 8080
npm run test:unit
npx tsc --noEmit
npm run build
```

The main project README and docs live one directory up:

- `../README.md`
- `../docs/development.md`
- `../docs/architecture.md`
- `../docs/ai-integration.md`

## Environment

`app/.env` is the active env file for Docker `web`, `plan-worker`, and optional `guardrails` services. Recreate containers after changing it.

Local profile files:

- `.env-simulator`: local simulator backend
- `.env-aibackend`: live OpenRouter-compatible backend
- `.env-aibackend-nemo`: live backend with NeMo intake guardrails
- `.env-ollama`: local Ollama-style profile

Do not commit real API keys.
