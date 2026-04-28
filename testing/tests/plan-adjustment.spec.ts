import { expect, test } from "@playwright/test";
import { createPlanFromOnboarding, registerUser } from "./helpers";

async function createSixDayPlan(page: import("@playwright/test").Page, userId: string) {
  await registerUser(page, userId);
  await createPlanFromOnboarding(page, {
    daysPerWeek: "6",
  });
}

async function adjustPlanEasier(page: import("@playwright/test").Page, feedback: string) {
  await page.getByRole("button", { name: "Open plan adjustment" }).click();
  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "Adjust Future Plan" })).toBeVisible();
  await page.selectOption("#adjust-reason", "too_hard");
  await page.getByLabel("What should change?").fill(feedback);
  await page.getByRole("button", { name: "Adjust future plan" }).click();
}

test("adjusts a future plan from today when today is unlogged", async ({ page }) => {
  await createSixDayPlan(page, `adjust-today-${Date.now()}`);

  await adjustPlanEasier(page, "Make the remaining plan easier because I am not recovering.");

  await expect(page.getByText(/Adjusted future plan from Week 1, Day 1/i).first()).toBeVisible();
  await expect(page.getByText("Plan adjusted")).toBeVisible();
  await expect(page.getByText(/Week 1, Day 1/).first()).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText("1").first()).toBeVisible();
  await expect(page.locator('a[href^="/plan/"]')).toHaveCount(1);
});

test("adjusts from the next day when today has logs and keeps old logs visible", async ({ page }) => {
  await createSixDayPlan(page, `adjust-logged-${Date.now()}`);

  await page.getByRole("button", { name: /^Mark complete:/ }).first().click();
  const loggedExercise = page.getByRole("button", { name: /^Mark incomplete:/ }).first();
  await expect(loggedExercise).toBeVisible();

  await adjustPlanEasier(page, "Make the future work easier after today's logged session.");

  await expect(page.getByText(/Adjusted future plan from Week 1, Day 2/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Mark incomplete:/ }).first()).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.locator('a[href^="/plan/"]')).toHaveCount(1);
});
