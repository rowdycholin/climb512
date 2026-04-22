# Climb512 — AI Climbing Training App

A gym-focused climbing training web app that uses Claude AI to generate personalised day-by-day training plans based on user goals, grade, age, discipline, equipment, and schedule.

See `docs/` for full documentation.

## Project structure

```
climb512/
  app/                        # Next.js 14 (App Router) — the entire app
    src/
      app/                    # Pages and server actions (App Router)
        actions.ts            # All server actions: login, logout, createPlan, logExercise
        page.tsx              # Root redirect (→ /dashboard or /login)
        login/page.tsx        # Login page (uses LoginForm client component)
        dashboard/page.tsx    # Lists user's plans
        onboarding/page.tsx   # Plan creation form
        plan/[id]/page.tsx    # Plan viewer — fetches plan + exercise logs
      components/
        LoginForm.tsx         # Client component — useFormState login
        EquipmentPicker.tsx   # Client component — preset + custom equipment
        PlanViewer.tsx        # Client component — week selector, day accordion, exercise logging
      lib/
        session.ts            # iron-session cookie auth
        prisma.ts             # PrismaClient singleton (uses @prisma/adapter-pg)
        plan-generator.ts     # Legacy mock generator — unused, kept for reference; exports PlanInput/WeekData types
        ai-plan-generator.ts  # Live AI plan generation via Anthropic SDK (OpenRouter or direct)
    prisma/
      schema.prisma           # Data model (Prisma 7 — no url in datasource block)
      prisma.config.ts        # Prisma 7 config (provides DATABASE_URL for migrations)
      migrations/
        20240101000000_init/  # Single SQL migration (applied via psql in Docker)
    Dockerfile                # Multi-stage: deps → builder → runner (standalone output)
    .env                      # Local dev env vars (DATABASE_URL, SESSION_SECRET, ANTHROPIC_API_KEY)
    .env.docker               # Docker env vars (postgres host = "postgres" not "localhost")
  docker-compose.yml          # postgres + migrate (psql) + web services
  docs/                       # Application documentation
    overview.md               # What the app does, user flow, tech stack
    architecture.md           # System diagram, request lifecycle, component boundaries
    data-model.md             # All tables, columns, relationships
    development.md            # Local dev setup, common issues, schema change workflow
    deployment.md             # Docker Compose, env vars, scaling guide
    ai-integration.md         # Claude API usage, prompt structure, cost estimates
  scripts/                    # Start/stop helper scripts
    start.sh                  # Linux/macOS start (flags: --build, --fresh, --logs)
    stop.sh                   # Linux/macOS stop (flag: --clean to wipe data)
    start.bat                 # Windows start
    stop.bat                  # Windows stop
  README.md
  CLAUDE.md                   # This file
```

## Quick start

**Windows:**
```bat
scripts\start.bat --build
```

**Linux / macOS:**
```bash
./scripts/start.sh --build
```

Then open http://localhost:3000 — login: `climber1` / `climbin512!`

## Key commands

```bash
cd app

# Dev server (requires local PostgreSQL)
npm run dev

# Type check — run after every set of changes
npx tsc --noEmit

# Lint
npm run lint

# Build
npm run build

# Regenerate Prisma client (after schema.prisma changes)
npx prisma generate

# Docker — manual
cd ..
docker compose up --build -d   # build and start in background
docker compose down            # stop (preserves data)
docker compose down -v         # stop and delete data volume
docker compose logs web -f     # follow app logs
```

## Architecture decisions

**Next.js 14 App Router only** — no Pages Router, no tRPC. All data fetching in Server Components. All mutations via Server Actions (`src/app/actions.ts`).

**Server Actions for everything** — no `/api/` route handlers. Forms post to server actions directly. Client components import and call server actions.

**Prisma 7 + pg adapter** — Prisma 7 removed `url = env("DATABASE_URL")` from `schema.prisma`. The URL now lives in `prisma.config.ts` (migrations) and `PrismaPg` adapter constructor (runtime). Never add `url` back to the datasource block.

**iron-session for auth** — stateless JWT cookie. Demo credentials hardcoded in `actions.ts`. Session holds `{ userId, username, isLoggedIn }`. Demo userId is always `"demo-user-001"`.

**Claude AI for plan generation** — `createPlan` server action calls `generatePlanWithAI` in `ai-plan-generator.ts`, which builds a strongly-constrained prompt (discipline, equipment rules, grade, goals) and calls the Anthropic SDK. The response is parsed as JSON and persisted into the DB hierarchy. Model, base URL, and max tokens are all env-configurable. See `docs/ai-integration.md` for prompt shape and cost info.

**OpenRouter support** — set `ANTHROPIC_BASE_URL=https://openrouter.ai/api` (note: no `/v1` suffix — the SDK appends `/v1/messages` itself; adding `/v1` doubles it and causes 404s). Model string format for OpenRouter: `anthropic/claude-haiku-4-5`. For direct Anthropic: `claude-haiku-4-5`.

