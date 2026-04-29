import { expect, test } from "@playwright/test";
import { createPlanFromOnboarding, registerUser } from "./helpers";

test("does not allow another authenticated user to view a snapshot plan", async ({ page }) => {
  const suffix = `${Date.now()}-${test.info().workerIndex}`;
  const owner = `pw-owner-${suffix}`;
  const intruder = `pw-intruder-${suffix}`;

  await registerUser(page, owner);
  await createPlanFromOnboarding(page);

  const ownerPlanUrl = page.url();
  expect(ownerPlanUrl).toMatch(/\/plan\//);

  await page.getByRole("button", { name: /Open menu/i }).click();
  await page.getByRole("button", { name: "Logout" }).click();
  await page.waitForURL(/\/login/);

  await registerUser(page, intruder);
  const response = await page.goto(ownerPlanUrl);

  expect(response?.status()).toBe(404);
  await expect(page).not.toHaveURL(/\/login/);
});

test("does not allow another authenticated user to mutate a snapshot plan", async ({ page }) => {
  const suffix = `${Date.now()}-${test.info().workerIndex}`;
  const owner = `pw-owner-mutate-${suffix}`;
  const intruder = `pw-intruder-mutate-${suffix}`;

  await registerUser(page, owner);
  await createPlanFromOnboarding(page);

  const ownerPlanUrl = page.url();
  const planId = ownerPlanUrl.split("/plan/")[1];
  expect(planId).toBeTruthy();

  await page.getByRole("button", { name: /Open menu/i }).click();
  await page.getByRole("button", { name: "Logout" }).click();
  await page.waitForURL(/\/login/);

  await registerUser(page, intruder);

  for (const action of ["logExercise", "saveEditedWeek", "adjustFuturePlan"] as const) {
    const response = await page.evaluate(
      async ({ action, planId }) => {
        const result = await fetch("/test-only/plan-action-attacks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, planId }),
        });

        return {
          status: result.status,
          body: await result.json(),
        };
      },
      { action, planId },
    );

    expect(response.status).toBe(200);
    expect(response.body.result.error).toMatch(/not authorized|plan not found/i);
    expect(response.body.after).toEqual(response.body.before);
  }
});
