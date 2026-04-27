import { expect, test } from "@playwright/test";
import { createPlanFromOnboarding, registerUser } from "./helpers";

function dateInputDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

test("opens a plan to the calendar day based on its start date", async ({ page }) => {
  await registerUser(page, `startdate-${Date.now()}`);
  await createPlanFromOnboarding(page, {
    startDate: dateInputDaysAgo(2),
    daysPerWeek: "3",
  });

  await expect(page.getByRole("button", { name: /Wednesday/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /Monday/ })).not.toHaveAttribute("aria-expanded", "true");
});
