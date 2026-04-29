import { expect, test } from "@playwright/test";
import { dockerServiceUsesSimulator, registerUser, seedFailedGenerationPlan } from "./helpers";

test.skip(
  !dockerServiceUsesSimulator("web") || !dockerServiceUsesSimulator("plan-worker"),
  "Plan generation repair regression runs only when web and plan-worker use the simulator backend.",
);

test("failed worker generation can be repaired and resumed from the failed week", async ({ page }) => {
  const suffix = `${Date.now()}-${test.info().workerIndex}`;
  const userId = `intake-repair-${suffix}`;

  await registerUser(page, userId);
  const { planId } = seedFailedGenerationPlan(userId, suffix);

  await page.goto(`/plan/${planId}`);

  await expect(page.getByText("Week 3 needs repair")).toBeVisible();
  await expect(page.getByText("Simulated AI failure").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Week 1" })).toBeVisible();
  await page.getByRole("button", { name: "W3 pending" }).click();
  await expect(page.getByRole("heading", { name: "Generation paused" })).toBeVisible();

  await page.getByLabel("Repair guidance").fill("Reduce volume and continue from the prior generated weeks.");
  await page.getByRole("button", { name: "Resume Generation" }).click();

  await expect(page.getByText(/Generating week 3 of 4|Generating week 4 of 4/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Week 3 needs repair")).toHaveCount(0, { timeout: 60_000 });

  await expect(page.getByRole("button", { name: /^W3$/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /^W3$/ }).click();
  await expect(page.getByRole("heading", { name: "Week 3" })).toBeVisible();

  await expect(page.getByRole("button", { name: /^W4$/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Generating week")).toHaveCount(0, { timeout: 60_000 });
});
