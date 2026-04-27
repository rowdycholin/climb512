import type { Page } from "@playwright/test";

export const TEST_PASSWORD = "Climb512!!";

export async function registerUser(page: Page, userId: string, password = TEST_PASSWORD) {
  await page.goto("/register");
  await page.fill('input[name="firstName"]', "Playwright");
  await page.fill('input[name="lastName"]', "User");
  await page.fill('input[name="email"]', `${userId}@example.test`);
  await page.fill('input[name="userId"]', userId);
  await page.fill('input[name="age"]', "28");
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="verifyPassword"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 10_000 });
}

export async function createPlanFromOnboarding(page: Page, options: { startDate?: string; daysPerWeek?: string } = {}) {
  await page.goto("/onboarding");
  await page.locator('label:has(input[name="goals"][value="send-project"])').click();
  await page.check('input[name="discipline"][value="bouldering"]');
  await page.selectOption('select[name="currentGrade"]', "V4");
  await page.selectOption('select[name="targetGrade"]', "V6");
  if (options.startDate) {
    await page.fill('input[name="startDate"]', options.startDate);
  }
  await page.selectOption('select[name="weeksDuration"]', "4");
  await page.selectOption('select[name="daysPerWeek"]', options.daysPerWeek ?? "2");
  await page.click('button:has-text("Generate My Training Plan")');
  await page.waitForURL(/\/plan\//, { timeout: 60_000 });
}
