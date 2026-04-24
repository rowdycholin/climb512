# Security Notes

Date: 2026-04-23

## Ownership rules

- Training plans must only be readable by the user who owns the linked `TrainingProfile`.
- Exercise logs must only be created or updated when the target `Exercise` belongs to a plan owned by the authenticated user.

## Implementation

- Plan page access is now scoped through a server-side ownership query before any plan data is returned.
- Exercise logging now checks plan ownership before upserting `ExerciseLog`.
- Shared authorization logic lives in [app/src/lib/plan-access.ts](/c:/Users/beatt/projects/cursor/climb512/app/src/lib/plan-access.ts:1).

## Regression coverage

- [testing/tests/security.spec.ts](/c:/Users/beatt/projects/cursor/climb512/testing/tests/security.spec.ts:1) verifies that one user cannot load another user's plan.
- The same test file also verifies that forged exercise-log writes are rejected for non-owners and still succeed for the rightful owner.
