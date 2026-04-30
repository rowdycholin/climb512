import { expect, test } from "@playwright/test";
import { createPlanFromOnboarding, registerUser, skipIfWebIsNotSimulator } from "./helpers";

skipIfWebIsNotSimulator(test);

async function registerAndCreatePlan(page: import("@playwright/test").Page) {
  const userId = `pw-icons-${Date.now()}`;
  await registerUser(page, userId);
  await createPlanFromOnboarding(page);
}

test("plan editor icon actions are visible and working", async ({ page }) => {
  await registerAndCreatePlan(page);

  await page.getByRole("button", { name: /Open day editor/i }).click();
  await expect(page.getByText("Edit This Week")).toBeVisible();

  const addButton = page.getByRole("button", { name: /Add exercise to/i }).first();
  const duplicateButton = page.getByRole("button", { name: /^Duplicate / }).first();
  const deleteButton = page.getByRole("button", { name: /^Delete / }).first();

  await expect(addButton).toBeVisible();
  await expect(addButton.locator("svg")).toBeVisible();
  await expect(duplicateButton).toBeVisible();
  await expect(duplicateButton.locator("svg")).toBeVisible();
  await expect(deleteButton).toBeVisible();
  await expect(deleteButton.locator("svg")).toBeVisible();

  const duplicateCountBefore = await page.getByRole("button", { name: /^Duplicate / }).count();
  await duplicateButton.click();
  await expect(page.getByRole("button", { name: /^Duplicate / })).toHaveCount(duplicateCountBefore + 1);

  await addButton.click();
  const customExerciseInput = page.locator('input[value="Custom exercise"]').last();
  await expect(customExerciseInput).toBeVisible();

  const notesInput = page.getByPlaceholder("Notes").last();
  await notesInput.fill("easy custom notes");
  await expect(notesInput).toHaveValue("easy custom notes");

  const duplicateCountAfterAdd = await page.getByRole("button", { name: /^Duplicate / }).count();
  await page.getByRole("button", { name: "Delete Custom exercise" }).last().click();
  await expect(page.getByRole("button", { name: /^Duplicate / })).toHaveCount(duplicateCountAfterAdd - 1);
  await expect(page.locator('input[value="Custom exercise"]')).toHaveCount(0);
});

test("plan editor can add an exercise to a rest day", async ({ page }) => {
  await registerAndCreatePlan(page);

  await page.getByRole("button", { name: /Open day editor/i }).click();
  await expect(page.getByText("Edit This Week")).toBeVisible();

  await expect(page.getByText("1. Monday").nth(1)).toBeVisible();
  await expect(page.getByText("Rest day").first()).toBeVisible();

  await page.getByRole("button", { name: "Add exercise to Monday" }).click();
  await expect(page.locator('input[value="Custom exercise"]')).toBeVisible();
});

test("plan editor can add and log an extra exercise after a day has logs", async ({ page }) => {
  await registerAndCreatePlan(page);

  const trainingDay = page.getByRole("button", { name: /Training/ }).first();
  const trainingDayText = (await trainingDay.textContent()) ?? "";
  const trainingDayName = trainingDayText.match(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/)?.[0] ?? "Monday";
  await trainingDay.click();
  await expect(trainingDay).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: /^Mark complete:/ }).first().click();
  await expect(page.getByRole("button", { name: /^Mark incomplete:/ }).first()).toBeVisible();

  await page.getByRole("button", { name: /Open day editor/i }).click();
  await expect(page.getByText("Add To This Week")).toBeVisible();

  await page.getByRole("button", { name: `Add exercise to ${trainingDayName}` }).click();
  const customExerciseInput = page.locator('input[value="Custom exercise"]').last();
  await customExerciseInput.fill("Bonus core finisher");
  await page.locator('input[placeholder="Sets"]:not([disabled])').last().fill("2");
  await page.locator('input[placeholder="Reps"]:not([disabled])').last().fill("10");
  await page.getByRole("button", { name: "Save additions" }).click();

  await expect(page.getByText("Bonus core finisher")).toBeVisible();

  await page.getByRole("button", { name: "Mark complete: Bonus core finisher" }).click();
  await expect(page.getByRole("button", { name: "Mark incomplete: Bonus core finisher" })).toBeVisible();
});
