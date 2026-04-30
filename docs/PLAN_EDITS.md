# Plan Edits Proposal

Date: 2026-04-25

## Current status

Parts of this proposal are still future-facing, but the current editor has already changed since it was written:

- the detailed editor section includes rest days, and adding an exercise converts that day to training
- add / duplicate / delete are icon actions
- the old `move to another training day` dropdown has been removed
- logged weeks now allow additive custom exercises while preserving existing logged work
- broader plan changes now live in `Adjust Plan`, which creates a new `PlanVersion` after a scoped proposal is approved

The main unresolved proposal in this document is still valid:

- collapse the two editing zones into one unified editable day list

## Goal

Unify plan editing so the user stays in one edit surface:

- when all days are collapsed, they can reorder days
- when a day is expanded, they can edit and reorder exercises inside that day
- they should not feel like they are switching between two different editing tools

This matches the current product direction better than having a separate `Day order` section plus a separate detailed exercise section.

## Current problem

The current editor in [app/src/components/PlanEditor.tsx](/abs/path/c:/Users/beatt/projects/cursor/climb512/app/src/components/PlanEditor.tsx) works, but it splits editing into two mental models:

- a compact `Day order` list for moving days
- a full day detail area for editing exercises

That creates a few UX issues:

- users have to understand two different editing zones
- day reordering only makes sense in one section
- exercise editing happens in a different visual structure than day movement
- the layout feels heavier than it needs to, especially on mobile

## Recommended model

Use a single editable day list with collapsible day cards.

### Collapsed state

Each day is shown as a compact card row:

- drag handle
- day name
- focus summary
- rest/training badge
- expand/collapse affordance

In this state, the list is optimized for reordering days.

Behavior:

- press and hold the day handle
- drag the collapsed day up or down
- reorder happens in place

This is the cleanest moment to support day movement because card heights are stable and the gesture target is obvious.

### Expanded state

When the user expands a day, that card becomes the edit surface for that day.

The expanded day should show:

- session header
- exercise list
- add exercise action
- inline day-level actions like rename focus or convert to rest

In this state, exercise editing becomes primary.

Behavior:

- drag exercises within the expanded day to reorder them
- swipe or use quick actions to delete, duplicate, or move an exercise
- optionally move an exercise to another day using a bottom sheet or selector

### Editing rule

To avoid gesture conflicts:

- only allow day drag when all day cards are collapsed
- once any day is expanded, disable day reordering
- in expanded mode, exercise reordering is active only within the expanded day

That rule is easy to explain and should feel predictable.

## Recommended interaction design

## Mobile

Primary interactions:

- long-press drag handle on collapsed day rows to reorder days
- tap a day row to expand it
- long-press drag handle on an exercise row to reorder exercises
- swipe exercise row for quick move/delete
- tap exercise row to edit fields in a bottom sheet

Why this is a good fit:

- collapsed day rows keep drag targets simple
- expanded mode gives enough room for exercise actions
- bottom sheets are easier on mobile than large inline forms

## Desktop

Desktop can use the same mental model with a bit more polish:

- drag collapsed day rows to reorder
- drag exercises inside expanded day
- keep click alternatives for all actions

I would not introduce full cross-day exercise drag immediately. It is possible, but it adds a lot of complexity and a higher risk of accidental movement.

## Detailed flow

## 1. Enter edit mode

The current icon-triggered edit mode on the plan summary page is a good starting point.

When edit mode opens:

- show the week as a stack of collapsible day cards
- all cards start collapsed
- top helper text explains:
  - `Drag collapsed days to reorder`
  - `Open a day to edit its exercises`

## 2. Reorder days

While all cards are collapsed:

- drag handle is enabled for day rows
- hover/press state should clearly show the row is draggable
- reorder preview should happen in place

If the user expands a day:

- day handles become disabled or visually muted
- helper text changes to:
  - `Close expanded days to reorder the week`

## 3. Edit a day

When a day expands:

- reveal session content and exercise rows
- show exercise drag handles
- show add/remove/duplicate controls
- keep the expanded day visually dominant

I recommend allowing only one expanded day at a time in v1. That keeps the state model much simpler and avoids confusing drag behavior.

## 4. Reorder exercises

Within the expanded day:

- each exercise row gets a drag handle
- long-press drag reorders within the session
- if there is only one session per day, this stays straightforward

If multiple sessions per day become common later, the rule should be:

- v1: reorder within the current session only
- later: support moving between sessions

## 5. Move exercises to another day

I would keep this as an explicit action, not a drag target, at least for now.

Recommended flow:

- swipe exercise row or tap `Move`
- open a bottom sheet with destination days
- choose target day
- exercise is appended to the main session of that target day

