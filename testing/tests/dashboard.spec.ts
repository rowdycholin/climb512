import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  // Try registering — succeeds on first run, shows error if already exists
  await page.getByRole("button", { name: "Register" }).click();
  await page.fill('input[name="username"]', "climber1");
  await page.fill('input[name="password"]', "climbin512!");
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 5000 });
    return;
  } catch {
    // Already registered — sign in instead
  }
  await page.goto("/login");
  await page.fill('input[name="username"]', "climber1");
  await page.fill('input[name="password"]', "climbin512!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|onboarding)/);
}

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
  });

  test("shows the dashboard heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Climb512/i })).toBeVisible();
  });

  test("has a link to create a new plan", async ({ page }) => {
    await expect(page.getByRole("link", { name: /Create|New Plan|Build/i })).toBeVisible();
  });

  test("existing plans link through to plan viewer", async ({ page }) => {
    const planLink = page.locator('a[href^="/plan/"]').first();
    const count = await planLink.count();
    if (count > 0) {
      await planLink.click();
      await expect(page).toHaveURL(/\/plan\//);
    } else {
      test.skip();
    }
  });
});
