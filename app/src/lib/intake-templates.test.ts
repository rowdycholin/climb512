import { describe, expect, test } from "vitest";
import {
  genericTrainingTemplate,
  getIntakeTemplate,
  selectIntakeTemplate,
} from "./intake-templates";

describe("intake templates", () => {
  test.each([
    ["Climbing", "climbing_strength"],
    ["rock climbing", "climbing_strength"],
    ["Running", "running"],
    ["run training", "running"],
    ["Weight training", "strength_training"],
    ["Strength Training", "strength_training"],
    ["powerlifting", "strength_training"],
    ["Kayaking", "generic_training"],
    [undefined, "generic_training"],
  ])("selects %s as %s", (sport, expectedTemplateId) => {
    expect(selectIntakeTemplate(sport).id).toBe(expectedTemplateId);
  });

  test("falls back to the generic template for unknown IDs", () => {
    expect(getIntakeTemplate("missing-template")).toBe(genericTrainingTemplate);
  });

  test("keeps prompts focused on one question at a time", () => {
    for (const question of selectIntakeTemplate("Running").questions) {
      expect(question.prompt.trim()).not.toMatch(/\?\s+\S.*\?/);
    }
  });
});