This is safer than cross-day drag on mobile.

## Why this is feasible now

The current JSON snapshot model is a good fit for this.

We do not need relational rewiring to support this UI. The client can edit one week snapshot in memory and save it as a new version.

High-level write path:

1. load current week into editable client state
2. mutate local day order and exercise order
3. save updated week snapshot
4. server validates and creates a new `PlanVersion`

That part is already aligned with the current architecture.

## What would need to change

## Component changes

### [app/src/components/PlanEditor.tsx](/abs/path/c:/Users/beatt/projects/cursor/climb512/app/src/components/PlanEditor.tsx)

This is the main file that would need restructuring.

Current editor shape:

- separate `Day order` section
- separate detailed day cards below

Proposed shape:

- one `EditableDayList`
- each row can be collapsed or expanded
- collapsed rows handle day movement
- expanded row handles exercise editing

Specific changes:

- add `expandedDayId` state
- remove the separate `Day order` block
- move `dayCardRefs` to the unified day row list
- keep the existing hold-to-drag day logic, but only enable it when `expandedDayId === null`
- add exercise drag state for the expanded day
- move exercise field editing into either:
  - inline expanded rows for v1, or
  - a mobile bottom sheet for a cleaner v1.1

### New subcomponents I would recommend

To keep `PlanEditor.tsx` from growing further, split it into:

- `EditableDayCard`
- `ExerciseRowEditor`
- `ExerciseEditSheet`
- `ReorderHandle`

This is not strictly required, but I do recommend it. The current editor is already large enough that the unified version will be easier to maintain if it is decomposed.

### [app/src/components/PlanPageShell.tsx](/abs/path/c:/Users/beatt/projects/cursor/climb512/app/src/components/PlanPageShell.tsx)

Minor updates only:

- add one line of helper copy when editor is open
- optionally show whether the week is in `reorder days` or `edit day` mode based on expansion state

### [app/src/components/PlanWorkspace.tsx](/abs/path/c:/Users/beatt/projects/cursor/climb512/app/src/components/PlanWorkspace.tsx)

Likely unchanged aside from passing any extra editor state if needed.

## Data/state changes

The editable week draft is already close to what we need.

Additional client state:

- `expandedDayId: string | null`
- `activeExerciseDragId: string | null`
- `exerciseDragSessionId: string | null`

Potential helper utilities:

- `reorderList<T>(items, fromIndex, toIndex)`
- `reorderExercises(dayId, sessionId, fromIndex, toIndex)`
- `canReorderDays(expandedDayId)`

## Server changes

Probably none for the first pass.

The existing `saveEditedWeek(...)` flow should still be enough if the client sends the updated week snapshot.

Possible later additions:

- more specific validation errors for malformed exercise moves
- clearer normalization rules when moving an exercise to another day

## Testing changes

This will need focused interaction coverage.

Recommended tests:

- collapsed days reorder correctly
- expanding a day disables day reorder
- exercise reorder works inside the expanded day
- save persists both day order and exercise order
- weeks with logs remain locked

I would prioritize Playwright coverage here because this is gesture-heavy UI.

## Risks

## Gesture conflict

The biggest risk is conflict between:

- day drag
- exercise drag
- tap to expand
- swipe exercise actions

That is why I recommend the explicit rule:

- collapsed list = day reorder mode
- expanded day = exercise edit mode

This reduces ambiguity a lot.

## Too much inline editing

If every field stays inline, the expanded day can become visually noisy on mobile.

My recommendation:

- keep reorder and quick actions inline
- move full field editing into a bottom sheet

That will feel cleaner than having many inputs open at once.

## Recommendation

This change is very feasible now.

I would recommend this exact approach:

1. Convert the editor into a single collapsible day list
2. Allow day reorder only when all days are collapsed
3. Allow only one expanded day at a time
4. Allow exercise reorder only inside the expanded day
5. Keep cross-day exercise moves as an explicit action, not drag-and-drop
6. Keep save behavior exactly the same: one edited week becomes a new `PlanVersion`

## Optional improvements

These are not required for the first pass, but I think they would improve the experience:

- add a short mode hint bar while editing
- add haptic-friendly visual feedback on mobile during long-press drag
- add undo before save
- add `Reset week` to revert to the current saved version
- eventually add a diff preview before saving

## Short version

Yes, this is a good direction.

It should not be especially hard with the current JSON-based week draft model. The main work is UI/state restructuring in `PlanEditor`, not backend storage. The safest and cleanest version is:

- collapsed days for day reordering
- expanded day for exercise editing
- one expanded day at a time
- explicit move actions for cross-day exercise movement
