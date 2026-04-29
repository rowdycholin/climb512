import { describe, expect, test } from "vitest";
import {
  countGeneratedWeeks,
  getNextJobStatusAfterWeek,
  getPlanGenerationProgress,
  isPlanGenerationStatus,
} from "./plan-generation-state";

describe("plan generation state", () => {
  test("counts generated weeks from a partial snapshot", () => {
    expect(countGeneratedWeeks({ weeks: [{ key: "week-1", weekNum: 1, theme: "Base", days: [] }] })).toBe(1);
    expect(countGeneratedWeeks({ weeks: [] })).toBe(0);
  });

  test("derives progress for partial generation", () => {
    const progress = getPlanGenerationProgress({
      status: "generating",
      generatedWeeks: 1,
      totalWeeks: 4,
    });

    expect(progress.isGenerating).toBe(true);
    expect(progress.generatedWeeks).toBe(1);
    expect(progress.missingWeeks).toBe(3);
    expect(progress.nextWeekNum).toBe(2);
    expect(progress.percent).toBe(25);
  });

  test("clamps generated weeks to total weeks", () => {
    const progress = getPlanGenerationProgress({
      status: "ready",
      generatedWeeks: 8,
      totalWeeks: 4,
    });

    expect(progress.generatedWeeks).toBe(4);
    expect(progress.missingWeeks).toBe(0);
    expect(progress.nextWeekNum).toBeNull();
    expect(progress.percent).toBe(100);
  });

  test("validates known generation statuses", () => {
    expect(isPlanGenerationStatus("generating")).toBe(true);
    expect(isPlanGenerationStatus("stuck")).toBe(false);
  });

  test("marks the next job state after a week", () => {
    expect(getNextJobStatusAfterWeek({ nextWeekNum: 1, totalWeeks: 4 })).toBe("generating");
    expect(getNextJobStatusAfterWeek({ nextWeekNum: 4, totalWeeks: 4 })).toBe("ready");
  });
});
