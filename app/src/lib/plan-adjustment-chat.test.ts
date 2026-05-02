import { describe, expect, test } from "vitest";
import {
  adjustmentChatModelResponseSchema,
  appendAdjustmentChatMessage,
  buildAdjustmentChatContext,
  buildAdjustmentChatSystemPrompt,
  buildAdjustmentChatUserPrompt,
  createAdjustmentChatState,
  summarizeRichSnapshotChanges,
  validateAdjustmentChatProposal,
  type AdjustmentChatProposal,
} from "./plan-adjustment-chat";
import type { PlanSnapshot, ProfileSnapshot } from "./plan-snapshot";
import type { WorkoutLogDayMarker } from "./plan-adjustment-request";

const profileSnapshot: ProfileSnapshot = {
  goals: ["Send V6 boulders"],
  currentGrade: "V4",
  targetGrade: "V6",
  age: 32,
  weeksDuration: 2,
  daysPerWeek: 3,
  equipment: ["climbing gym", "hangboard"],
  discipline: "bouldering",
  createdAt: "2026-04-29T12:00:00.000Z",
  planRequest: {
    sport: "climbing",
    disciplines: ["bouldering"],
    goalType: "ongoing",
    goalDescription: "Send V6 boulders with better movement quality.",
    targetDate: null,
    blockLengthWeeks: 2,
    daysPerWeek: 3,
    currentLevel: "V4",
    targetLevel: "V6",
    startDate: "2026-05-04",
    equipment: ["climbing gym", "hangboard"],
    trainingFocus: ["movement quality"],
    constraints: {
      injuries: [],
      limitations: [],
      avoidExercises: [],
    },
    strengthTraining: {
      include: false,
      focusAreas: [],
    },
  },
};

const planSnapshot: PlanSnapshot = {
  planGuidance: {
    overview: "Three climbing days with finger-load management.",
    intensityDistribution: [{ label: "Wednesday", detail: "Highest intensity board work" }],
    progressionPrinciples: ["Add difficulty only when attempts stay high quality."],
    recoveryPrinciples: ["Keep rest days genuinely easy."],
    recommendations: ["Use the board for consistent limit problems."],
    progressionTable: [{ week: "1", focus: "Base" }],
  },
  weeks: [1, 2].map((weekNum) => ({
    key: `week-${weekNum}`,
    weekNum,
    theme: weekNum === 1 ? "Base" : "Build",
    summary: weekNum === 1 ? "Establish rhythm and movement quality." : "Increase board specificity.",
    progressionNote: weekNum === 1 ? "Start below max effort." : "Build from week 1 volume.",
    days: Array.from({ length: 7 }, (_, index) => {
      const dayNum = index + 1;
      const isTraining = [1, 3, 5].includes(dayNum);

      return {
        key: `w${weekNum}-d${dayNum}`,
        dayNum,
        dayName: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][index],
        focus: isTraining ? "Project Climbing" : "Rest",
        isRest: !isTraining,
        coachNotes: isTraining ? "Keep attempts crisp and stop before form degrades." : null,
        sessions: isTraining
          ? [
              {
                key: `w${weekNum}-d${dayNum}-s1`,
                name: "Climbing Session",
                description: "Quality climbing",
                duration: 60,
                objective: "Practice high-quality attempts.",
                intensity: "RPE 7",
                warmup: "Easy movement and mobility.",
                cooldown: "Forearm and shoulder mobility.",
                exercises: [
                  {
                    key: `w${weekNum}-d${dayNum}-s1-e1`,
                    name: "Quality attempts",
                    sets: "4",
                    reps: "3 attempts",
                    duration: null,
                    rest: "2 min",
                    notes: null,
                    work: "3 attempts",
                    restBetweenSets: "2 min",
                    intensity: "RPE 7",
                    grade: "V3-V4",
                    modifications: "Drop one grade if fingers feel tired.",
                  },
                ],
              },
            ]
          : [],
      };
    }),
  })),
};

function cloneSnapshot(snapshot: PlanSnapshot): PlanSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as PlanSnapshot;
}

function validProposal(overrides: Partial<AdjustmentChatProposal> = {}): AdjustmentChatProposal {
  const revisedPlanSnapshot = cloneSnapshot(planSnapshot);
  revisedPlanSnapshot.weeks[0].days[1].focus = "Mobility and easy technique";
  revisedPlanSnapshot.weeks[0].days[1].isRest = false;
  revisedPlanSnapshot.weeks[0].days[1].sessions = [
    {
      key: "w1-d2-s1-added-mobility",
      name: "Mobility Session",
      description: "Light shoulder and finger-friendly mobility",
      duration: 25,
      exercises: [
        {
          key: "w1-d2-s1-e1-added-shoulder-cars",
          name: "Shoulder CARs",
          sets: "2",
          reps: "5 each direction",
          duration: null,
          rest: "easy",
          notes: null,
        },
      ],
    },
  ];

  return {
    summary: "Add a low-stress mobility day while keeping the V6 goal.",
    changes: ["Add mobility on week 1 day 2"],
    changedWeeks: [1],
    changedDays: [
      {
        weekNum: 1,
        dayNum: 2,
        planDay: 2,
        summary: "Add mobility and easy technique.",
      },
    ],
    effectiveFromPlanDay: 2,
    preservesOriginalGoal: true,
    requiresGoalChangeConfirmation: false,
    revisedPlanSnapshot,
    ...overrides,
  };
}

