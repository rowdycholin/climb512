import { test, expect } from "@playwright/test";
import { TEST_PASSWORD, registerUser } from "./helpers";

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await registerUser(page, "climber1").catch(async () => {
    await page.goto("/login");
    await page.fill('input[name="userId"]', "climber1");
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|onboarding)/);
  });
  await page.close();
});

test.describe("Authentication", () => {
  test("redirects unauthenticated users to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("register link opens the registration page", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Register" }).click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByRole("heading", { name: /Create Account/i })).toBeVisible();
  });

  test("shows error on bad credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="userId"]', "wronguser");
    await page.fill('input[name="password"]', "wrongpass");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/invalid user id or password/i)).toBeVisible();
  });

  test("logs in with valid credentials and lands on dashboard or onboarding", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="userId"]', "climber1");
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/);
  });

  test("logout redirects to /login", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="userId"]', "climber1");
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|onboarding)/);
    await page.getByRole("button", { name: /Open menu/i }).click();
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
