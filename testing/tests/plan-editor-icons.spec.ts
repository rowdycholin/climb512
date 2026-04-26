import { expect, test } from "@playwright/test";

async function registerAndCreatePlan(page: import("@playwright/test").Page) {
  const username = `pw-icons-${Date.now()}`;

  await page.goto("/login");
  await page.getByRole("button", { name: "Register" }).click();
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', "climbin512!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 10_000 });
  await page.goto("/onboarding");

  await page.locator('label:has(input[name="goals"][value="send-project"])').click();
  await page.selectOption('select[name="currentGrade"]', "V4");
  await page.selectOption('select[name="targetGrade"]', "V6");
  await page.fill('input[name="age"]', "28");
  await page.selectOption('select[name="weeksDuration"]', "4");
  await page.selectOption('select[name="daysPerWeek"]', "2");
  await page.check('input[name="discipline"][value="bouldering"]');
  await page.click('button:has-text("Generate My Training Plan")');
  await page.waitForURL(/\/plan\//, { timeout: 30_000 });
}

test("plan editor icon actions are visible and working", async ({ page }) => {
  await registerAndCreatePlan(page);

  await page.getByRole("button", { name: /Open plan editor/i }).click();
  await expect(page.getByText("Edit This Week")).toBeVisible();

  const addButton = page.getByRole("button", { name: /Add exercise to/i }).first();
  const duplicateButton = page.getByRole("button", { name: /^Duplicate / }).first();
  const deleteButton = page.getByRole("button", { name: /^Delete / }).first();

  await expect(addButton).toBeVisible();
  await expect(addButton.locator("svg")).toBeVisible();
  await expect(duplicateButton).toBeVisible();
  await expect(duplicateButton.locator("svg")).toBeVisible();
  await expect(deleteButton).toBeVisible();
  await expect(deleteButton.locator("svg")).toBeVisible();

  const duplicateCountBefore = await page.getByRole("button", { name: /^Duplicate / }).count();
  await duplicateButton.click();
  await expect(page.getByRole("button", { name: /^Duplicate / })).toHaveCount(duplicateCountBefore + 1);

  await addButton.click();
  const customExerciseInput = page.locator('input[value="Custom exercise"]').last();
  await expect(customExerciseInput).toBeVisible();

  const duplicateCountAfterAdd = await page.getByRole("button", { name: /^Duplicate / }).count();
  await page.getByRole("button", { name: "Delete Custom exercise" }).last().click();
  await expect(page.getByRole("button", { name: /^Duplicate / })).toHaveCount(duplicateCountAfterAdd - 1);
  await expect(page.locator('input[value="Custom exercise"]')).toHaveCount(0);
});
