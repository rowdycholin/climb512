import { test, expect } from "@playwright/test";
import { registerUser, skipIfWebIsNotSimulator } from "./helpers";

async function login(page: import("@playwright/test").Page) {
  await registerUser(page, `onboard-${Date.now()}`);
  await page.goto("/onboarding");
}

test.describe("Onboarding form", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("renders all required form sections", async ({ page }) => {
    await expect(page.getByText(/What are your climbing goals/i)).toBeVisible();
    await expect(page.getByText(/Your Level/i)).toBeVisible();
    await expect(page.getByText(/Training Schedule/i)).toBeVisible();
    await expect(page.getByText(/Climbing Discipline/i)).toBeVisible();
    await expect(page.getByText(/Equipment/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Generate My Training Plan/i })).toBeVisible();
  });

  test("requires grades before submitting", async ({ page }) => {
    await page.click('button:has-text("Generate My Training Plan")');
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test("changes grade systems by discipline", async ({ page }) => {
    await expect(page.locator('select[name="currentGrade"] option[value="V4"]')).toHaveCount(1);
    await expect(page.locator('select[name="currentGrade"] option[value="5.10a"]')).toHaveCount(0);

    await page.check('input[name="discipline"][value="sport"]');
    await expect(page.locator('select[name="currentGrade"] option[value="5.10a"]')).toHaveCount(1);
    await expect(page.locator('select[name="currentGrade"] option[value="V4"]')).toHaveCount(0);

    await page.check('input[name="discipline"][value="ice"]');
    await expect(page.locator('select[name="currentGrade"] option[value="WI3+"]')).toHaveCount(1);
    await expect(page.locator('select[name="currentGrade"] option[value="5.10a"]')).toHaveCount(0);
  });

  test("generates a plan end-to-end", async ({ page }) => {
    skipIfWebIsNotSimulator(test);

    await page.locator('label:has(input[name="goals"][value="send-project"])').click();
    await page.check('input[name="discipline"][value="bouldering"]');
    await page.selectOption('select[name="currentGrade"]', "V4");
    await page.selectOption('select[name="targetGrade"]', "V6");
    await page.selectOption('select[name="weeksDuration"]', "4");
    await page.selectOption('select[name="daysPerWeek"]', "2");
    await page.click('button:has-text("Generate My Training Plan")');
    await expect(page).toHaveURL(/\/plan\//, { timeout: 90_000 });
    await expect(page.getByRole("heading", { name: /Week 1/i })).toBeVisible({ timeout: 10_000 });
  });
});