**`PlanInput` shape** — `{ goals, currentGrade, targetGrade, age, weeksDuration, daysPerWeek, equipment[], discipline }`. The `discipline` field is required: `bouldering | sport | trad | ice | alpine`.

**Standalone Next.js Docker output** — `next.config.mjs` sets `output: "standalone"`. Runner stage runs `node server.js`. Prisma engine binaries are copied manually into the runner stage.

## Data model (summary)

```
TrainingProfile   — userId, goals[], currentGrade, targetGrade, age, weeksDuration, daysPerWeek, equipment[]
  └── TrainingPlan
        └── Week  — weekNum, theme
              └── Day  — dayNum, dayName, focus, isRest
                    └── DaySession  — name, description, duration (minutes)
                          └── Exercise  — name, sets?, reps?, duration?, rest?, notes?, order
                                └── ExerciseLog  — userId, setsCompleted?, repsCompleted?,
                                                   weightUsed?, durationActual?, notes?, completed
                                    UNIQUE(exerciseId, userId)
```

Full schema: `docs/data-model.md`

## Environment variables

| Variable | Dev (.env) | Docker (docker-compose.yml) |
|---|---|---|
| `DATABASE_URL` | `postgresql://climber:climber512@localhost:5432/climbapp` | `postgresql://climber:climber512@postgres:5432/climbapp` |
| `SESSION_SECRET` | `super-secret-session-key-change-in-production-32chars!!` | same |
| `ANTHROPIC_API_KEY` | set in `app/.env` | passed via `${ANTHROPIC_API_KEY}` in docker-compose.yml |
| `ANTHROPIC_BASE_URL` | `https://openrouter.ai/api` (for OpenRouter) | `${ANTHROPIC_BASE_URL:-}` |
| `ANTHROPIC_MODEL` | `anthropic/claude-haiku-4-5` (OpenRouter format) | `${ANTHROPIC_MODEL:-anthropic/claude-haiku-4-5}` |
| `ANTHROPIC_MAX_TOKENS` | optional, defaults to `3000` | optional, defaults to `3000` |

Note: OpenRouter keys start with `sk-or-v1-`. Direct Anthropic keys start with `sk-ant-`. OpenRouter `ANTHROPIC_BASE_URL` must be `https://openrouter.ai/api` — NOT `https://openrouter.ai/api/v1` (the SDK appends `/v1` itself).

## Docker notes

- **migrate service** — uses `postgres:16-alpine` + `psql` directly on the SQL file. Avoids Prisma CLI Alpine binary issues. `|| true` makes it idempotent (safe to re-run).
- **web service** — `runner` target, `node server.js`, non-root user `nextjs`.
- **postgres data** — persisted in `postgres_data` named volume. Use `docker compose down -v` to wipe.

## UI notes

- **shadcn/ui** uses `@base-ui/react` (not Radix UI) — Accordion API: use `multiple` prop, not `type="multiple"`. No `defaultValue` on AccordionItem.
- **Tailwind v3** — CSS custom properties registered as color tokens in `tailwind.config.ts`. The `@import "shadcn/tailwind.css"` line was removed from `globals.css` — it caused build failures.
- **React 18** — use `useFormState` from `react-dom`, NOT `useActionState` (React 19 only).
- All pages except login have a sticky header with logout button.

## Current state (as of 2026-04-22)

- AI plan generation is live via `ai-plan-generator.ts` using OpenRouter + `anthropic/claude-haiku-4-5`
- Discipline selector (bouldering, sport, trad, ice, alpine) added to onboarding form
- Assistant prefill fix applied: messages array ends with `{ role: "assistant", content: "[" }` to force JSON output; response is reconstructed as `"[" + textBlock.text`
- Docker was rebuilt with `--no-cache` to ensure code changes were picked up (cached builds were serving stale code)
- Playwright MCP installed (`claude mcp add playwright npx @playwright/mcp@latest`) for browser testing — requires Claude Code restart to activate
- **Pending**: browser regression test of the full onboarding → plan generation flow using Playwright MCP

## What to avoid

- Do NOT add tRPC, NextAuth, or Zustand — not in this project
- Do NOT use `any` type — ESLint enforces this; use `unknown` and narrow
- Do NOT add `url = env(...)` back to the Prisma `datasource` block — Prisma 7 forbids it
- Do NOT use `useActionState` — React 18 project, use `useFormState` from `react-dom`
- Do NOT use `type="multiple"` on `<Accordion>` — use `multiple` boolean prop
- Do NOT run `docker compose up` without `--build` after code changes
- Do NOT add outdoor/geolocation features — gym-only for v1
- Do NOT write raw SQL in application code — use Prisma queries only
