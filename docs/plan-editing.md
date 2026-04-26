# Plan Editing UX Proposal

Date: 2026-04-24

## Current implementation status

Since this proposal was written, the app has already moved partway in this direction:

- direct editing is the primary week-adjustment path
- the pencil icon opens `Edit This Week`
- the editor has icon-based add / duplicate / delete controls
- the detailed edit section renders training days only
- AI coaching remains present, but as a secondary prototype

What is still not finished:

- the editor is still split between `Day order` and detailed cards
- exercise reordering within a day is not yet fully gesture-driven
- the UI still relies on inline fields more than bottom sheets

## Goal

Move the app from:

- `ask AI to change the week`

to:

- `edit the week directly`
- `ask AI for help only when needed`

The new snapshot-based plan storage makes this much easier because a week can now be treated as a structured document instead of a deep relational tree.

## Product principles

1. Common edits should not require AI
2. Mobile editing should be tap-first, not drag-only
3. Desktop can be richer with drag-and-drop
4. Every accepted manual edit should create a new `PlanVersion`
5. Logged weeks must remain protected from destructive changes

## Problems with the remaining current flow

The original AI-first adjuster is no longer the main problem. The larger remaining gap is that the manual editor still feels more like a draft tool than a polished mobile editing surface.

Current pain points:

- day reordering and exercise editing still live in two separate zones
- mobile interaction still leans heavily on inline form fields
- exercise reordering is not as direct as it should be
- some interactions still require too much scrolling

## Recommended direction

## 1. Split editing into two layers

### Direct editing

For routine edits, users should be able to:

- reorder workout days
- reorder exercises inside a session
- move an exercise to a different day
- remove an exercise
- duplicate an exercise
- add a simple custom exercise
- convert a day to rest
- swap a rest day with a workout day

### AI assistance

AI should become optional coaching support:

- `Rebalance this week after my edits`
- `Suggest a replacement for this exercise`
- `Make the rest of this week easier`
- `Explain why this session is here`

That makes AI a helper instead of the only editing path.

## 2. Mobile-first interaction model

Full nested drag-and-drop is possible, but on mobile it often feels fiddly.

Recommended mobile pattern:

- tap `Edit week`
- show drag handles where drag is useful
- prefer bottom-sheet actions for move / delete / replace
- use swipe actions on exercises for quick remove or move
- keep the primary edit actions reachable with one thumb

### Mobile interactions by object

#### Day card

Actions:

- `Move day`
- `Swap with...`
- `Make rest day`
- `Duplicate session to...`

Interaction:

- long-press drag on desktop and tablets
- `Move` bottom sheet on phone

#### Session

Actions:

- rename
- change duration
- move to another day
- duplicate
- delete

Interaction:

- `...` menu in header
- bottom sheet for move target

#### Exercise row

Actions:

- reorder
- move
- replace
- duplicate
- delete
- edit sets / reps / duration / rest / notes

Interaction:

- swipe left: delete
- swipe right: move
- tap row: open exercise editor sheet
- drag handle only when edit mode is active

## 3. Desktop interaction model

Desktop can support richer drag-and-drop:

- drag day cards across the week
- drag exercises within and across sessions
- multi-select exercises for bulk move/delete
- side panel editor instead of bottom sheet

Desktop should still preserve tap/click alternatives so drag is an enhancement, not a requirement.

## Proposed v1 UI

## Edit mode entry

On the plan page, replace the current adjuster-first emphasis with:

- primary button: `Edit week`
- secondary button: `Ask coach`

Status:

- implemented via icon actions in the plan summary
- still worth refining, but no longer adjuster-first

When `Edit week` is active:

- the week viewer becomes editable
- drag handles and quick actions appear
- a sticky action bar appears at the bottom

Sticky action bar:

- `Discard`
- `Preview changes`
- `Save week`

## Exercise editing flow

Tap an exercise row in edit mode to open a bottom sheet:

- name
- sets
- reps
- duration
- rest
- notes
- move to day
- duplicate
- delete

This is much better on mobile than trying to do everything inline.

## Day reordering flow

### Phone

- tap `Move day`
- choose destination day from a list
- app previews the swap or move

### Desktop

- drag day card horizontally

## Removing exercises without AI

This should be immediate:

1. user taps delete
2. UI removes the exercise locally
3. user can undo before save
4. save creates a new `PlanVersion`

No AI round-trip needed.

## Data model fit

The current JSON snapshot model already supports this direction well.

Recommended write path:

1. load current `PlanVersion.planSnapshot`
2. copy into editable client state
3. apply local mutations in the browser
4. on save, post the edited week or snapshot to the server
5. validate structure
6. create a new `PlanVersion`
7. set `Plan.currentVersionId` to the new version

This is much simpler than the old relational model.

## Suggested server actions

These would complement or eventually replace the current AI-only adjuster flow.

- `saveEditedWeek(planId, weekKey, weekDraft)`
- `moveExercise(planId, weekKey, exerciseKey, destination)`
- `deleteExercise(planId, weekKey, exerciseKey)`
- `duplicateExercise(planId, weekKey, exerciseKey, destination)`
- `reorderDays(planId, weekKey, orderedDayKeys)`
- `addCustomExercise(planId, weekKey, sessionKey, exerciseDraft)`

The actual implementation can still collapse some of these into one `saveEditedWeek` action, but these are the user-level capabilities we should design around.

## Rules for logged history

To protect history:

- weeks with existing logs should not allow structural edits by default
- small note-level edits could be allowed later if needed
- if future weeks are edited, prior weeks remain visible through older `PlanVersion` rows

This keeps history trustworthy.

## Alternatives considered

## Option A: Full nested drag-and-drop everywhere

Pros:

- feels powerful
- highly visual

Cons:

- hard to make reliable on mobile
- more implementation complexity
- easier to create accidental moves

Recommendation:

- use selectively, mostly for desktop and maybe day-level movement

## Option B: Edit mode + bottom sheets

Pros:

- very mobile-friendly
- lower implementation risk
- easier to make precise

Cons:

- slightly less flashy

Recommendation:

- best v1

## Option C: AI-first editing

Pros:

- low UI complexity

Cons:

- slow
- clunky
- poor for simple edits
- too dependent on typing

Recommendation:

- not the primary editing model

## Recommended phased rollout

## Phase 1

- `Edit week` mode
- move day
- reorder exercises within session
- move exercise to another day
- delete exercise
- duplicate exercise
- add custom exercise
- save as new `PlanVersion`

## Phase 2

- desktop drag-and-drop polish
- undo/redo
- reset week to original version
- compare current week vs previous version

## Phase 3

- `Ask coach` side panel
- AI suggestions layered on top of manual edits
- `Rebalance after my edits`
- replacement suggestions

## Recommendation

Build direct editing first.

The new JSON snapshot model is already the right backend foundation. The next improvement should be UX:

- edit directly
- use bottom sheets on mobile
- use drag-and-drop where it is genuinely helpful
- keep AI as optional coaching help, not the only route to change
