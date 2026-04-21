# Architecture

## System diagram

```
Browser
  │
  ▼
Next.js 14 (App Router)          ← Docker container "web" (port 3000)
  ├── Server Components           reads DB, renders HTML
  ├── Server Actions              mutations, AI calls, session writes
  └── Client Components          interactivity, logging forms, week picker
        │
        ├── iron-session cookie   stateless JWT, httpOnly
        │
        ├── Prisma 7 + pg adapter ──► PostgreSQL 16    ← Docker container "postgres" (port 5432, internal)
        │
        └── Anthropic Claude API  ──► claude-3-5-haiku (plan generation)
```

## Request lifecycle

### Page load (Server Component)
1. Browser requests `/plan/[id]`
2. Next.js calls `getSession()` — reads iron-session cookie
3. If not logged in → redirect to `/login`
4. Prisma query fetches plan + weeks + days + sessions + exercises + logs in one call
5. Calculates current week/day from `plan.createdAt`
6. Renders `PlanViewer` as a Server Component shell; passes serialised data as props
7. Client hydrates `PlanViewer` (accordion, week tabs, log forms)

### Plan creation (Server Action)
1. User submits onboarding form → `createPlan` server action fires
2. Action validates session
3. Saves `TrainingProfile` to DB
4. Calls Anthropic API with structured prompt (goals, grade, age, equipment, schedule)
5. Parses streamed JSON response into `Week → Day → DaySession → Exercise` hierarchy
6. Inserts all records in a single sequential write loop
7. Redirects to `/plan/[id]`

### Exercise logging (Server Action)
1. User fills log form or clicks checkbox → `logExercise` server action
2. Action does a Prisma `upsert` on `ExerciseLog` by `(exerciseId, userId)` unique key
3. Returns `{ ok: true }` — client shows "Saved!" feedback without a full page reload

## Component boundaries

```
app/plan/[id]/page.tsx   (Server Component)
  └── PlanViewer.tsx     (Client — "use client")
        ├── WeekCard     (inline, stateless render)
        ├── DayCard      (inline, uses Accordion from base-ui)
        ├── SessionBlock (inline, stateless render)
        └── ExerciseRow  (inline, owns log form state + useTransition)

app/login/page.tsx       (Server Component)
  └── LoginForm.tsx      (Client — useFormState)

app/onboarding/page.tsx  (Server Component)
  └── EquipmentPicker.tsx (Client — manages custom equipment array)
```

## Database connection (Prisma 7)

Prisma 7 removed `url = env("DATABASE_URL")` from `schema.prisma`. The URL is now provided in two places:

- **Migrations** (`prisma migrate deploy`) — read from `prisma.config.ts` via `dotenv/config`
- **Runtime** — passed to `new PrismaPg({ connectionString: process.env.DATABASE_URL })` in `src/lib/prisma.ts`

The singleton pattern (`globalThis.prisma`) prevents connection pool exhaustion during Next.js hot reload in development.

## Authentication

iron-session stores a signed, encrypted cookie containing `{ userId, username, isLoggedIn }`. The secret is `SESSION_SECRET` from env. No database session table — stateless. Cookie is `httpOnly` and `secure` in production.

Demo credentials are hardcoded in `actions.ts`. To add real users: replace the hardcoded check with a DB lookup and bcrypt password comparison.

## Scalability notes

The current Docker Compose setup is single-node. To scale to thousands of users:

| Concern | Current | Production path |
|---|---|---|
| Web tier | 1 container | Horizontal scale (ECS tasks / K8s pods) — Next.js standalone is stateless |
| Sessions | Cookie (stateless) | No change needed |
| Database | 1 Postgres container | Managed RDS / Cloud SQL + PgBouncer connection pooler |
| AI calls | Per-request | Add a queue (BullMQ / SQS) if plan generation should be async |
| Static assets | Served by Next.js | Move to CDN (CloudFront / Cloudflare) |
