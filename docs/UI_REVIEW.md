# UI Review

Date reviewed: 2026-05-03

Perspective: product/UI review of the current React/Tailwind implementation, with emphasis on making the app feel more polished, easier to use repeatedly, and more trustworthy for training-plan work.

## Executive Summary

Climb512 already has a strong product foundation: guided intake, plan generation progress, version history, logging, editing, and AI adjustment are all present. The current UI also has a clear attempt at warmth through coach-like chat, soft cards, gradients, and friendly copy.

The main design issue is not lack of features. It is that many features are competing visually at the same level. The app often feels like a capable engineering tool wearing a decorative skin, instead of a calm training workspace with clear hierarchy. The highest-impact improvements would be:

1. Create one cohesive visual system.
2. Reduce header and plan-summary density.
3. Make the active plan workflow more task-oriented.
4. Improve mobile ergonomics for logging and plan review.
5. Add clearer state, progress, and latency feedback for AI interactions.

## What Is Working Well

- The chat intake concept is strong. It fits the product better than a long intake form and makes plan creation feel coached.
- The plan viewer has useful information architecture: week tabs, week summary, day accordions, session blocks, logging details, and coach guidance.
- The app already handles important product states: generating, failed generation, historical preview, version history, completed plans, locked logged days, and adjustments.
- The use of icons for main actions helps scanability.
- The persistent collapse state for plan sections is the right direction because users will revisit the same plans repeatedly.
- The app has meaningful domain-specific details: RPE, sessions, warmup/cooldown, exercise prescription chips, adjustment highlights, and protected history.

## Main Design Concerns

### 1. The Visual Language Is Split

The app mixes neutral shadcn-style tokens with custom glossy gradient cards, large rounded panels, radial highlights, soft shadows, blue focus states, slate forms, amber accents, and occasional marketing-like hero blocks.

This creates a slightly inconsistent feeling:

- Login/register feel like a polished consumer SaaS entry screen.
- Dashboard/intake use decorative gradient hero cards.
- Plan review is a dense operational workspace.
- Manual onboarding uses simpler shadcn cards.

Recommendation: move toward a restrained "training cockpit" style.

- Use mostly white and slate surfaces with one strong brand accent.
- Reserve gradients for the login/background or very rare top-level moments.
- Standardize radius around `8px` or `12px` for app surfaces. Avoid mixing `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-[1.4rem]`, and `rounded-[1.6rem]` unless there is a clear hierarchy.
- Standardize shadows. Use subtle shadows for floating elements only; use borders for most cards and sections.

### 2. The Plan Summary Header Is Too Busy

The plan page header is carrying too many jobs:

- page title
- collapse control
- plan metadata
- status banners
- version history
- edit day
- adjust plan
- complete/reopen
- generation status
- completion panel
- equipment chips
- locked-week warnings

That makes the first screen visually heavy and causes action layout issues.

Recommendation: split the plan page into a stable command bar plus a plan overview panel.

Suggested structure:

- Top sticky app header: brand, current section, menu.
- Plan command bar: `Versions`, `Edit`, `Adjust`, `Complete` as compact icon buttons with labels on desktop.
- Plan overview: collapsible metadata, goals, dates, equipment, status.
- Main plan workspace: week tabs, guidance, week/day content.

The key is that actions should be predictable and always in the same visual zone, while summary content can expand/collapse below them.

### 3. The Dashboard Should Be More Action-Oriented

The dashboard currently shows a large decorative "Your climbing workspace" panel and then saved plans. It is pleasant, but it does not quickly answer the user’s most important questions:

- What should I do today?
- Which plan is active?
- Which plans are generating or need attention?
- Where do I start a new plan?

Recommendation:

- Replace the decorative dashboard hero with a compact operational header.
- Add a primary action button: `New AI Plan`.
- Add a secondary action: `Manual Setup`.
- Add a "Current Plan" or "Today" section above saved plans when an active plan exists.
- Make plan cards more informative at a glance: current day/week, next workout focus, generated/completed status, and last activity.

The dashboard should feel like a home base, not just a library.

### 4. AI Chat Needs Better Waiting And Recovery States

The chat UI is simple and approachable, but it can feel stalled when the backend is slow. Given the latency findings, this matters.

Recommendation:

- Show an assistant "thinking" row immediately after send.
- Include subtle text such as `Checking your answer...` or `Building the next question...` after 1-2 seconds.
- After 8-10 seconds, show a non-alarming message: `Still working. The AI backend is taking longer than usual.`
- Keep the user’s sent answer visible immediately, which intake mostly does already.
- Consider a compact debug-only latency marker in development mode.

