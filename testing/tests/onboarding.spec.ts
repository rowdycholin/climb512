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
  } catch {
    // Already registered — sign in instead
    await page.goto("/login");
    await page.fill('input[name="username"]', "climber1");
    await page.fill('input[name="password"]', "climbin512!");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|onboarding)/);
  }
  // Always land on onboarding for these tests
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

  test("requires at least a grade and age before submitting", async ({ page }) => {
    await page.click('button:has-text("Generate My Training Plan")');
    // Native required validation prevents submit — URL should stay on onboarding
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test("generates a plan end-to-end", async ({ page }) => {
    // Goals — shadcn Checkbox hides the real input; click the wrapping label
    await page.locator('label:has(input[name="goals"][value="send-project"])').click();

    // Grades
    await page.selectOption('select[name="currentGrade"]', "V4");
    await page.selectOption('select[name="targetGrade"]', "V6");

    // Age
    await page.fill('input[name="age"]', "28");

    // Schedule — minimum plan to stay within OpenRouter token budget
    await page.selectOption('select[name="weeksDuration"]', "4");
    await page.selectOption('select[name="daysPerWeek"]', "2");

    // Discipline
    await page.check('input[name="discipline"][value="bouldering"]');

    // Submit — AI call can take a while
    await page.click('button:has-text("Generate My Training Plan")');
    await expect(page).toHaveURL(/\/plan\//, { timeout: 90_000 });
    await expect(page.getByRole("heading", { name: /Week 1/i })).toBeVisible({ timeout: 10_000 });
  });
});
