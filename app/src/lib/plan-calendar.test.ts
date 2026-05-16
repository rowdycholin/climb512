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

  test("uses the user's timezone when UTC has already rolled to tomorrow", () => {
    const now = new Date("2026-05-15T01:30:00.000Z"); // May 14 in America/New_York

    const may13Plan = getPlanCalendarStatus({
      startDate: new Date("2026-05-13T00:00:00.000Z"),
      now,
      totalWeeks: 4,
      timeZone: "America/New_York",
    });
    expect(may13Plan.currentPlanDay).toBe(2);
    expect(may13Plan.isBeforeStart).toBe(false);

    const may15Plan = getPlanCalendarStatus({
      startDate: new Date("2026-05-15T00:00:00.000Z"),
      now,
      totalWeeks: 4,
      timeZone: "America/New_York",
    });
    expect(may15Plan.currentPlanDay).toBe(0);
    expect(may15Plan.isBeforeStart).toBe(true);
  });
});
