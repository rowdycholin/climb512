import { describe, expect, test } from "vitest";
import { continueIntakeDraft, createInitialIntakeDraft } from "./intake";

function answer(draft: ReturnType<typeof createInitialIntakeDraft>, userMessage: string) {
  return continueIntakeDraft({ draft, userMessage }).draft;
}

describe("intake progression", () => {
  test("uses the climbing template after a climbing sport answer", () => {
    const response = continueIntakeDraft({
      draft: createInitialIntakeDraft(),
      userMessage: "Climbing",
    });

    expect(response.draft.intakeTemplateId).toBe("climbing_strength");
    expect(response.assistantMessage).toBe("Climbing it is. What climbing goal should this plan move you toward: a route or boulder, a trip or competition, a grade, a skill, or general climbing fitness?");
  });

  test("uses the running template after a running sport answer", () => {
    const response = continueIntakeDraft({
      draft: createInitialIntakeDraft(),
      userMessage: "Running",
    });

    expect(response.draft.intakeTemplateId).toBe("running");
    expect(response.assistantMessage).toBe("Running it is. What running goal should this plan build toward: a race or distance, faster times, more weekly mileage, consistency, or general fitness?");
  });

  test("uses the strength template after a strength sport answer", () => {
    const response = continueIntakeDraft({
      draft: createInitialIntakeDraft(),
      userMessage: "Weight training",
    });

    expect(response.draft.intakeTemplateId).toBe("strength_training");
    expect(response.assistantMessage).toBe("Strength and conditioning it is. What goal should this plan build toward: strength, muscle, conditioning, movement quality, testing numbers, or sport support?");
  });

  test("falls back to generic progression for unknown sports", () => {
    const response = continueIntakeDraft({
      draft: createInitialIntakeDraft(),
      userMessage: "Kayaking",
    });

    expect(response.draft.intakeTemplateId).toBe("generic_training");
    expect(response.assistantMessage).toBe("Good, let's give the plan a clear goal. Are you training for an event, building general fitness, improving a skill, or working toward a specific target?");
  });

  test("progresses through required running fields without calling external services", () => {
    let draft = answer(createInitialIntakeDraft(), "Running");

    draft = answer(draft, "Build endurance.");
    expect(draft.goalDescription).toBe("Build endurance.");
    expect(draft.intakeStep).toBe("blockLength");

    draft = answer(draft, "8 weeks.");
    expect(draft.blockLengthWeeks).toBe(8);
    expect(draft.intakeStep).toBe("equipment");

    draft = answer(draft, "road shoes, treadmill");
    expect(draft.equipment).toEqual(["road shoes", "treadmill"]);
    expect(draft.intakeStep).toBe("strength");

    draft = answer(draft, "No.");
    expect(draft.strengthTraining?.include).toBe(false);
    expect(draft.intakeStep).toBe("start");
  });

  test("does not treat a schedule-only answer as current level", () => {
    const response = continueIntakeDraft({
      draft: {
        ...createInitialIntakeDraft(),
        sport: "climbing",
        goalDescription: "Improve energy systems for climbing",
        goalType: "ongoing",
        blockLengthWeeks: 8,
        equipment: ["hangboard"],
        strengthTraining: { include: false, focusAreas: [] },
        startDate: "2026-05-04",
        daysPerWeek: 5,
        intakeTemplateId: "climbing_strength",
        intakeStep: "level",
      },
      userMessage: "5 days",
    });

    expect(response.draft.daysPerWeek).toBe(5);
    expect(response.draft.currentLevel).toBeUndefined();
    expect(response.draft.intakeStep).toBe("level");
  });
});
