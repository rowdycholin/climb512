import { expect, test } from "@playwright/test";
import { createPlanFromOnboarding, readSqlValue, registerUser } from "./helpers";

async function createSixDayPlan(page: import("@playwright/test").Page, userId: string) {
  await registerUser(page, userId);
  await createPlanFromOnboarding(page, {
    daysPerWeek: "6",
  });
}

async function adjustPlanEasier(page: import("@playwright/test").Page, feedback: string) {
  await page.getByRole("button", { name: "Open plan adjustment" }).click();
  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "Adjust Future Plan" })).toBeVisible();
  await page.getByLabel("Adjustment request").fill(feedback);
  await page.getByRole("button", { name: "Send adjustment message" }).click();
  await expect(page.getByText("Review adjustment proposal")).toBeVisible();
  await expect(page.getByText(/Review affected days/)).toBeVisible();
  await page.getByRole("button", { name: "Apply proposal" }).click();
}

function currentPlanId(page: import("@playwright/test").Page) {
  const match = page.url().match(/\/plan\/([^/?#]+)/);
  if (!match) throw new Error(`Could not read plan id from ${page.url()}`);
  return match[1];
}

test("adjusts a future plan from today when today is unlogged", async ({ page }) => {
  await createSixDayPlan(page, `adjust-today-${Date.now()}`);

  await adjustPlanEasier(page, "Make the remaining plan easier because I am not recovering.");

  await expect(page.getByText(/Changes begin at Week 1, Day 1/i).first()).toBeVisible();
  await expect(page.getByText("Plan adjusted")).toHaveCount(0);
  await expect(page.getByText("Adjusted").first()).toBeVisible();

  await page.reload();
  await expect(page.getByText("Plan adjusted")).toHaveCount(0);
  await expect(page.getByText("Adjusted").first()).toHaveCount(0);

  await page.goto("/dashboard");
  await expect(page.getByText("1").first()).toBeVisible();
  await expect(page.locator('a[href^="/plan/"]')).toHaveCount(1);
});

test("adjusts from the next day when today has logs and keeps old logs visible", async ({ page }) => {
  await createSixDayPlan(page, `adjust-logged-${Date.now()}`);

  await page.getByRole("button", { name: /^Mark complete:/ }).first().click();
  const loggedExercise = page.getByRole("button", { name: /^Mark incomplete:/ }).first();
  await expect(loggedExercise).toBeVisible();

  await adjustPlanEasier(page, "Make the future work easier after today's logged session.");

  await expect(page.getByText(/Changes begin at Week 1, Day 2/i).first()).toBeVisible();
  await expect(page.getByText("Adjusted").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Adjusted").first()).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Mark incomplete:/ }).first()).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.locator('a[href^="/plan/"]')).toHaveCount(1);
});

test("shows version history and reverts by creating a new current version", async ({ page }) => {
  await createSixDayPlan(page, `version-revert-${Date.now()}`);

  await adjustPlanEasier(page, "Make the remaining plan easier because I am not recovering.");

  await page.getByRole("button", { name: "Open version history" }).click();
  await expect(page.getByText("Version History")).toBeVisible();
  await expect(page.getByText("Current v2")).toBeVisible();
  await expect(page.getByText("Version 1")).toBeVisible();
  await expect(page.getByText(/Request: Make the remaining plan easier because I am not recovering/i).first()).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Revert to Version 1");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Revert to Version 1" }).click();

  await expect(page.getByText("Version 3").first()).toBeVisible();
  await expect(page.getByText("Current v3")).toBeVisible();
  await expect(page.getByText("Initial AI-generated plan").first()).toBeVisible();
  await expect(page.getByText("Reverted to Version 1")).toHaveCount(0);
});

test("week-only adjustment does not change later weeks", async ({ page }) => {
  await createSixDayPlan(page, `adjust-week-scope-${Date.now()}`);
  const planId = currentPlanId(page);

  await page.getByRole("button", { name: "Open plan adjustment" }).click();
  await page.getByLabel("Adjustment request").fill("Make this week only easier because I am tired.");
  await page.getByRole("button", { name: "Send adjustment message" }).click();
  await expect(page.getByText("Scope: Week 1 only", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply proposal" }).click();
  await expect(page.getByText(/Changes begin at Week 1, Day 1/i).first()).toBeVisible();

  expect(
    readSqlValue(`
      SELECT ((current."planSnapshot"->'weeks'->1) = (original."planSnapshot"->'weeks'->1))::text
      FROM "Plan" p
      JOIN "PlanVersion" current ON current."id" = p."currentVersionId"
      JOIN "PlanVersion" original ON original."planId" = p."id" AND original."versionNum" = 1
      WHERE p."id" = '${planId}';
    `),
  ).toBe("true");
});

test("day-only adjustment does not change other days in the same week", async ({ page }) => {
  await createSixDayPlan(page, `adjust-day-scope-${Date.now()}`);
  const planId = currentPlanId(page);

  await page.getByRole("button", { name: "Open plan adjustment" }).click();
  await page.getByLabel("Adjustment request").fill("Make Monday only easier because I am tired.");
  await page.getByRole("button", { name: "Send adjustment message" }).click();
  await expect(page.getByText("Scope: Week 1, Day 1 only", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply proposal" }).click();
  await expect(page.getByText(/Changes begin at Week 1, Day 1/i).first()).toBeVisible();

  expect(
    readSqlValue(`
      SELECT ((current."planSnapshot"->'weeks'->0->'days'->1) = (original."planSnapshot"->'weeks'->0->'days'->1))::text
      FROM "Plan" p
      JOIN "PlanVersion" current ON current."id" = p."currentVersionId"
      JOIN "PlanVersion" original ON original."planId" = p."id" AND original."versionNum" = 1
      WHERE p."id" = '${planId}';
    `),
  ).toBe("true");
});

test("asks a follow-up when adjustment scope is unclear", async ({ page }) => {
  await createSixDayPlan(page, `adjust-scope-followup-${Date.now()}`);

  await page.getByRole("button", { name: "Open plan adjustment" }).click();
  await page.getByLabel("Adjustment request").fill("Make it easier because I am tired.");
  await page.getByRole("button", { name: "Send adjustment message" }).click();
  await expect(page.getByText("Should this apply only to this week, only to one day, or to the rest of the plan?")).toBeVisible();

  await page.getByLabel("Adjustment request").fill("this week only");
  await page.getByRole("button", { name: "Send adjustment message" }).click();
  await expect(page.getByText("Scope: Week 1 only", { exact: true })).toBeVisible();
});

test("scope override can narrow a broad proposal", async ({ page }) => {
  await createSixDayPlan(page, `adjust-scope-override-${Date.now()}`);
  const planId = currentPlanId(page);

  await page.getByRole("button", { name: "Open plan adjustment" }).click();
  await page.getByLabel("Adjustment request").fill("Make the remaining plan easier because I am tired.");
  await page.getByRole("button", { name: "Send adjustment message" }).click();
  await expect(page.getByText("Scope: From Week 1, Day 1 through plan end", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Week 1 only" }).click();
  await expect(page.getByText("Scope: Week 1 only", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply proposal" }).click();
  await expect(page.getByText(/Changes begin at Week 1, Day 1/i).first()).toBeVisible();

  expect(
    readSqlValue(`
      SELECT ((current."planSnapshot"->'weeks'->1) = (original."planSnapshot"->'weeks'->1))::text
      FROM "Plan" p
      JOIN "PlanVersion" current ON current."id" = p."currentVersionId"
      JOIN "PlanVersion" original ON original."planId" = p."id" AND original."versionNum" = 1
      WHERE p."id" = '${planId}';
    `),
  ).toBe("true");
});
