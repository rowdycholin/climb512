import { describe, expect, test } from "vitest";
import {
  buildNextWeekPrompt,
  dayNamesForPlanStart,
  summarizeGeneratedWeeks,
  validateGeneratedWeek,
  type PreviousWeekSummary,
} from "./ai-plan-generator";
import type { PlanRequest } from "./plan-request";
import type { WeekData } from "./plan-types";

const request: PlanRequest = {
  sport: "climbing",
  disciplines: ["bouldering"],
  goalType: "event",
  goalDescription: "Prepare for a local bouldering competition",
  targetDate: "2026-07-01",
  blockLengthWeeks: 8,
  daysPerWeek: 4,
  currentLevel: "V4",
  targetLevel: "V6",
  startDate: "2026-05-04",
  equipment: ["hangboard", "weights"],
  trainingFocus: ["power", "finger strength"],
  planStructureNotes: "Monday limit bouldering, Wednesday strength, Friday technique volume.",
  constraints: {
    injuries: ["mild elbow irritation"],
    limitations: [],
    avoidExercises: ["campus board"],
  },
  strengthTraining: {
    include: true,
    experienceLevel: "intermediate",
    focusAreas: ["pulling strength", "antagonists"],
  },
};

const validWeek: WeekData = {
  weekNum: 1,
  theme: "Baseline power",
  days: [
    {
      dayNum: 1,
      dayName: "Monday",
      focus: "Limit bouldering",
      isRest: false,
      sessions: [
        {
          name: "Limit boulders",
          description: "Controlled hard attempts.",
          duration: 60,
          exercises: [
            { name: "Limit problems", sets: "5", reps: "2", rest: "3 min", notes: "Stop before elbow pain" },
          ],
        },
      ],
    },
    { dayNum: 2, dayName: "Tuesday", focus: "Rest", isRest: true, sessions: [] },
    {
      dayNum: 3,
      dayName: "Wednesday",
      focus: "Strength",
      isRest: false,
      sessions: [
        {
          name: "Pull strength",
          description: "Moderate strength support.",
          duration: 45,
          exercises: [
            { name: "Weighted pull-ups", sets: "4", reps: "4", rest: "2 min", notes: "Smooth reps only" },
          ],
        },
      ],
    },
    { dayNum: 4, dayName: "Thursday", focus: "Rest", isRest: true, sessions: [] },
    {
      dayNum: 5,
      dayName: "Friday",
      focus: "Technique",
      isRest: false,
      sessions: [
        {
          name: "Movement drills",
          description: "Easy volume with skill focus.",
          duration: 50,
          exercises: [
            { name: "Silent feet", duration: "15 min", notes: "Move precisely" },
          ],
        },
      ],
    },
    { dayNum: 6, dayName: "Saturday", focus: "Rest", isRest: true, sessions: [] },
    { dayNum: 7, dayName: "Sunday", focus: "Rest", isRest: true, sessions: [] },
  ],
};

