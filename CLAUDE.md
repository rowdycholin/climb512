# Climb512 — AI Climbing Training App

A gym-focused climbing training web app that uses Claude AI to generate personalised day-by-day training plans based on user goals, grade, age, discipline, equipment, and schedule.

See `docs/` for full documentation.

## Project structure

```
climb512/
  app/                        # Next.js 14 (App Router) — the entire app
    src/
      app/                    # Pages and server actions (App Router)
        actions.ts            # All server actions: login, register, logout, createPlan, deletePlan, deletePlans, logExercise
        page.tsx              # Root redirect (→ /dashboard or /login)
        login/page.tsx        # Login page (uses LoginForm client component)
        dashboard/page.tsx    # Lists user's plans
        onboarding/page.tsx   # Plan creation form
        plan/[id]/page.tsx    # Plan viewer — fetches plan + exercise logs
      components/
        LoginForm.tsx         # Client component — sign in / register toggle (useFormState)
        EquipmentPicker.tsx   # Client component — preset + custom equipment
        PlanViewer.tsx        # Client component — week selector, day accordion, exercise logging
        DashboardClient.tsx   # Client component — multi-select plan deletion with checkboxes
      lib/
        session.ts            # iron-session cookie auth
        prisma.ts             # PrismaClient singleton (uses @prisma/adapter-pg)
        plan-generator.ts     # Legacy mock generator — unused, kept for reference; exports PlanInput/WeekData types
        ai-plan-generator.ts  # Live AI plan generation via fetch → OpenRouter /v1/chat/completions
    prisma/
      schema.prisma           # Data model (Prisma 7 — no url in datasource block)
      prisma.config.ts        # Prisma 7 config (provides DATABASE_URL for migrations)
      migrations/
        20240101000000_init/  # Initial schema — all tables except User
        20240201000000_add_users/  # User table (username, passwordHash)
    Dockerfile                # Multi-stage: deps → builder → runner (standalone output)
    .env                      # Local dev env vars (DATABASE_URL, SESSION_SECRET, AI keys)
  docker-compose.yml          # postgres + migrate (runs all migrations in order) + web services
  docs/                       # Application documentation
    overview.md               # What the app does, user flow, tech stack
    architecture.md           # System diagram, request lifecycle, component boundaries
    data-model.md             # All tables, columns, relationships
    development.md            # Local dev setup, common issues, schema change workflow
    deployment.md             # Docker Compose, env vars, scaling guide
    ai-integration.md         # AI API usage, prompt structure, cost estimates
  testing/                    # Playwright end-to-end test suite
    tests/
      auth.spec.ts            # Login, bad credentials, logout; beforeAll registers test user
      onboarding.spec.ts      # Form rendering, validation, full plan generation
      dashboard.spec.ts       # Dashboard heading, create plan link, plan navigation
    playwright.config.ts      # Chromium, baseURL=localhost:8080, headless=false
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

Then open http://localhost:8080 — register a new account on the login page.

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
docker compose up -d           # restart only (env changes, no code changes)
docker compose down            # stop (preserves data)
docker compose down -v         # stop and delete data volume
docker compose logs web -f     # follow app logs
```

```bash
# Playwright tests (app must be running on localhost:8080)
cd testing
npx playwright test            # run all tests (opens Chromium)
npx playwright test --grep "generates"  # run one test by name
```

## Architecture decisions

**Next.js 14 App Router only** — no Pages Router, no tRPC. All data fetching in Server Components. All mutations via Server Actions (`src/app/actions.ts`).

**Server Actions for everything** — no `/api/` route handlers. Forms post to server actions directly. Client components import and call server actions.

**Prisma 7 + pg adapter** — Prisma 7 removed `url = env("DATABASE_URL")` from `schema.prisma`. The URL now lives in `prisma.config.ts` (migrations) and `PrismaPg` adapter constructor (runtime). Never add `url` back to the datasource block.

**iron-session for auth** — stateless JWT cookie. Users register via the login page; passwords hashed with `bcryptjs`. Session holds `{ userId, username, isLoggedIn }`. No hardcoded credentials.

**User registration** — `register` server action validates username (≥3 chars) and password (≥8 chars), rejects duplicate usernames, hashes with `bcrypt.hash(password, 10)`, creates a `User` row, and sets the session. `login` looks up the user by username and compares with `bcrypt.compare`.

