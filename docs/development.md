# Development Guide

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop (for running PostgreSQL locally via compose, or install PostgreSQL directly)

## Initial setup

```bash
cd app
npm install
```

Copy `.env` if it doesn't exist (it should already be present — do not commit it):
```bash
# .env contents needed:
DATABASE_URL="postgresql://climber:climber512@localhost:5432/climbapp"
SESSION_SECRET="super-secret-session-key-change-in-production-32chars!!"
ANTHROPIC_API_KEY="sk-or-v1-..."         # OpenRouter key
ANTHROPIC_BASE_URL="https://openrouter.ai/api"
ANTHROPIC_MODEL="anthropic/claude-haiku-4-5"
ANTHROPIC_MAX_TOKENS="5000"
```

## Starting the database

Option A — use the Docker Compose postgres service only:
```bash
# From repo root
docker compose up postgres -d
```

Option B — local PostgreSQL install:
```bash
createdb climbapp
psql climbapp -c "CREATE USER climber WITH PASSWORD 'climber512';"
psql climbapp -c "GRANT ALL ON DATABASE climbapp TO climber;"
```

## Applying migrations

Run all migrations in order:
```bash
for f in app/prisma/migrations/*/migration.sql; do
  psql postgresql://climber:climber512@localhost:5432/climbapp -f "$f" || true
done
```

Or apply individually:
```bash
cd app
psql postgresql://climber:climber512@localhost:5432/climbapp \
  -f prisma/migrations/20240101000000_init/migration.sql
psql postgresql://climber:climber512@localhost:5432/climbapp \
  -f prisma/migrations/20240201000000_add_users/migration.sql
```

## Running the dev server

```bash
cd app
npm run dev
```

App is available at http://localhost:8080

Register a new account on the login page — there are no hardcoded credentials.

## Auth

- Users register via the "Register" tab on the login page (username ≥3 chars, password ≥8 chars)
- Passwords are hashed with `bcryptjs` before storage
- The `User` table holds `id`, `username`, `passwordHash`, `createdAt`
- `TrainingProfile.userId` and `ExerciseLog.userId` store the `User.id` as plain strings (no DB-level FK to `User`)

## Making schema changes

1. Edit `app/prisma/schema.prisma`
2. Write corresponding SQL in a new migration file: `app/prisma/migrations/YYYYMMDDHHMMSS_name/migration.sql`
3. Apply: `psql $DATABASE_URL -f app/prisma/migrations/.../migration.sql`
4. Regenerate the client: `npx prisma generate`

> Do NOT use `prisma migrate dev` — it requires a live DB at migration time and conflicts with the Docker-only workflow. Write SQL migrations manually and apply via psql.

The Docker migrate service runs all `app/prisma/migrations/*/migration.sql` files in sorted order automatically on `docker compose up`. Adding a new migration file is enough — no docker-compose change required.

## Type checking

```bash
cd app
npx tsc --noEmit
```

Run this after every set of code changes. The build will fail on type errors.

## Linting

```bash
cd app
npm run lint
```

ESLint config is in `.eslintrc.json`. Key rules:
- `@typescript-eslint/no-unused-vars` — prefix unused args with `_`
- `@typescript-eslint/no-explicit-any` — use `unknown` and narrow
- `react/no-unescaped-entities` — escape `'` as `&apos;` in JSX

## Building for production

```bash
cd app
npm run build
```

Output goes to `.next/`. The `next.config.mjs` sets `output: "standalone"` which bundles everything needed to run `node server.js` without the full `node_modules`.

## Common issues

### `PrismaClientConstructorValidationError: Using engine type "client" requires...`
You are missing the pg adapter. Check `src/lib/prisma.ts` — it must use `PrismaPg` from `@prisma/adapter-pg`.

### `The url property is no longer supported in schema files`
Prisma 7 breaking change. The `datasource db {}` block in `schema.prisma` must NOT have a `url` field. The URL is provided via `prisma.config.ts` and the `PrismaPg` adapter at runtime.

### `useActionState is not exported from 'react'`
This is React 19 API. This project uses React 18. Use `useFormState` from `react-dom` instead.

### `type="multiple"` on Accordion does nothing
The shadcn Accordion in this project uses `@base-ui/react`, not Radix UI. Use the `multiple` boolean prop instead.

### Plan generation returns 402
The OpenRouter key's monthly credit limit is too low. With detailed exercise notes, plans now use ~2000–2500 output tokens for a 4-week plan. Either raise the key's monthly limit at https://openrouter.ai/settings/keys or lower `ANTHROPIC_MAX_TOKENS`.

### Plan comes back shorter than requested (e.g. 2 weeks instead of 4)
The AI response was truncated at the token limit. `repairTruncatedJson` salvaged what it could. Increase `ANTHROPIC_MAX_TOKENS` or the OpenRouter key's monthly credit limit.

### Plan generation stays on `/onboarding`
The server action threw an error. Check `docker compose logs web` for the full error message. Common causes: API key missing, malformed JSON from the model (check the raw response logged), or database write failure.

### Plan deletion fails with foreign key constraint error
The `TrainingPlan` table has no DB-level cascade. `deletePlan` and `deletePlans` in `actions.ts` must delete bottom-up: ExerciseLog → Exercise → DaySession → Day → Week → TrainingPlan via the `cascadeDeletePlan` helper. If the schema grows new child tables, add them to `cascadeDeletePlan`.

### Mark complete doesn't update the UI
The `completed` state must be tracked in local `useState` for optimistic updates. After calling the server action, call `router.refresh()` to re-sync server data. Do not rely solely on the prop from the server — it won't change until refresh.

### Docker migrate service shows "variable is not set" warning for `f`
Docker Compose interpolates single `$` as a variable. Use `$$f` in the `command:` string — compose converts `$$` to `$` before passing to the shell.

## Running the test suite

The Playwright tests live in `testing/` and run against a live app on `localhost:8080`.

```bash
# Start the app first
cd ..
docker compose up --build -d   # or: npm run dev (from app/)

# Run all tests
cd testing
npx playwright test

# Run a single test file
npx playwright test tests/onboarding.spec.ts

# Run a specific test by name
npx playwright test --grep "generates a plan"

# Run fast tests only (skip slow AI generation)
npx playwright test --grep-invert "generates a plan end-to-end"
```

Tests open a real Chromium browser (`headless: false`). Screenshots and videos are saved to `testing/test-results/` on failure.

The `auth.spec.ts` file has a `beforeAll` that registers the `climber1` / `climbin512!` test user if it doesn't already exist. All test `login()` helpers use `waitForURL(/\/(dashboard|onboarding)/)` since login can land on either route.
