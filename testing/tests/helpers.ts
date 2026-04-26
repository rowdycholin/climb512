import type { Page } from "@playwright/test";

export const TEST_PASSWORD = "climbin512!";

export async function registerUser(page: Page, username: string, password = TEST_PASSWORD) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Register" }).click();
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 10_000 });
}

export async function createPlanFromOnboarding(page: Page) {
  await page.goto("/onboarding");
  await page.locator('label:has(input[name="goals"][value="send-project"])').click();
  await page.selectOption('select[name="currentGrade"]', "V4");
  await page.selectOption('select[name="targetGrade"]', "V6");
  await page.fill('input[name="age"]', "28");
  await page.selectOption('select[name="weeksDuration"]', "4");
  await page.selectOption('select[name="daysPerWeek"]', "2");
  await page.check('input[name="discipline"][value="bouldering"]');
  await page.click('button:has-text("Generate My Training Plan")');
  await page.waitForURL(/\/plan\//, { timeout: 60_000 });
}

