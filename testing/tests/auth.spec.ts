import { test, expect } from "@playwright/test";

// Ensure test user exists before auth tests
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Register" }).click();
  await page.fill('input[name="username"]', "climber1");
  await page.fill('input[name="password"]', "climbin512!");
  await page.click('button[type="submit"]');
  // Either redirects (new user) or shows "already taken" error — both are fine
  await page.waitForTimeout(2000);
  await page.close();
});

test.describe("Authentication", () => {
  test("redirects unauthenticated users to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows error on bad credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="username"]', "wronguser");
    await page.fill('input[name="password"]', "wrongpass");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/invalid username or password/i)).toBeVisible();
  });

  test("logs in with valid credentials and lands on dashboard or onboarding", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="username"]', "climber1");
    await page.fill('input[name="password"]', "climbin512!");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/);
  });

  test("logout redirects to /login", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="username"]', "climber1");
    await page.fill('input[name="password"]', "climbin512!");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|onboarding)/);
    await page.click('button:has-text("Logout")');
    await expect(page).toHaveURL(/\/login/);
  });
});