describe("adjustment chat contract", () => {
  test("keeps active message history", () => {
    const state = createAdjustmentChatState();
    const next = appendAdjustmentChatMessage(state, {
      role: "user",
      content: "Move the harder day away from Wednesday.",
    });

    expect(next.messages).toEqual([
      {
        role: "user",
        content: "Move the harder day away from Wednesday.",
      },
    ]);
  });

  test("builds context with original goals, locked history, logs, and adjustable future days", () => {
    const logs: WorkoutLogDayMarker[] = [
      {
        weekNum: 1,
        dayNum: 1,
        sessionKey: "w1-d1-s1",
        exerciseKey: "w1-d1-s1-e1",
        exerciseName: "Quality attempts",
        completed: true,
      },
    ];

    const context = buildAdjustmentChatContext({
      planId: "plan-1",
      planStartDate: new Date(2026, 4, 4),
      currentDate: new Date(2026, 4, 5, 12),
      currentVersion: {
        id: "version-1",
        versionNum: 2,
        profileSnapshot,
        planSnapshot,
      },
      logs,
    });

    expect(context.originalPlanGoals).toMatchObject({
      sport: "climbing",
      goalDescription: "Send V6 boulders with better movement quality.",
      targetLevel: "V6",
      blockLengthWeeks: 2,
    });
    expect(context.effectiveFrom?.planDay).toBe(2);
    expect(context.lockedHistory.throughPlanDay).toBe(1);
    expect(context.lockedHistory.loggedExercises).toHaveLength(1);
    expect(context.planGuidance?.overview).toContain("finger-load management");
    expect(context.adjustableFuture[0]).toMatchObject({
      weekNum: 1,
      dayNum: 2,
      planDay: 2,
    });
    expect(context.adjustableFuture.find((day) => day.planDay === 3)?.sessions[0].exercises[0]).toMatchObject({
      name: "Quality attempts",
      work: "3 attempts",
      restBetweenSets: "2 min",
      grade: "V3-V4",
      modifications: "Drop one grade if fingers feel tired.",
    });
    expect(context.adjustableFuture.some((day) => day.planDay === 1)).toBe(false);
  });

  test("prompts preserve original goals and require one follow-up or a proposal", () => {
    const state = createAdjustmentChatState([
      {
        role: "user",
        content: "My fingers are tired. Make the rest safer.",
      },
    ]);
    const context = buildAdjustmentChatContext({
      planId: "plan-1",
      planStartDate: new Date(2026, 4, 4),
      currentDate: new Date(2026, 4, 4, 12),
      currentVersion: {
        id: "version-1",
        versionNum: 1,
        profileSnapshot,
        planSnapshot,
      },
      logs: [],
    });

    const systemPrompt = buildAdjustmentChatSystemPrompt();
    const userPrompt = buildAdjustmentChatUserPrompt({ context, state });

    expect(systemPrompt).toContain("Default to preserving the original plan goal");
    expect(systemPrompt).toContain("Preserve planGuidance and rich coaching fields");
    expect(systemPrompt).toContain("Ask at most one follow-up question at a time");
    expect(userPrompt).toContain("ADJUSTMENT_CONTEXT_JSON");
    expect(userPrompt).toContain("MESSAGE_HISTORY_JSON");
    expect(userPrompt).toContain("FOLLOW_UP SHAPE");
    expect(userPrompt).toContain("PROPOSAL SHAPE");
    expect(userPrompt).toContain("structured exercise prescriptions");
  });

  test("summarizes rich guidance, coaching, and prescription changes for previews", () => {
    const adjusted = cloneSnapshot(planSnapshot);
    adjusted.planGuidance!.recoveryPrinciples = ["Add an extra low-stress recovery day when fingers feel tired."];
    adjusted.weeks[0].days[2].coachNotes = "Keep Wednesday submaximal this week.";
    adjusted.weeks[0].days[2].sessions[0].intensity = "RPE 6";
    adjusted.weeks[0].days[2].sessions[0].exercises[0].restBetweenSets = "3 min";

    expect(
      summarizeRichSnapshotChanges({
        original: planSnapshot,
        adjusted,
        effectiveFromPlanDay: 2,
      }),
    ).toMatchObject({
      planGuidance: expect.arrayContaining(["Plan guidance recoveryPrinciples changed"]),
      coaching: expect.arrayContaining([
        "Week 1, Wednesday coach notes: Keep attempts crisp and stop before form degrades. -> Keep Wednesday submaximal this week.",
        "Week 1, Wednesday Climbing Session intensity: RPE 7 -> RPE 6",
      ]),
      prescriptions: expect.arrayContaining([
        "Week 1, Wednesday Quality attempts restBetweenSets: 2 min -> 3 min",
      ]),
    });
  });

  test("accepts either one follow-up response or a structured proposal", () => {
    expect(
      adjustmentChatModelResponseSchema.parse({
        responseType: "follow_up",
        assistantMessage: "I can adjust that conservatively.",
        question: "Do you want to avoid hangboard work entirely?",
      }),
    ).toMatchObject({ responseType: "follow_up" });

    expect(
      adjustmentChatModelResponseSchema.parse({
        responseType: "proposal",
        assistantMessage: "I can apply this from the next unlogged day.",
        proposal: validProposal({
          summary: "Reduce finger load and keep the V6 goal.",
          changes: ["Replace max hangs with easier repeaters"],
        }),
      }),
    ).toMatchObject({ responseType: "proposal" });
  });

  test("validates a future-only proposal with declared changed days", () => {
    const result = validateAdjustmentChatProposal({
      originalSnapshot: planSnapshot,
      proposal: validProposal(),
      effectiveFromPlanDay: 2,
    });

    expect(result).toEqual({
      ok: true,
      rejectedReasons: [],
    });
  });

  test("rejects proposals that change locked history", () => {
    const proposal = validProposal();
    proposal.revisedPlanSnapshot.weeks[0].days[0].focus = "Changed locked day";

    const result = validateAdjustmentChatProposal({
      originalSnapshot: planSnapshot,
      proposal,
      effectiveFromPlanDay: 2,
    });

    expect(result.ok).toBe(false);
    expect(result.rejectedReasons).toContain("Adjusted plan changed locked day week 1 day 1");
  });

  test("rejects proposals that move existing future identifiers", () => {
    const proposal = validProposal();
    const dayThreeSession = proposal.revisedPlanSnapshot.weeks[0].days[2].sessions[0];
    proposal.revisedPlanSnapshot.weeks[0].days[1].sessions.push(dayThreeSession);
    proposal.revisedPlanSnapshot.weeks[0].days[2].sessions = [];
    proposal.changedDays.push({
      weekNum: 1,
      dayNum: 3,
      planDay: 3,
      summary: "Move the climbing session.",
    });

    const result = validateAdjustmentChatProposal({
      originalSnapshot: planSnapshot,
      proposal,
      effectiveFromPlanDay: 2,
    });

    expect(result.ok).toBe(false);
    expect(result.rejectedReasons).toContain("Adjusted plan moved existing session key w1-d3-s1");
  });

  test("rejects undeclared changed future days", () => {
    const proposal = validProposal({
      changedDays: [
        {
          weekNum: 1,
          dayNum: 2,
          planDay: 2,
          summary: "Add mobility and easy technique.",
        },
      ],
    });
    proposal.revisedPlanSnapshot.weeks[0].days[2].focus = "Undeclared change";

    const result = validateAdjustmentChatProposal({
      originalSnapshot: planSnapshot,
      proposal,
      effectiveFromPlanDay: 2,
    });

    expect(result.ok).toBe(false);
    expect(result.rejectedReasons).toContain("Adjusted plan changed week 1 day 3 without declaring it");
  });

  test("rejects goal changes unless the user explicitly requested one", () => {
    const proposal = validProposal({
      preservesOriginalGoal: false,
      requiresGoalChangeConfirmation: true,
      goalChange: {
        requestedByUser: false,
        summary: "Switch from bouldering performance to general fitness.",
        revisedGoals: {
          goalDescription: "General fitness",
        },
      },
    });

    expect(
      validateAdjustmentChatProposal({
        originalSnapshot: planSnapshot,
        proposal,
        effectiveFromPlanDay: 2,
      }),
    ).toMatchObject({
      ok: false,
      rejectedReasons: expect.arrayContaining([
        "Adjustment proposal changes the original plan goal without an explicit user request",
      ]),
    });

    proposal.goalChange = {
      requestedByUser: true,
      summary: "Switch from bouldering performance to general fitness.",
      revisedGoals: {
        goalDescription: "General fitness",
      },
    };

    expect(
      validateAdjustmentChatProposal({
        originalSnapshot: planSnapshot,
        proposal,
        effectiveFromPlanDay: 2,
        userExplicitlyRequestedGoalChange: true,
      }),
    ).toMatchObject({
      ok: true,
      rejectedReasons: [],
    });
  });
});
