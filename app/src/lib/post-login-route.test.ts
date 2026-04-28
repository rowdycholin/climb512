import { describe, expect, test } from "vitest";
import { resolvePostLoginPath } from "./post-login-route";

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