Also consider adding a small "What I know so far" drawer or summary strip in intake. It would help users notice when the AI misunderstood or invented a field, without turning the chat into a form.

### 5. Logging Forms Are Powerful But Dense

The exercise logging UI supports sets, intervals, attempts, summaries, notes, and completion. That is valuable, but the row-based inputs can become hard to use on small screens.

Risks:

- Many small fields in grid rows.
- Horizontal overflow for detailed logging.
- Similar visual weight for prescription, actuals, notes, and completion.
- Hard to distinguish "read plan" vs "log result" mode.

Recommendation:

- Separate exercise cards into two modes: `Plan` and `Log`.
- Default collapsed exercise view should emphasize what to do.
- When logging opens, show the logging form as a focused panel with clearer field labels.
- For mobile, stack fields vertically or use fewer primary fields per row.
- Make `Done` or `Save log` visually primary only inside the active exercise.

For repeated workouts, speed matters. Users should be able to log the basics quickly and only expand detailed actuals when needed.

### 6. Navigation Is Too Hidden For A Multi-Workflow App

The hamburger menu works, but the app now has several core workflows:

- My Plans
- AI Chat
- Manual Setup
- Plan Detail
- Edit Day
- Adjust Plan
- Version History

Recommendation:

- On desktop, consider a visible top nav or segmented navigation in the header: `Plans`, `New AI Plan`, `Manual Setup`.
- Keep the hamburger for mobile.
- Rename `AI Chat` to something more outcome-focused, such as `New AI Plan`.
- Rename `Manual Setup` to `Manual Plan` or `Create Manually`.

The app should make the primary path obvious without requiring the menu.

### 7. Brand And Product Positioning Are Too Climbing-Specific For The New Scope

The app is called Climb512 and much of the copy says climbing, but intake now supports climbing, running, cycling, and strength/conditioning.

Recommendation:

- Decide whether this is still a climbing-first product with extra sport support, or a broader training-plan product.
- If climbing-first: keep the brand, but phrase support as "Climbing-first plans, now with running, cycling, and strength/conditioning support."
- If broader: adjust dashboard and intake copy so non-climbing plans do not feel bolted on.

Right now, a runner or strength user may feel like they entered the wrong product.

## Priority Recommendations

### Priority 1: Establish A Design System Pass

Create a small design-system layer before adding more UI.

Define:

- App background
- Page header
- Command bar
- Section panel
- Repeated item card
- Status banner
- Chat bubble
- Week tab
- Day accordion
- Exercise row/card
- Primary, secondary, destructive, and icon button usage

This does not require a big redesign. It means consolidating the existing good patterns so every screen feels like the same product.

Implementation note:

- Added shared primitives for the app shell, page intro, section panel, command bar, and status banner.
- Moved dashboard, guided intake, manual onboarding, and the plan-summary surface onto the shared page/surface language.
- Simplified the signed-in app background and header from decorative gradients to calmer white/slate surfaces.
- Left deeper workflow changes for later priorities, especially the plan page command-bar redesign, dashboard task model, AI pending states, and mobile logging pass.

### Priority 2: Redesign The Plan Page Header

The plan page is the core product surface. Give it the most attention.

Recommended layout:

- Compact title row: plan title/status/current week.
- Right-aligned action group: versions, edit, adjust, complete.
- Collapsible plan details below.
- Generation/completion/preview warnings as separate full-width banners.
- Equipment chips below metadata, not mixed with action controls.

This will reduce visual noise and make the page feel more professional.

Implementation note:

- Reworked the plan page header into a stronger summary masthead with version/current-week status and a dedicated command bar for `Versions`, `Edit Day`, `Adjust Plan`, and `Complete`.
- Moved completion, preview, generation, failed-generation, and locked-week messages into full-width status rows that remain visible even when plan details are collapsed.
- Replaced the mixed metadata line with collapsible summary metrics, goal/athlete metadata, and equipment chips below the primary header.
- Kept the design restrained, but added a clearer accent edge, status pills, and structured information blocks so the page feels less flat while remaining task-focused.

### Priority 3: Improve Intake Feedback

Because AI latency varies, the chat must communicate progress.

Add:

- immediate pending assistant bubble
- delayed "still working" state
- clear retry state for failed responses
- optional collected-info summary

This will make NeMo/direct-AI differences feel less confusing and reduce repeated-answer frustration.

Implementation note:

