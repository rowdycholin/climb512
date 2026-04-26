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