describe("ai plan generator sequential core", () => {
  test("summarizes prior weeks for sequential prompt context", () => {
    const summaries = summarizeGeneratedWeeks([validWeek]);

    expect(summaries).toEqual<PreviousWeekSummary[]>([
      {
        weekNum: 1,
        theme: "Baseline power",
        trainingDays: 3,
        restDays: 4,
        totalSessions: 3,
        totalExercises: 3,
        focusAreas: ["Limit bouldering", "Rest", "Strength", "Technique"],
        keyExercises: ["Limit problems", "Weighted pull-ups", "Silent feet"],
      },
    ]);
  });

  test("builds a next-week prompt with previous summaries and repair feedback", () => {
    const previousWeekSummaries = summarizeGeneratedWeeks([validWeek]);
    const prompt = buildNextWeekPrompt({
      request,
      athleteAge: 34,
      weekNum: 2,
      totalWeeks: 8,
      previousWeekSummaries,
      repairFeedback: "Reduce elbow stress and avoid extra pulling volume.",
    });

    expect(prompt).toContain("Week 2 of 8");
    expect(prompt).toContain("PREVIOUS_WEEK_SUMMARIES_JSON");
    expect(prompt).toContain("\"weekNum\":1");
    expect(prompt).toContain("Progress volume, intensity, exercise difficulty, or specificity gradually.");
    expect(prompt).toContain("Athlete requested structure");
    expect(prompt).toContain("Wednesday strength");
    expect(prompt).toContain("Reduce elbow stress");
    expect(prompt).toContain("mild elbow irritation");
    expect(prompt).toContain("campus board");
  });

  test("rotates generated day labels from the requested start date", () => {
    const sundayStartRequest = { ...request, startDate: "2026-05-03" };
    const expectedDayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const sundayWeek: WeekData = {
      ...validWeek,
      days: validWeek.days.map((day, index) => ({ ...day, dayName: expectedDayNames[index] })),
    };

    const prompt = buildNextWeekPrompt({
      request: sundayStartRequest,
      athleteAge: 68,
      weekNum: 1,
      totalWeeks: 4,
      previousWeekSummaries: [],
    });

    expect(dayNamesForPlanStart("2026-05-03")).toEqual(expectedDayNames);
    expect(prompt).toContain('"dayNum":1,"dayName":"Sunday"');
    expect(prompt).toContain("dayNum 1 = Sunday");
    expect(validateGeneratedWeek(sundayWeek, 1, expectedDayNames)).toBe(sundayWeek);
  });

  test("prompts for level-based RPE and model-decided deloads", () => {
    const prompt = buildNextWeekPrompt({
      request: {
        ...request,
        currentLevel: "V10",
        targetLevel: "V12",
        blockLengthWeeks: 4,
      },
      athleteAge: 68,
      weekNum: 4,
      totalWeeks: 4,
      previousWeekSummaries: summarizeGeneratedWeeks([validWeek]),
    });

    expect(prompt).toContain("productive main work should generally live around RPE 8-10");
    expect(prompt).toContain("Do not automatically make the final week a deload in a short block");
    expect(prompt).not.toContain("This is a deload or consolidation week unless");
  });

  test("validates a well-formed generated week", () => {
    expect(validateGeneratedWeek(validWeek, 1)).toBe(validWeek);
  });

  test("allows warm-up, main session, and cooldown sections on a training day", () => {
    const multiSessionWeek: WeekData = {
      ...validWeek,
      days: validWeek.days.map((day) => day.dayNum === 1
        ? {
            ...day,
            sessions: [
              {
                name: "Warm-up",
                description: "Prepare for climbing.",
                duration: 10,
                exercises: [{ name: "Easy traversing", duration: "5 min", notes: "Stay easy" }],
              },
              ...day.sessions,
              {
                name: "Cooldown",
                description: "Downshift after climbing.",
                duration: 8,
                exercises: [{ name: "Shoulder mobility", duration: "5 min", notes: "Relax" }],
              },
            ],
          }
        : day),
    };

    expect(validateGeneratedWeek(multiSessionWeek, 1)).toBe(multiSessionWeek);
  });

  test("allows more than three sessions when the generated sport structure needs it", () => {
    const fourSessionWeek: WeekData = {
      ...validWeek,
      days: validWeek.days.map((day) => day.dayNum === 1
        ? {
            ...day,
            sessions: [
              ...day.sessions,
              {
                name: "Skill Block",
                description: "Practice specific movement.",
                duration: 20,
                exercises: [{ name: "Technique practice", duration: "15 min", notes: "Stay precise" }],
              },
              {
                name: "Cooldown",
                description: "Downshift after training.",
                duration: 8,
                exercises: [{ name: "Easy mobility", duration: "5 min", notes: "Relax" }],
              },
              {
                name: "Notes",
                description: "Record key observations.",
                duration: 5,
                exercises: [{ name: "Session notes", duration: "5 min", notes: "Capture learnings" }],
              },
            ],
          }
        : day),
    };

    expect(validateGeneratedWeek(fourSessionWeek, 1)).toBe(fourSessionWeek);
  });

  test("rejects malformed generated weeks before saving", () => {
    const invalidWeek: WeekData = {
      ...validWeek,
      weekNum: 2,
      days: validWeek.days.slice(0, 6),
    };

    expect(() => validateGeneratedWeek(invalidWeek, 1)).toThrow(/weekNum must be 1/);
    expect(() => validateGeneratedWeek(invalidWeek, 1)).toThrow(/exactly 7 days/);
  });
});
