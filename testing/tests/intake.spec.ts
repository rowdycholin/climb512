import { expect, test } from "@playwright/test";
import { registerUser } from "./helpers";

test("guided intake builds a reviewed draft and generates a plan", async ({ page }) => {
  await registerUser(page, `intake-${Date.now()}`);
  await page.goto("/intake");

  await expect(page.getByText("For what sport or discipline would you like to create a training plan?")).toBeVisible();

  await page.getByLabel("Plan intake message").fill("Climbing");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/anything specific you want to train for/i)).toBeVisible();
  await expect(page.getByLabel("Plan intake message")).toBeFocused();

  await page.getByLabel("Plan intake message").fill("Yes, I want to climb the Nose on El Cap so I need endurance and long days.");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/specific date or deadline/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("I want to go on my trip 10/15/26.");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/What equipment do you have access to/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("hangboard, gym, weights, approach pack");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/Do you want weight training included/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("Yes, focus on posterior chain, pulling strength, and core.");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/When would you like to start/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("As soon as possible.");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/current comfortable climbing level/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("I am comfortable on 5.10 trad.");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/How many days per week/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("4");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/Any injuries, limitations/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("Previous pulley injury, avoid max hangs early.");
  await page.getByRole("button", { name: "Send intake message" }).click();

  await expect(page.getByLabel("Primary Discipline")).toHaveValue("trad");
  await expect(page.getByLabel("Current Level")).toHaveValue("5.10");
  await expect(page.getByLabel("Target Level")).toHaveValue("5.9 C2");
  await expect(page.getByLabel("Days Per Week")).toHaveValue("4");
  await expect(page.getByLabel("Equipment")).toHaveValue("hangboard, gym, weights, approach pack");
  await expect(page.getByLabel("Injuries / Limitations")).toHaveValue("Previous pulley injury, avoid max hangs early.");

  await page.getByRole("button", { name: "Generate Training Plan" }).click();
  await expect(page).toHaveURL(/\/plan\//, { timeout: 60_000 });
});