- Added an immediate assistant pending bubble to guided intake so the user's answer is visibly being processed.
- Added an 8-second long-running message for intake and adjustment chat when NeMo or the AI backend takes longer than expected.
- Added retry actions for failed intake and adjustment chat requests so users can resend the same request without retyping.
- Added a compact `Known so far` summary in guided intake to show collected sport, goal, schedule, level, start date, and equipment as the conversation progresses.

### Priority 4: Make Dashboard A Real Home Screen

Replace the decorative dashboard intro with:

- `Continue Current Plan`
- `Today's Work`
- `New AI Plan`
- `Saved Plans`

This turns the dashboard from a plan list into a useful daily entry point.

Implementation note:

- Replaced the dashboard intro with a compact home-base header and direct `New AI Plan` / `Manual Setup` actions.
- Added a `Continue Current Plan` panel that highlights the most relevant incomplete plan and links directly to it.
- Added a `Today's Work` panel that surfaces the current week/day focus when the plan is active, or a clear starts-soon/generating/complete state otherwise.
- Kept `Saved Plans` below as the library/history area, with clearer status pills and a current-plan marker.

### Priority 5: Mobile Logging Pass

Review the exercise logging UI at phone width.

Focus on:

- tap target size
- field stacking
- sticky save affordance
- reducing horizontal scroll
- making completed state obvious

This app will likely be used around workouts, where mobile usability matters more than desktop polish.

Implementation note:

- Reworked detailed exercise logging rows so sets, intervals, attempts, and summary logs stack into usable two-column mobile layouts instead of forcing horizontal scrolling.
- Increased mobile input and action heights for better tap targets.
- Added an explicit `Complete` checkbox inside the open log panel and a sticky mobile save affordance.
- Adjusted day accordion headers so duration/status metadata wraps below the focus on small screens instead of crowding the title row.

## Screen-Specific Notes

### Login And Register

Good:

- Polished first impression.
- Clear account form.
- Brand mark is memorable enough.

Improve:

- The background is more decorative than the rest of the product. Consider simplifying after sign-in for consistency.
- Registration is a long form; group profile fields and account fields more clearly.
- Add inline password requirement feedback instead of a paragraph users must interpret after submission.

### Dashboard

Good:

- Saved plan cards are simple and understandable.
- Bulk delete exists.

Improve:

- Add primary creation actions directly on the dashboard.
- Surface active/current plan first.
- Show plan progress visually.
- Make checkboxes less visually disconnected from plan cards.

### Guided Intake

Good:

- Conversational format is appropriate.
- The final wand action is a nice moment.
- Message bubbles are readable.

Improve:

- Add pending/long-running states.
- Consider a collected-info side panel on desktop or collapsible summary on mobile.
- The "magic wand" button may be cute but can be ambiguous; pair it with `Generate Plan` text on desktop.
- Initial copy should avoid overloading the first assistant message.

### Plan Detail

Good:

- Rich functionality.
- Week navigation is clear.
- Day accordions make long plans manageable.
- Version history and protected logged days are important and thoughtfully handled.

Improve:

- Reduce header density.
- Make primary actions stable and predictable.
- Use clearer hierarchy between plan metadata, coach guidance, week summary, day cards, and exercise logging.
- Consider making week navigation sticky below the page header.

### AI Adjustment

Good:

- Matching intake chat is smart.
- Starter prompts are helpful.
- Proposal review is safer than direct mutation.

Improve:

- Distinguish "chatting" from "reviewing proposal" more strongly.
- Make scope selection feel like part of the proposal, not another cluster of pills.
- For high-risk changes, use a clearer confirmation banner.

## Suggested Visual Direction

A stronger visual direction for this app would be:

- Calm, utilitarian, training-focused.
- Mostly neutral surfaces with a restrained blue/teal accent.
- Amber only for warnings or adjusted-history states.
- Green only for completion/logged work.
- Red only for destructive/error states.
- Fewer gradients; more clean panels and readable data.
- Compact but not cramped.

The product should feel like a coach's notebook crossed with a workout logger, not a marketing site.

## Suggested Implementation Sequence

1. Define shared layout components: `PageShell`, `PageIntro`, `CommandBar`, `StatusBanner`, `SectionPanel`.
2. Refactor dashboard and intake to use the same page intro and panel language.
3. Redesign the plan summary/action header.
4. Add AI pending/long-running states to intake and adjustment chat.
5. Improve mobile logging forms.
6. Revisit branding/copy for multi-sport support.

## Final Take

The application is feature-rich and already useful. The next design step is restraint: fewer competing decorative surfaces, clearer hierarchy, and workflows organized around what the user is trying to do right now.

If the plan page becomes calmer and the chat flows get better feedback during slow AI calls, the whole product will feel much more mature without needing a dramatic redesign.