**AI plan generation — no SDK** — `createPlan` server action calls `generatePlanWithAI` in `ai-plan-generator.ts`, which uses plain `fetch` against the OpenAI-compatible `/v1/chat/completions` endpoint (OpenRouter or any compatible provider). No Anthropic SDK dependency. The response JSON is stripped of markdown fences, parsed, and persisted into the DB hierarchy. Model, base URL, and max tokens are all env-configurable. See `docs/ai-integration.md` for details.

**Truncated JSON repair** — if the AI response is cut off mid-stream (token limit reached), `repairTruncatedJson` walks the response character-by-character tracking bracket depth and extracts all complete top-level week objects, then closes the array. This produces a shorter but valid plan instead of an error.

**OpenRouter** — set `ANTHROPIC_BASE_URL=https://openrouter.ai/api`. The code appends `/v1/chat/completions` itself, so do NOT include `/v1` in the base URL. Model string format: `anthropic/claude-haiku-4-5`. For direct Anthropic API: set `ANTHROPIC_BASE_URL=https://api.anthropic.com` and model `claude-haiku-4-5`.

**`PlanInput` shape** — `{ goals, currentGrade, targetGrade, age, weeksDuration, daysPerWeek, equipment[], discipline }`. The `discipline` field is required: `bouldering | sport | trad | ice | alpine`.

**Standalone Next.js Docker output** — `next.config.mjs` sets `output: "standalone"`. Runner stage runs `node server.js`. Prisma engine binaries are copied manually into the runner stage.

**Multi-migration Docker setup** — the `migrate` service loops over all `app/prisma/migrations/*/migration.sql` files in sorted order using `$$` escaping in docker-compose YAML (not `$`, which compose would interpolate). Adding a new migration only requires creating the file; no docker-compose change needed.

## Data model (summary)

```
User              — username (unique), passwordHash
TrainingProfile   — userId (→ User.id), goals[], currentGrade, targetGrade, age, weeksDuration, daysPerWeek, equipment[]
  └── TrainingPlan
        └── Week  — weekNum, theme
              └── Day  — dayNum, dayName, focus, isRest
                    └── DaySession  — name, description, duration (minutes)
                          └── Exercise  — name, sets?, reps?, duration?, rest?, notes?, order
                                └── ExerciseLog  — userId, setsCompleted?, repsCompleted?,
                                                   weightUsed?, durationActual?, notes?, completed
                                    UNIQUE(exerciseId, userId)
```

Note: `TrainingProfile.userId` and `ExerciseLog.userId` store the `User.id` as a plain string — no DB-level foreign key to `User`. This matches the existing schema pattern.

Full schema: `docs/data-model.md`

## Environment variables

| Variable | Dev (.env) | Docker (docker-compose.yml) |
|---|---|---|
| `DATABASE_URL` | `postgresql://climber:climber512@localhost:5432/climbapp` | `postgresql://climber:climber512@postgres:5432/climbapp` |
| `SESSION_SECRET` | `super-secret-session-key-change-in-production-32chars!!` | same |
| `ANTHROPIC_API_KEY` | set in `app/.env` | passed via `${ANTHROPIC_API_KEY}` in docker-compose.yml |
| `ANTHROPIC_BASE_URL` | `https://openrouter.ai/api` (for OpenRouter) | `${ANTHROPIC_BASE_URL:-}` |
| `ANTHROPIC_MODEL` | `anthropic/claude-haiku-4-5` (OpenRouter format) | `${ANTHROPIC_MODEL:-anthropic/claude-haiku-4-5}` |
| `ANTHROPIC_MAX_TOKENS` | `5000` (needs sufficient OpenRouter credit) | same |

Note: OpenRouter keys start with `sk-or-v1-`. Direct Anthropic keys start with `sk-ant-`. OpenRouter `ANTHROPIC_BASE_URL` must be `https://openrouter.ai/api` — NOT `https://openrouter.ai/api/v1` (the code appends `/v1/chat/completions` itself).

OpenRouter credit: with more detailed exercise notes the output is larger — budget ~2000–2500 tokens for a 4-week plan. Keep the key's monthly limit above `ANTHROPIC_MAX_TOKENS`, or the API returns 402.

## Docker notes

- **migrate service** — loops over all `app/prisma/migrations/*/migration.sql` files in sorted order via a shell `for` loop. Uses `$$f` in docker-compose YAML (double `$` to prevent compose variable interpolation). `|| true` makes each migration idempotent (safe to re-run on an existing DB).
- **web service** — `runner` target, `node server.js`, non-root user `nextjs`.
- **postgres data** — persisted in `postgres_data` named volume. Use `docker compose down -v` to wipe.
- **Adding a migration** — create `app/prisma/migrations/YYYYMMDDHHMMSS_name/migration.sql`, then `docker compose down -v && docker compose up --build -d` (wipe required only if the old data is incompatible with the new schema).

