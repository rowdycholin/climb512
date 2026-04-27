import { expect, test } from "@playwright/test";
import { createPlanFromOnboarding, registerUser } from "./helpers";

async function registerAndCreatePlan(page: import("@playwright/test").Page) {
  const userId = `pw-icons-${Date.now()}`;
  await registerUser(page, userId);
  await createPlanFromOnboarding(page);
}

test("plan editor icon actions are visible and working", async ({ page }) => {
  await registerAndCreatePlan(page);

  await page.getByRole("button", { name: /Open plan editor/i }).click();
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

  await page.getByRole("button", { name: /Open plan editor/i }).click();
  await expect(page.getByText("Edit This Week")).toBeVisible();

  await expect(page.getByText("1. Monday").nth(1)).toBeVisible();
  await expect(page.getByText("Rest day").first()).toBeVisible();

  await page.getByRole("button", { name: "Add exercise to Monday" }).click();
  await expect(page.locator('input[value="Custom exercise"]')).toBeVisible();
});
