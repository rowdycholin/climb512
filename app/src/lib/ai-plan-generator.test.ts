import { describe, expect, test } from "vitest";
import {
  buildNextWeekPrompt,
  buildFallbackPlanStrategy,
  CLIMBING_GRIP_SAFETY_RULES,
  dayNamesForPlanStart,
  normalizeGeneratedWeek,
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
            { name: "Project attempts", sets: "4", reps: "1", rest: "4 min", notes: "Quality only" },
            { name: "Movement review", duration: "8 min", notes: "Find one cue" },
            { name: "Easy mileage", duration: "10 min", notes: "Flush forearms" },
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
            { name: "Ring rows", sets: "3", reps: "8", notes: "Control tempo" },
            { name: "Dead bugs", sets: "3", reps: "8", notes: "Brace quietly" },
            { name: "Band external rotations", sets: "2", reps: "12", notes: "Easy shoulders" },
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
            { name: "Hover hands", duration: "10 min", notes: "Commit feet" },
            { name: "Downclimb practice", duration: "10 min", notes: "Stay smooth" },
            { name: "Easy mileage", duration: "10 min", notes: "Low pump" },
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
        summary: null,
        progressionNote: null,
        coachRationale: null,
        trainingDays: 3,
        restDays: 4,
        totalSessions: 3,
        totalExercises: 12,
        totalDurationMinutes: 155,
        trainingDayPattern: [
          "Monday: Limit bouldering",
          "Tuesday: Rest",
          "Wednesday: Strength",
          "Thursday: Rest",
          "Friday: Technique",
          "Saturday: Rest",
          "Sunday: Rest",
        ],
        focusAreas: ["Limit bouldering", "Rest", "Strength", "Technique"],
        sessionTypes: ["Limit boulders", "Pull strength", "Movement drills"],
        intensityTargets: [],
        keyExercises: [
          "Limit problems",
          "Project attempts",
          "Movement review",
          "Easy mileage",
          "Weighted pull-ups",
          "Ring rows",
          "Dead bugs",
          "Band external rotations",
          "Silent feet",
          "Hover hands",
        ],
        keyAdaptations: [],
        watchouts: [],
      },
    ]);
  });

  test("builds a next-week prompt with previous summaries and repair feedback", () => {
    const previousWeekSummaries = summarizeGeneratedWeeks([validWeek]);
    const planStrategy = buildFallbackPlanStrategy(request, 34);
    const prompt = buildNextWeekPrompt({
      request,
      athleteAge: 34,
      weekNum: 2,
      totalWeeks: 8,
      previousWeekSummaries,
      planStrategy,
      repairFeedback: "Reduce elbow stress and avoid extra pulling volume.",
    });

    expect(prompt).toContain("Week 2 of 8");
    expect(prompt).toContain("PREVIOUS_WEEK_SUMMARIES_JSON");
    expect(prompt).toContain("PLAN_STRATEGY_JSON");
    expect(prompt).toContain("Use PLAN_STRATEGY_JSON to keep this week aligned");
    expect(prompt).toContain("Treat totalDurationMinutes, trainingDayPattern, intensityTargets");
    expect(prompt).toContain("Explain what changed from the immediately previous week");
    expect(prompt).toContain("\"weekNum\":1");
    expect(prompt).toContain("34-year-old athlete");
    expect(prompt).toContain("Progress volume, intensity, exercise difficulty, or specificity gradually.");
    expect(prompt).toContain("Athlete requested structure");
    expect(prompt).toContain("Wednesday strength");
    expect(prompt).toContain("Reduce elbow stress");
    expect(prompt).toContain("mild elbow irritation");
    expect(prompt).toContain("campus board");
    expect(prompt).toContain("coachRationale");
    expect(prompt).toContain("readinessGuidance");
    expect(prompt).toContain("modificationGuidance");
    expect(prompt).toContain("Rich coaching fields may be 1-4 concise sentences");
    expect(prompt).not.toContain("All string values must be SHORT");
  });

  test("builds route-grade climbing prompts without bouldering or hangboard confusion", () => {
    const routeRequest: PlanRequest = {
      ...request,
      disciplines: ["sport"],
      goalDescription: "Lead 5.11a",
      currentLevel: "5.10a",
      targetLevel: "5.11a",
      equipment: ["indoor gym", "lead wall", "top rope", "bouldering wall", "Kilter Board"],
      trainingFocus: ["strength"],
      planStructureNotes: "Climb Monday, Wednesday, Friday. Strength and cardio Tuesday and Saturday.",
      constraints: { injuries: [], limitations: [], avoidExercises: [] },
    };

    const prompt = buildNextWeekPrompt({
      request: routeRequest,
      athleteAge: 68,
      weekNum: 1,
      totalWeeks: 4,
      previousWeekSummaries: [],
      planStrategy: buildFallbackPlanStrategy(routeRequest, 68),
    });

    expect(prompt).toContain("YDS grades like 5.10a and 5.11a are roped route grades");
    expect(prompt).toContain("Do not write \"5.11a boulder problem\"");
    expect(prompt).toContain("Kilter Board, MoonBoard, Tension Board");
    expect(prompt).toContain("Do not prescribe hangs on those boards");
    expect(prompt).toContain("Hangs, repeaters, max hangs, and half-crimp hangs require hangboard or fingerboard equipment explicitly listed");
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

  test("builds a fallback full-block strategy from the request", () => {
    const strategy = buildFallbackPlanStrategy(request, 34);

    expect(strategy.athleteSummary).toContain("34-year-old");
    expect(strategy.goalInterpretation).toContain("8-week");
    expect(strategy.phaseStructure[0]).toMatchObject({
      phase: "Build",
      weeks: "Weeks 1-8",
    });
    expect(strategy.riskFactors).toContain("mild elbow irritation");
    expect(strategy.riskFactors).toContain("Avoid campus board");
    expect(strategy.recoveryStrategy).toContain("rest days");
  });

  test("climbing generation prompts forbid full-crimp hangboard work", () => {
    const prompt = buildNextWeekPrompt({
      request,
      athleteAge: 34,
      weekNum: 1,
      totalWeeks: 8,
      previousWeekSummaries: [],
    });

    expect(CLIMBING_GRIP_SAFETY_RULES).toContain("Never prescribe or suggest full-crimp");
    expect(prompt).toContain(CLIMBING_GRIP_SAFETY_RULES);
    expect(prompt).toContain("half crimp, open hand, and sloper");
  });

  test("validates a well-formed generated week", () => {
    expect(validateGeneratedWeek(validWeek, 1)).toBe(validWeek);
  });

  test("allows focused sessions with fewer than the preferred exercise count", () => {
    const focusedWeek: WeekData = {
      ...validWeek,
      days: validWeek.days.map((day) => day.dayNum === 1
        ? {
            ...day,
            sessions: [
              {
                name: "Main Session",
                description: "Focused limit bouldering.",
                duration: 45,
                exercises: [
                  { name: "Limit bouldering", sets: "6", reps: "1 attempt", notes: "Full rest" },
                  { name: "Weighted pull-ups", sets: "3", reps: "3", notes: "Heavy and crisp" },
                ],
              },
            ],
          }
        : day),
    };

    expect(validateGeneratedWeek(focusedWeek, 1)).toBe(focusedWeek);
  });

  test("rejects route grades used as bouldering grades and hangs on board walls", () => {
    const badWeek: WeekData = {
      ...validWeek,
      days: validWeek.days.map((day) => day.dayNum === 1
        ? {
            ...day,
            sessions: [
              {
                ...day.sessions[0],
                exercises: [
                  {
                    name: "Early 5.11a Boulder Problem Attempts",
                    sets: "3",
                    reps: "2 attempts",
                    grade: "5.11a",
                    notes: "Try hard moves",
                  },
                  {
                    name: "Kilter Board Half-Crimp Hangs",
                    sets: "3",
                    reps: "5",
                    work: "5 sec hold",
                    notes: "Half crimp only",
                  },
                  { name: "Easy mileage", duration: "10 min", notes: "Recover" },
                  { name: "Movement review", duration: "8 min", notes: "Learn" },
                ],
              },
            ],
          }
        : day),
    };

    expect(() => validateGeneratedWeek(badWeek, 1)).toThrow(/route grade for bouldering|hangs on a board/);
  });

  test("allows board support work to mention a route-grade lead goal in coaching prose", () => {
    const supportWeek: WeekData = {
      ...validWeek,
      days: validWeek.days.map((day) => day.dayNum === 1
        ? {
            ...day,
            sessions: [
              {
                ...day.sessions[0],
                exercises: [
                  {
                    name: "Kilter Board Power-Endurance Intervals",
                    sets: "3",
                    reps: "4 problems",
                    grade: "moderate",
                    purpose: "Support 5.11a lead fitness without treating 5.11a as a boulder grade.",
                  },
                  { name: "Easy route laps", sets: "3", reps: "2", notes: "Stay smooth" },
                  { name: "Rest practice", duration: "8 min", notes: "Shake out" },
                  { name: "Footwork review", duration: "10 min", notes: "Quiet feet" },
                ],
              },
            ],
          }
        : day),
    };

    expect(validateGeneratedWeek(supportWeek, 1)).toBe(supportWeek);
  });

  test("normalizes rich coaching prose without weakening prescription validation", () => {
    const normalized = normalizeGeneratedWeek({
      weekNum: 1,
      theme: "Base",
      summary: "## Summary\nBuild capacity with crisp work.",
      progressionNote: "**Progress** gradually before adding intensity.",
      coachRationale: "This week builds a base because the athlete has elbow irritation and needs repeatable quality before harder sessions.",
      keyAdaptations: ["Movement quality", "Movement quality", "Aerobic base", "Power endurance", "Finger capacity", "Extra item"],
      watchouts: "Finger pain; rushing warmups",
      days: [
        {
          dayNum: 1,
          focus: "Technique",
          isRest: false,
          coachNotes: "```Keep effort smooth and stop if elbow pain rises.```",
          readinessGuidance: "If energy is low, reduce hard attempts and keep movement easy.",
          fallbackOption: "Use easy terrain if board climbing feels tweaky.",
          sessions: [
            {
              name: "Main",
              description: "Practice movement.",
              duration: "45",
              coachingFocus: "Quiet feet and relaxed hands.",
              modificationGuidance: "Cut one set if form fades.",
              exercises: [
                {
                  name: "Silent feet",
                  duration: "15 min",
                  notes: "Move quietly",
                  purpose: "Rehearse precise foot placements under low fatigue.",
                  cues: ["Quiet feet", "Soft grip", "Quiet feet"],
                  modifications: "Use easier climbs if accuracy drops.",
                },
                { name: "Hover hands", duration: "10 min", notes: "Trust feet" },
                { name: "Downclimb practice", duration: "10 min", notes: "Stay smooth" },
                { name: "Easy mileage", duration: "10 min", notes: "Low pump" },
              ],
            },
          ],
        },
      ],
    }, 1);

    expect(normalized.summary).toBe("Summary Build capacity with crisp work.");
    expect(normalized.progressionNote).toBe("Progress gradually before adding intensity.");
    expect(normalized.coachRationale).toContain("elbow irritation");
    expect(normalized.keyAdaptations).toEqual(["Movement quality", "Aerobic base", "Power endurance", "Finger capacity", "Extra item"]);
    expect(normalized.watchouts).toEqual(["Finger pain", "rushing warmups"]);
    expect(normalized.days[0].coachNotes).toBe("Keep effort smooth and stop if elbow pain rises.");
    expect(normalized.days[0].readinessGuidance).toContain("reduce hard attempts");
    expect(normalized.days[0].sessions[0].coachingFocus).toBe("Quiet feet and relaxed hands.");
    expect(normalized.days[0].sessions[0].exercises[0].purpose).toContain("foot placements");
    expect(normalized.days[0].sessions[0].exercises[0].cues).toEqual(["Quiet feet", "Soft grip"]);
    expect(validateGeneratedWeek(normalized, 1)).toBe(normalized);
  });

  test("strips unsafe medical prose while preserving usable prescription data", () => {
    const normalized = normalizeGeneratedWeek({
      weekNum: 1,
      theme: "Base",
      days: [
        {
          dayNum: 1,
          focus: "Strength",
          isRest: false,
          readinessGuidance: "This diagnosis requires medical treatment.",
          sessions: [
            {
              name: "Main",
              description: "Strength support.",
              duration: 45,
              modificationGuidance: "Prescribe medication before doing this.",
              exercises: [
                {
                  name: "Bodyweight rows",
                  sets: "3",
                  reps: "8",
                  notes: "Smooth reps",
                  purpose: "Diagnosed elbow issue treatment plan.",
                },
                { name: "Split squats", sets: "3", reps: "8", notes: "Controlled" },
                { name: "Dead bugs", sets: "3", reps: "8", notes: "Brace" },
                { name: "Band pull-aparts", sets: "2", reps: "12", notes: "Easy" },
              ],
            },
          ],
        },
      ],
    }, 1);

    expect(normalized.days[0].readinessGuidance).toBeUndefined();
    expect(normalized.days[0].sessions[0].modificationGuidance).toBeUndefined();
    expect(normalized.days[0].sessions[0].exercises[0].purpose).toBeUndefined();
    expect(normalized.days[0].sessions[0].exercises[0]).toMatchObject({
      name: "Bodyweight rows",
      sets: "3",
      reps: "8",
    });
    expect(validateGeneratedWeek(normalized, 1)).toBe(normalized);
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
                exercises: [
                  { name: "Easy traversing", duration: "5 min", notes: "Stay easy" },
                  { name: "Shoulder activation", duration: "3 min", notes: "Wake up" },
                ],
              },
              ...day.sessions,
              {
                name: "Cooldown",
                description: "Downshift after climbing.",
                duration: 8,
                exercises: [
                  { name: "Shoulder mobility", duration: "5 min", notes: "Relax" },
                  { name: "Forearm flush", duration: "3 min", notes: "Easy" },
                ],
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
                exercises: [
                  { name: "Technique practice", duration: "15 min", notes: "Stay precise" },
                  { name: "Footwork drill", duration: "10 min", notes: "Quiet" },
                  { name: "Flagging drill", duration: "8 min", notes: "Balanced" },
                  { name: "Movement review", duration: "5 min", notes: "Learn" },
                ],
              },
              {
                name: "Cooldown",
                description: "Downshift after training.",
                duration: 8,
                exercises: [
                  { name: "Easy mobility", duration: "5 min", notes: "Relax" },
                  { name: "Breathing reset", duration: "3 min", notes: "Downshift" },
                ],
              },
              {
                name: "Notes",
                description: "Record key observations.",
                duration: 5,
                exercises: [
                  { name: "Session notes", duration: "5 min", notes: "Capture learnings" },
                  { name: "Readiness rating", duration: "2 min", notes: "Score energy" },
                  { name: "Next cue", duration: "2 min", notes: "Pick one" },
                  { name: "Recovery note", duration: "2 min", notes: "Plan sleep" },
                ],
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
