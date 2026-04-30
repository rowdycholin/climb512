import { expect, test } from "@playwright/test";
import { createPlanFromOnboarding, registerUser, skipIfWebIsNotSimulator } from "./helpers";

skipIfWebIsNotSimulator(test);

function dateInputDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

test("opens a plan to the calendar day based on its start date", async ({ page }) => {
  await registerUser(page, `startdate-${Date.now()}`);
  await createPlanFromOnboarding(page, {
    startDate: dateInputDaysAgo(2),
    daysPerWeek: "3",
  });

  await expect(page.getByRole("button", { name: /Wednesday/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /Monday/ })).not.toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(/Day 3 of 28/)).toBeVisible();
  await expect(page.getByText(/Start /)).toBeVisible();
});

test("marks plans complete after the final day", async ({ page }) => {
  await registerUser(page, `startdate-complete-${Date.now()}`);
  await createPlanFromOnboarding(page, {
    startDate: dateInputDaysAgo(30),
    daysPerWeek: "3",
  });

  await expect(page.getByText(/Congratulations! You reached the end of this training plan/i)).toBeVisible();
  await expect(page.getByText(/Day 28 of 28/)).toBeVisible();
  await expect(page.getByText("Complete").nth(1)).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText("Complete")).toBeVisible();
  await expect(page.getByText(/Day 28 of 28/)).toBeVisible();
});

test("lets a user explicitly mark an active plan complete", async ({ page }) => {
  await registerUser(page, `startdate-user-complete-${Date.now()}`);
  await createPlanFromOnboarding(page, {
    startDate: dateInputDaysAgo(2),
    daysPerWeek: "3",
  });

  await page.getByRole("button", { name: "Complete plan" }).click();
  await page.selectOption('select[name="completionReason"]', "goal_completed");
  await page.fill('textarea[name="completionNotes"]', "Sent the goal early and feel ready for the next block.");
  await page.getByRole("button", { name: "Mark Complete", exact: true }).click();

  await expect(page.getByText(/Congratulations! You marked this training plan complete/i)).toBeVisible();
  await expect(page.getByText(/Sent the goal early/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reopen plan" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText("Complete").first()).toBeVisible();
  await expect(page.getByText(/Marked complete/i)).toBeVisible();
});
