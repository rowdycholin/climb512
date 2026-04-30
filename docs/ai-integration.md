# AI Integration

## Current status

The stable AI integrations today are guided intake, plan generation, and the server-backed future-plan adjustment chat. All three use an OpenAI-compatible chat-completions transport when the app is pointed at a live backend. Simulator/local mode keeps deterministic fallbacks for repeatable development and tests.

Files:

- `app/src/lib/ai-plan-generator.ts`
- `app/src/lib/plan-generation-worker.ts`
- `app/src/worker/plan-generation-worker.ts`
- `app/src/lib/plan-request.ts`
- `app/src/lib/intake.ts`
- `app/src/lib/plan-adjustment-request.ts`
- `app/src/lib/plan-adjustment-chat.ts`

The plan page also has a day-level future adjustment flow in:

- `app/src/components/PlanAdjuster.tsx`
- `app/src/app/actions.ts` (`applyConfirmedPlanAdjustment`)

That adjustment flow uses the live AI backend when configured for a remote provider. When the app is pointed at the simulator/local backend, it uses deterministic conversational fixtures behind the same adjustment chat proposal schema. The older constrained week-adjustment helper in `app/src/lib/ai-plan-adjuster.ts` still exists as legacy prototype code.

## Plan generation

Manual onboarding still uses the legacy generator input:

- goals
- current grade
- target grade
- age from the registered user record
- weeks duration
- days per week
- equipment
- discipline

Guided intake creates a plan shell, stores the original `PlanRequest` in `PlanGenerationJob.profileSnapshot.planRequest`, and creates a `PlanGenerationJob`. The `plan-worker` service then generates one week at a time and saves each week in `PlanGenerationWeek`. When every week is ready, the worker creates the first user-facing generated `PlanVersion`.

Manual onboarding still generates the full plan in the request/response path until the worker flow is stable.

`Plan.startDate` is saved on the `Plan` record for calendar positioning. It is included in the structured request for guided intake but the durable calendar anchor remains the `Plan.startDate` column.

## Guided intake

The `/intake` route is the first step toward a generic chat-based plan intake. Today it is intentionally conservative:

- it uses the live AI provider for a coach-led interview when pointed at a live backend
- local/simulator mode can still use deterministic fallback extraction for tests and demos
- it asks flexible follow-up questions around sport/discipline, goal, timeline, equipment, strength training, start date, current level, schedule, preferences, and injuries/limitations
- it extracts a generic `PlanRequest` from the user's answers
- the structured draft stays hidden from the UI and is submitted once required fields are ready
- it creates a `PlanGenerationJob` from the completed `PlanRequest`
- the simulator consumes `PlanRequest` fields for sport selection, event vs ongoing goals, strength support, and injury/avoid-exercise substitutions

The model still has to return the validated `PlanIntakeAiResponse` JSON contract. Invalid output falls back without mutating the draft.

The intake prompt includes the browser's local date and time zone. The server also normalizes common date answers and guards against past start dates, including natural inputs like `today`, `now`, `as soon as possible`, `10/15/26`, and `Monday May 4th`.

When enough information has been collected, the assistant tells the user to click the magic-wand button. The button stays disabled until the hidden draft passes the full `PlanRequest` schema.

Worker output:

- one generated week object per job iteration
- each week contains 7 days
- each day contains sessions and exercises

That raw result is stored as:

- `PlanGenerationJob.profileSnapshot`
- one `PlanGenerationWeek.weekSnapshot` per generated week

When the job completes, the generated weeks are composed into a full `PlanVersion.planSnapshot`.

## Plan adjustment

Future-plan adjustment starts from the plan page's `Adjust Plan` panel:

1. the user describes what should change in chat
2. the app proposes a scoped adjustment with a summary and affected days
3. the user can accept the inferred scope or choose a small override
4. the app calculates the next unlogged plan day
5. locked historical days and recent logs are summarized in a `PlanAdjustmentRequest`
6. only approved unlogged days inside the scope are rewritten
7. locked history and out-of-scope days are validated as unchanged
8. the adjusted snapshot is saved as a new `PlanVersion` with `changeMetadata`

