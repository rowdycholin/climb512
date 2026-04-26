# UI Review

Date: 2026-04-25

## Current state

The app is in a better place than it was during the first review pass:

- authenticated navigation is now shared through a hamburger-style header
- the plan page has clearer entry points for editing and coaching
- editor controls now use icon actions instead of full text buttons
- the product feels more consistent across login, dashboard, onboarding, and plan pages

The main remaining issue is not basic consistency anymore. It is polish. The UI is usable and coherent, but it still feels flatter and more utilitarian than a finished product should.

## What is working

- information architecture is straightforward
- the plan viewer is readable and generally easy to scan
- onboarding and dashboard flows are easy to follow
- cards, pills, and soft borders fit the coaching product well
- the shared header/menu is a real improvement
- edit-mode entry on the plan page is now clearer

## What still needs attention

- visual identity is still too muted
- typography hierarchy could be stronger
- dashboard still feels more functional than premium
- onboarding still feels heavier than the rest of the app
- plan editing is usable, but not yet elegant
- the plan page still has too many competing surfaces and chips

## Highest-priority next steps

## 1. Strengthen the visual identity

The app is more consistent now, but it still does not feel distinctive enough as "Climb512".

Recommendation:

- establish one stronger visual direction across all authenticated screens
- make the brand lockup and accent system feel more intentional
- use one recurring motif across surfaces, such as subtle route-grid or topo-inspired texture

## 2. Improve typography hierarchy

Text is readable, but not yet expressive enough.

Recommendation:

- strengthen page and section headings
- reduce the weight of metadata and helper copy
- standardize a smaller set of text roles:
  - page title
  - section title
  - card title
  - body
  - metadata
  - caption

## 3. Keep refining the plan page

This is the most important screen in the product.

Current positives:

- summary header is cleaner than before
- pencil and coach actions are compact and understandable
- edit mode is easier to discover

Remaining issues:

- summary card, week tabs, day accordions, and editing surfaces still compete visually
- too many pills and small bordered elements carry similar weight
- editing still feels like a tool panel, not a polished interaction mode

Recommendation:

- make the plan viewer feel like the main object on the page
- reduce equal visual emphasis across chips, pills, badges, and borders
- keep improving the spacing and hierarchy between summary, week tabs, and day cards

## 4. Improve plan editing ergonomics

The current editor works, but it is still closer to a draft editor than a polished product interaction.

Current state:

- day reordering still lives in the separate `Day order` list
- detailed editing now renders training days only
- add / duplicate / delete controls are icon-based
- the old move dropdown is gone

Recommendation:

- move toward a unified editing surface
- reduce vertical sprawl in edit mode
- continue aligning actions tightly with the content they affect
- eventually support richer gesture-based reordering inside the day itself

## 5. Upgrade the dashboard

The dashboard works, but it still feels sparse and transactional.

Recommendation:

- give the dashboard a stronger home-base feel
- improve plan-card hierarchy and presence
- make the primary CTA feel more like a product action than a utility button
- move destructive actions into a quieter interaction pattern over time

## 6. Refine onboarding

Onboarding is serviceable, but still feels heavier than the other screens.

Recommendation:

- keep it aligned with the shared app shell
- reduce repeated "stack of cards" fatigue
- introduce stronger guided rhythm and progress framing

## 7. Continue cleaning up text artifacts

Small text and encoding issues have an outsized effect on perceived quality.

Recommendation:

- keep sweeping visible UI strings for malformed punctuation or symbols
- prefer plain ASCII unless a verified UTF-8 character clearly improves the UI

## Recommended focus order

1. Strengthen the visual system and typography.
2. Polish the plan page hierarchy and editing surfaces.
3. Upgrade the dashboard into a stronger home base.
4. Refine onboarding and logging interactions.

## Summary

The app no longer needs a basic consistency rescue. It now needs a product-polish pass.

The biggest gains will come from:

- stronger brand expression
- better typography hierarchy
- calmer plan-page composition
- more elegant edit-mode interactions
