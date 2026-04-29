import { describe, expect, test } from "vitest";
import { resolvePostLoginPath, selectActivePlanId } from "./post-login-route";

function planFixture(overrides: Partial<Parameters<typeof selectActivePlanId>[0][number]> = {}) {
  return {
    id: "plan-123",
    startDate: new Date("2026-05-01T00:00:00.000Z"),
    completedAt: null,
    updatedAt: new Date("2026-04-29T12:00:00.000Z"),
    createdAt: new Date("2026-04-29T12:00:00.000Z"),
    currentVersion: {
      profileSnapshot: {
        weeksDuration: 4,
      },
      planSnapshot: {
        weeks: [],
      },
    },
    ...overrides,
  };
}

describe("resolvePostLoginPath", () => {
  test("sends users with no plans to guided intake", () => {
    expect(resolvePostLoginPath({ hasPlans: false, activePlanId: null })).toBe("/intake");
  });

  test("sends users with an active plan to that plan", () => {
    expect(resolvePostLoginPath({ hasPlans: true, activePlanId: "plan-123" })).toBe("/plan/plan-123");
  });

  test("sends users with plans but no active plan to My Plans", () => {
    expect(resolvePostLoginPath({ hasPlans: true, activePlanId: null })).toBe("/dashboard");
  });
});

describe("selectActivePlanId", () => {
  test("does not treat a future-starting plan as active", () => {
    expect(selectActivePlanId([planFixture()], new Date("2026-04-29T12:00:00.000Z"))).toBeNull();
  });

  test("selects a plan that has started and has not ended", () => {
    expect(selectActivePlanId([planFixture()], new Date("2026-05-02T12:00:00.000Z"))).toBe("plan-123");
  });

  test("does not treat a calendar-complete plan as active", () => {
    expect(selectActivePlanId([planFixture()], new Date("2026-06-01T12:00:00.000Z"))).toBeNull();
  });

  test("does not treat a user-completed plan as active", () => {
    expect(
      selectActivePlanId(
        [planFixture({ completedAt: new Date("2026-05-02T12:00:00.000Z") })],
        new Date("2026-05-03T12:00:00.000Z"),
      ),
    ).toBeNull();
  });
});
