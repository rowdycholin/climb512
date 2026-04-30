import { expect, test } from "@playwright/test";
import { readSqlValue, registerUser, seedPendingGenerationPlan, skipIfWorkerStackIsNotSimulator } from "./helpers";

skipIfWorkerStackIsNotSimulator(test);

test("worker generation shows partial progress before completing the plan", async ({ page }) => {
  const suffix = `${Date.now()}-${test.info().workerIndex}`;
  const userId = `intake-worker-${suffix}`;

  await registerUser(page, userId);
  const { planId } = seedPendingGenerationPlan(userId, suffix);

  await page.goto(`/plan/${planId}`);

  await expect(page.getByText(/Generating week [1-4] of 4/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Week 1" })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("button", { name: /W4 pending/ })).toBeVisible();

  await page.getByRole("button", { name: /W4 pending/ }).click();
  await expect(page.getByRole("heading", { name: "Week is still generating" })).toBeVisible();
  await expect(page.getByText(/weeks ready/).first()).toBeVisible();

  await expect(page.getByRole("button", { name: /^W4$/ })).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: /^W4$/ }).click();
  await expect(page.getByRole("heading", { name: "Week 4" })).toBeVisible();

  await expect(page.getByText("Generating week")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Complete plan" })).toBeEnabled();

  expect(Number(readSqlValue(`SELECT COUNT(*) FROM "PlanGenerationWeek" WHERE "planId" = '${planId}';`))).toBe(4);
  expect(Number(readSqlValue(`SELECT COUNT(*) FROM "PlanVersion" WHERE "planId" = '${planId}';`))).toBe(1);
  expect(Number(readSqlValue(`SELECT COUNT(*) FROM "PlanVersion" WHERE "planId" = '${planId}' AND "changeType" = 'worker_generation_started';`))).toBe(0);
  expect(Number(readSqlValue(`SELECT "versionNum" FROM "PlanVersion" WHERE "planId" = '${planId}' AND "changeType" = 'generated';`))).toBe(1);

  await page.getByRole("button", { name: "Open version history" }).click();
  await expect(page.getByText("Current v1")).toBeVisible();
  await expect(page.getByText("Version 1").first()).toBeVisible();
});