## UI notes

- **shadcn/ui** uses `@base-ui/react` (not Radix UI) — Accordion API: use `multiple` prop, not `type="multiple"`. No `defaultValue` on AccordionItem.
- **Tailwind v3** — CSS custom properties registered as color tokens in `tailwind.config.ts`. The `@import "shadcn/tailwind.css"` line was removed from `globals.css` — it caused build failures.
- **React 18** — use `useFormState` from `react-dom`, NOT `useActionState` (React 19 only).
- **Color scheme** — light theme: `bg-gradient-to-br from-slate-100 to-slate-50`, white cards, dark text. Do not revert to the old dark slate-900 scheme.
- **Mark complete pattern** — `ExerciseRow` tracks `completed` in local `useState` for immediate feedback, then calls `router.refresh()` after the server action to re-sync server data. Always follow this pattern for server action + optimistic UI in client components.
- All pages except login have a sticky header with logout button.

## Current state (as of 2026-04-22)

- **Auth** — real user registration and login via `User` DB table + bcryptjs password hashing. No hardcoded credentials. `LoginForm` has a Sign In / Register tab toggle.
- AI plan generation is live via `ai-plan-generator.ts` using plain `fetch` + OpenRouter + `anthropic/claude-haiku-4-5`
- Anthropic SDK removed — no `@anthropic-ai/sdk` dependency
- Discipline selector (bouldering, sport, trad, ice, alpine) on onboarding form
- `DaySession.duration` coerced to Int in `actions.ts` (model sometimes returns a string like `"45 min"`)
- Login redirects to `/dashboard` if the user has existing plans, or `/onboarding` if not
- **Truncated JSON repair** — if the model hits the token limit mid-response, `repairTruncatedJson` extracts complete weeks and closes the array, yielding a shorter valid plan instead of an error
- **Exercise detail** — prompt instructs model to include 3–5 exercises per session, a required `notes` coaching cue per exercise, and explicit sets/reps/duration/rest values
- **Multi-select plan deletion** — `DashboardClient` renders checkboxes per plan; selecting any reveals "Delete Selected (N)" with a confirm dialog; `deletePlans` server action handles the bulk cascade deletion
- `cascadeDeletePlan` is an internal helper shared by `deletePlan` (single) and `deletePlans` (bulk) — both cascade bottom-up: ExerciseLog → Exercise → DaySession → Day → Week → TrainingPlan
- Playwright test suite in `testing/` — 9 fast tests + 1 slow AI generation test; `auth.spec.ts` has a `beforeAll` that registers the `climber1` test user if it doesn't exist; all login helpers use `waitForURL(/\/(dashboard|onboarding)/)` then navigate explicitly if needed

## Testing workflow

After every code change, rebuild and verify before reporting complete:

```bash
# 1. Rebuild
docker compose up --build -d

# 2. Check logs for runtime errors
docker compose logs web --tail=20

# 3. Run tests (skip slow AI generation test for fast feedback)
cd testing
npx playwright test --grep-invert "generates a plan end-to-end"
```

If tests fail, fix the issue before considering the task done.

## What to avoid

- Do NOT add tRPC, NextAuth, or Zustand — not in this project
- Do NOT use `any` type — ESLint enforces this; use `unknown` and narrow
- Do NOT add `url = env(...)` back to the Prisma `datasource` block — Prisma 7 forbids it
- Do NOT use `useActionState` — React 18 project, use `useFormState` from `react-dom`
- Do NOT use `type="multiple"` on `<Accordion>` — use `multiple` boolean prop
- Do NOT run `docker compose up` without `--build` after code changes (env-only changes only need `up -d`)
- Do NOT add the Anthropic SDK back — plan generation uses plain `fetch`; the SDK's assistant-prefill trick is not needed with OpenRouter's OpenAI-compatible API
- Do NOT add outdoor/geolocation features — gym-only for v1
- Do NOT write raw SQL in application code — use Prisma queries only
- Do NOT use `$f` in docker-compose `command:` strings — compose interpolates single `$` as a variable. Use `$$f` to produce a literal `$f` in the shell.
- Do NOT call `router.refresh()` without first updating local state — always do the optimistic state update first, then refresh, so the UI doesn't flicker back before the server responds
