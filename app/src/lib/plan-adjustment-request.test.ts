import { describe, expect, test } from "vitest";
import {
  buildPlanAdjustmentRequest,
  findNextUnloggedPlanDay,
  planDayFromWeekDay,
  splitPlanByEffectiveDay,
  validateLockedHistoryUnchanged,
  type WorkoutLogDayMarker,
} from "./plan-adjustment-request";
import type { PlanSnapshot, ProfileSnapshot } from "./plan-snapshot";

function day(weekNum: number, dayNum: number, isRest = false) {
  return {
    key: `w${weekNum}-d${dayNum}`,
    dayNum,
    dayName: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][dayNum - 1],
    focus: isRest ? "Rest" : "Training",
    isRest,
    sessions: isRest
      ? []
      : [
          {
            key: `w${weekNum}-d${dayNum}-s1`,
            name: "Session",
            description: "Training session",
            duration: 45,
            exercises: [
              {
                key: `w${weekNum}-d${dayNum}-e1`,
                name: "Exercise",
                sets: "3",
                reps: "5",
                duration: null,
                rest: "2 min",
                notes: "Move well",
              },
            ],
          },
        ],
  };
}

function snapshot(weeks = 2): PlanSnapshot {
  return {
    weeks: Array.from({ length: weeks }, (_, index) => {
      const weekNum = index + 1;
      return {
        key: `week-${weekNum}`,
        weekNum,
        theme: `Week ${weekNum}`,
        days: Array.from({ length: 7 }, (_, dayIndex) => day(weekNum, dayIndex + 1, dayIndex > 2)),
      };
    }),
  };
}

function logFor(weekNum: number, dayNum: number): WorkoutLogDayMarker {
  return {
    weekNum,
    dayNum,
    sessionKey: `w${weekNum}-d${dayNum}-s1`,
    exerciseKey: `w${weekNum}-d${dayNum}-e1`,
    exerciseName: "Exercise",
    completed: true,
  };
}

const profileSnapshot: ProfileSnapshot = {
  goals: ["build fitness"],
  currentGrade: "V4",
  targetGrade: "V6",
  age: 35,
  weeksDuration: 2,
  daysPerWeek: 3,
  equipment: ["hangboard"],
  discipline: "bouldering",
  createdAt: "2026-05-01T00:00:00.000Z",
};

describe("plan adjustment request helpers", () => {
  test("uses today as effective day when today has no logged exercises", () => {
    const effective = findNextUnloggedPlanDay({
      planStartDate: new Date("2026-05-04T00:00:00"),
      currentDate: new Date("2026-05-06T12:00:00"),
      snapshot: snapshot(),
      logs: [logFor(1, 1)],
    });

    expect(effective).toEqual({
      weekNum: 1,
      dayNum: 3,
      planDay: 3,
      date: "2026-05-06",
    });
  });

  test("moves to the next unlogged day when today has logged exercises", () => {
    const effective = findNextUnloggedPlanDay({
      planStartDate: new Date("2026-05-04T00:00:00"),
      currentDate: new Date("2026-05-06T12:00:00"),
      snapshot: snapshot(),
      logs: [logFor(1, 1), logFor(1, 3)],
    });

    expect(effective).toMatchObject({
      weekNum: 1,
      dayNum: 4,
      planDay: 4,
      date: "2026-05-07",
    });
  });

  test("splits locked historical days from adjustable future days", () => {
    const split = splitPlanByEffectiveDay(snapshot(), planDayFromWeekDay(1, 4));

    expect(split.lockedDays.map((entry) => entry.planDay)).toEqual([1, 2, 3]);
    expect(split.adjustableDays[0].planDay).toBe(4);
    expect(split.adjustableDays.at(-1)?.planDay).toBe(14);
  });

  test("rejects adjusted output that changes a locked day", () => {
    const original = snapshot();
    const adjusted = structuredClone(original);
    adjusted.weeks[0].days[1].focus = "Changed";

    expect(() => validateLockedHistoryUnchanged(original, adjusted, planDayFromWeekDay(1, 4))).toThrow(
      "Adjusted plan changed locked day week 1 day 2",
    );
  });

  test("allows adjusted output that only changes future days", () => {
    const original = snapshot();
    const adjusted = structuredClone(original);
    adjusted.weeks[0].days[3].focus = "Adjusted future";

    expect(() => validateLockedHistoryUnchanged(original, adjusted, planDayFromWeekDay(1, 4))).not.toThrow();
  });

  test("builds a validated adjustment request with locked context", () => {
    const effectiveFrom = {
      weekNum: 1,
      dayNum: 4,
      planDay: 4,
      date: "2026-05-07",
    };

    const request = buildPlanAdjustmentRequest({
      reason: "too_hard",
      userFeedback: "The first sessions are too intense.",
      effectiveFrom,
      planStartDate: new Date("2026-05-04T00:00:00"),
      currentVersion: {
        id: "version-1",
        versionNum: 1,
        profileSnapshot,
      },
      logs: [logFor(1, 1), logFor(1, 3)],
    });

    expect(request.reason).toBe("too_hard");
    expect(request.lockedContext.currentPlanVersionId).toBe("version-1");
    expect(request.lockedContext.completedDays.map((day) => day.date)).toEqual(["2026-05-04", "2026-05-06"]);
    expect(request.lockedContext.loggedExercises).toHaveLength(2);
  });
});
