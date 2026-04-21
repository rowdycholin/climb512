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
ANTHROPIC_API_KEY="sk-..."
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

```bash
cd app
psql postgresql://climber:climber512@localhost:5432/climbapp \
  -f prisma/migrations/20240101000000_init/migration.sql
```

## Running the dev server

```bash
cd app
npm run dev
```

App is available at http://localhost:3000

Login: `climber1` / `climbin512!`

## Making schema changes

1. Edit `app/prisma/schema.prisma`
2. Write corresponding SQL in a new migration file: `app/prisma/migrations/YYYYMMDDHHMMSS_name/migration.sql`
3. Apply: `psql $DATABASE_URL -f app/prisma/migrations/.../migration.sql`
4. Regenerate the client: `npx prisma generate`

> Do NOT use `prisma migrate dev` — it requires a live DB at migration time and conflicts with the Docker-only workflow. Write SQL migrations manually and apply via psql.

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
