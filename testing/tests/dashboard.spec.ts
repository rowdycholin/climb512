import { test, expect } from "@playwright/test";
import { TEST_PASSWORD, createPlanFromOnboarding, registerUser } from "./helpers";

async function login(page: import("@playwright/test").Page) {
  await registerUser(page, "climber1").catch(async () => {
    await page.goto("/login");
    await page.fill('input[name="userId"]', "climber1");
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|onboarding)/);
  });
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
    const userId = `dashplan-${Date.now()}`;
    await registerUser(page, userId);
    await createPlanFromOnboarding(page);
    await page.goto("/dashboard");

    const planLink = page.locator('a[href^="/plan/"]').first();
    await planLink.click();
    await expect(page).toHaveURL(/\/plan\//);
  });
});
