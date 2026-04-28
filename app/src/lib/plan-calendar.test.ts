import { describe, expect, test } from "vitest";
import { getPlanCalendarStatus } from "./plan-calendar";

describe("getPlanCalendarStatus", () => {
  test("calculates current plan day from the start date", () => {
    const status = getPlanCalendarStatus({
      startDate: new Date("2026-05-04T00:00:00.000Z"),
      now: new Date("2026-05-06T12:00:00.000Z"),
      totalWeeks: 4,
    });

    expect(status.currentPlanDay).toBe(3);
    expect(status.totalPlanDays).toBe(28);
    expect(status.currentWeekIndex).toBe(0);
    expect(status.currentDayIndex).toBe(2);
    expect(status.isComplete).toBe(false);
  });

  test("marks a plan complete after the final plan day", () => {
    const status = getPlanCalendarStatus({
      startDate: new Date("2026-05-04T00:00:00.000Z"),
      now: new Date("2026-06-01T00:00:00.000Z"),
      totalWeeks: 4,
    });

    expect(status.currentPlanDay).toBe(28);
    expect(status.totalPlanDays).toBe(28);
    expect(status.isComplete).toBe(true);
  });
});
