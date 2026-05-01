import { describe, expect, test } from "vitest";
import { buildPlanGuidance, buildPlanSnapshot, buildPlanView } from "./plan-snapshot";
import type { WeekData } from "./plan-types";

const richWeek: WeekData = {
  weekNum: 1,
  theme: "Base Skill",
  summary: "Build repeatable movement quality before harder work.",
  progressionNote: "This week creates a baseline for later intensity.",
  days: [
    {
      dayNum: 1,
      dayName: "Monday",
      focus: "Climbing: Volume/Technique",
      isRest: false,
      coachNotes: "Keep this smooth and leave margin for the rest of the week.",
      sessions: [
        {
          name: "Warm-up",
          description: "Prepare shoulders, hips, and fingers.",
          duration: 10,
          objective: "Arrive warm without creating fatigue.",
          intensity: "RPE 3-4",
          exercises: [
            {
              name: "Easy Boulder Problems",
              sets: "1",
              reps: "5-8 problems",
              grade: "V0-V2",
              restBetweenReps: "30-60 sec",
              notes: "Move quietly",
            },
          ],
        },
        {
          name: "Main Session",
          description: "Moderate volume with technique constraints.",
          duration: 60,
          objective: "Accumulate quality climbing volume.",
          intensity: "75-85%",
          exercises: [
            {
              name: "TB2 Board Technique Hangs",
              sets: "4-5",
              work: "20-40 sec",
              restBetweenSets: "2-3 min",
              intensity: "moderate",
              holdType: "open hand",
              prescriptionDetails: "Use consistent holds before tiring.",
              modifications: "Shorten hangs if fingers feel tweaky.",
              notes: "Stay precise",
            },
          ],
        },
        {
          name: "Cooldown",
          description: "Downshift before leaving the gym.",
          duration: 8,
          cooldown: "Light shoulder mobility and easy walking.",
          exercises: [
            {
              name: "Shoulder Mobility",
              duration: "5 min",
              notes: "Stay relaxed",
            },
          ],
        },
      ],
    },
    { dayNum: 2, dayName: "Tuesday", focus: "Rest", isRest: true, sessions: [] },
    { dayNum: 3, dayName: "Wednesday", focus: "Rest", isRest: true, sessions: [] },
    { dayNum: 4, dayName: "Thursday", focus: "Rest", isRest: true, sessions: [] },
    { dayNum: 5, dayName: "Friday", focus: "Rest", isRest: true, sessions: [] },
    { dayNum: 6, dayName: "Saturday", focus: "Rest", isRest: true, sessions: [] },
    { dayNum: 7, dayName: "Sunday", focus: "Rest", isRest: true, sessions: [] },
  ],
};

describe("plan snapshot canonical rich shape", () => {
  test("builds rich week, day, session, and exercise fields with stable keys", () => {
    const snapshot = buildPlanSnapshot([richWeek]);

    expect(snapshot.planGuidance).toBeNull();
    expect(snapshot.weeks[0]).toMatchObject({
      key: "week-1",
      summary: "Build repeatable movement quality before harder work.",
      progressionNote: "This week creates a baseline for later intensity.",
    });
    expect(snapshot.weeks[0].days[0]).toMatchObject({
      key: "w1-d1",
      coachNotes: "Keep this smooth and leave margin for the rest of the week.",
    });
    expect(snapshot.weeks[0].days[0].sessions.map((session) => session.name)).toEqual([
      "Warm-up",
      "Main Session",
      "Cooldown",
    ]);
    expect(snapshot.weeks[0].days[0].sessions[1]).toMatchObject({
      key: "w1-d1-s2-main-session",
      objective: "Accumulate quality climbing volume.",
      intensity: "75-85%",
    });
    expect(snapshot.weeks[0].days[0].sessions[1].exercises[0]).toMatchObject({
      key: "w1-d1-s2-e1-tb2-board-technique-hangs",
      work: "20-40 sec",
      restBetweenSets: "2-3 min",
      holdType: "open hand",
      prescriptionDetails: "Use consistent holds before tiring.",
      modifications: "Shorten hangs if fingers feel tweaky.",
    });
  });

  test("preserves rich fields and logs in the plan view", () => {
    const snapshot = buildPlanSnapshot([richWeek]);
    const exerciseKey = "w1-d1-s2-e1-tb2-board-technique-hangs";
    const view = buildPlanView(snapshot, [
      {
        id: "log-1",
        exerciseKey,
        setsCompleted: 4,
        repsCompleted: null,
        weightUsed: null,
        durationActual: "30 sec",
        notes: "Felt controlled",
        completed: true,
      },
    ]);

    const exercise = view.weeks[0].days[0].sessions[1].exercises[0];
    expect(exercise.work).toBe("20-40 sec");
    expect(exercise.restBetweenSets).toBe("2-3 min");
    expect(exercise.logs).toHaveLength(1);
    expect(exercise.logs[0]).toMatchObject({
      id: "log-1",
      setsCompleted: 4,
      durationActual: "30 sec",
      completed: true,
    });
  });

  test("builds bounded plan-level guidance from profile and generated weeks", () => {
    const guidance = buildPlanGuidance({
      goals: ["Build endurance"],
      currentGrade: "V4",
      targetGrade: "V6",
      age: 34,
      weeksDuration: 8,
      daysPerWeek: 3,
      equipment: ["hangboard", "weights"],
      discipline: "bouldering",
      createdAt: "2026-05-01T00:00:00.000Z",
    }, [richWeek]);

    expect(guidance.overview).toContain("8-week");
    expect(guidance.intensityDistribution[0].label).toBe("Monday");
    expect(guidance.intensityDistribution[0].detail).toContain("Climbing");
    expect(guidance.recommendations.some((item) => item.includes("hangboard"))).toBe(true);
    expect(guidance.progressionTable[0]).toMatchObject({
      week: "1",
      theme: "Base Skill",
      trainingDays: "1",
    });
  });
});
