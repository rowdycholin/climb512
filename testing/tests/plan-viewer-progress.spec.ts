import { expect, test } from "@playwright/test";
import { registerUser, skipIfWebIsNotSimulator } from "./helpers";

skipIfWebIsNotSimulator(test);

async function registerAndCreateThreeDayPlan(page: import("@playwright/test").Page) {
  const userId = `progress-${Date.now()}`;
  await registerUser(page, userId);
  await page.goto("/onboarding");
  await page.locator('label:has(input[name="goals"][value="send-project"])').click();
  await page.check('input[name="discipline"][value="bouldering"]');
  await page.selectOption('select[name="currentGrade"]', "V4");
  await page.selectOption('select[name="targetGrade"]', "V6");
  await page.selectOption('select[name="weeksDuration"]', "4");
  await page.selectOption('select[name="daysPerWeek"]', "3");
  await page.click('button:has-text("Generate My Training Plan")');
  await page.waitForURL(/\/plan\//, { timeout: 60_000 });
}

test("marking a non-Monday exercise complete keeps that day expanded", async ({ page }) => {
  await registerAndCreateThreeDayPlan(page);

  const monday = page.getByRole("button", { name: /Monday/ });
  const wednesday = page.getByRole("button", { name: /Wednesday/ });

  await expect(monday).toHaveAttribute("aria-expanded", "true");
  await wednesday.click();
  await expect(wednesday).toHaveAttribute("aria-expanded", "true");

  const wednesdayItem = page.locator('[data-slot="accordion-item"]').filter({ hasText: "Wednesday" });
  await wednesdayItem.getByRole("button", { name: /^Mark complete:/ }).first().click();

  await expect(wednesday).toHaveAttribute("aria-expanded", "true");
  await expect(wednesdayItem.getByRole("button", { name: /^Mark incomplete:/ }).first()).toBeVisible();
});