Live-provider mode sends the current plan context and adjustment conversation to the AI backend. The model must either ask one follow-up question or return a structured proposal with summary, changed days, changed weeks, effective-from day, and a complete revised plan snapshot. The server validates the proposal before apply. Simulator/local mode uses deterministic fixtures that return the same proposal shape.

## Response handling

Plan generation:

- requests JSON-only output
- strips markdown fences if needed
- parses the returned content
- repairs some truncated JSON responses when possible
- normalizes week/day/session/exercise fields into the app's plan types

Guided intake:

- validates the model's `PlanIntakeAiResponse` with Zod
- refuses unsafe or unrelated intake messages before the provider boundary
- preserves already collected draft fields and replaces stale duplicate questions with the next missing question
- keeps direct-answer hints such as relative start dates, preferred workout/rest days, and nuanced big-wall goals

Plan adjustment:

- validates the model's adjustment response with Zod
- makes one AI-backed repair attempt when live adjustment JSON is malformed
- rejects proposals that alter locked history, remove required identifiers, omit changed-day declarations, or change the plan goal without explicit user confirmation

## Runtime backends

The app uses an OpenAI-compatible `chat/completions` transport via plain `fetch`.

There are currently two backend modes:

### Simulator/local

- `ANTHROPIC_BASE_URL=http://simulator:8787`
- intake uses deterministic local extraction via `AI_INTAKE_MODE=local`
- generation goes to the local simulator service from both `web` and `plan-worker`
- adjustment uses deterministic app-side fixtures

### Live provider

- `ANTHROPIC_BASE_URL=https://openrouter.ai/api`
- intake, generation, and adjustment go to the configured remote provider

The app appends `/v1/chat/completions` itself.

In Docker, `web` and `plan-worker` read backend settings from `app/.env`. Copy `app/.env-simulator` or `app/.env-aibackend` to `app/.env`, then recreate those containers to switch modes. Editing `app/.env` alone does not change the already-running container process environment.

## Environment variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | backend auth token |
| `ANTHROPIC_BASE_URL` | provider base URL |
| `ANTHROPIC_MODEL` | model identifier |
| `ANTHROPIC_MAX_TOKENS` | output token cap |
| `ANTHROPIC_INTAKE_MAX_TOKENS` | intake response token cap |
| `ANTHROPIC_ADJUSTMENT_MAX_TOKENS` | adjustment response token cap |
| `AI_INTAKE_MODE=local` | force deterministic local intake fallback |

## Privacy note

When the app is pointed at a local simulator-like base URL, it may include the current session login ID in a request header so simulator logs can show who triggered plan generation.

That login header is **not** sent to live provider URLs such as OpenRouter.

## Storage model impact

AI output is not written into normalized `Week/Day/Exercise` tables.

Instead:

- worker-generated weeks are stored in `PlanGenerationWeek` until the job completes
- completed generated plans become `PlanVersion.planSnapshot`
- manual onboarding inputs become `PlanVersion.profileSnapshot`; guided-intake `PlanRequest` context lives on `PlanGenerationJob.profileSnapshot` during worker generation and then becomes `PlanVersion.profileSnapshot`
- future adjustments become new `PlanVersion` rows with `changeType = "ai_chat_adjustment"`, `effectiveFromDay`, and `changeMetadata`
- user history stays in `WorkoutLog`

That makes generated plans easier to revise later without destroying historical logs.

## Rich plan detail direction

The current plan snapshot focuses on compact, trackable fields. A planned roadmap item will add optional rich coaching fields such as week summaries, progression notes, day coach notes, session objectives/intensity, warmups/cooldowns, and exercise modifications. These should remain optional and separate from logging fields so old snapshots keep working and workout tracking stays simple.
