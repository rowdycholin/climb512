import { expect, test } from "@playwright/test";
import { registerUser } from "./helpers";

test("guided intake builds a reviewed draft and generates a plan", async ({ page }) => {
  await registerUser(page, `intake-${Date.now()}`);
  await page.goto("/intake");

  await expect(page.getByText("For what sport or discipline would you like to create a training plan?")).toBeVisible();

  await page.getByLabel("Plan intake message").fill("Climbing");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/What climbing goal do you want to train for/i)).toBeVisible();
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
  await expect(page.getByText(/injuries or limitations/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("Previous pulley injury, avoid max hangs early.");
  await page.getByRole("button", { name: "Send intake message" }).click();

  await expect(page.getByText("Plan Draft")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate Training Plan" })).toBeEnabled();

  await page.getByRole("button", { name: "Generate Training Plan" }).click();
  await expect(page).toHaveURL(/\/plan\//, { timeout: 60_000 });
});

test("guided intake uses the running template", async ({ page }) => {
  await registerUser(page, `running-intake-${Date.now()}`);
  await page.goto("/intake");

  await page.getByLabel("Plan intake message").fill("Running");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/What running goal do you want to train for/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("I want to build endurance.");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/How long should this training block be/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("8 weeks.");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/running equipment or training tools/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("treadmill, dumbbells");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/strength training included with the running plan/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("No.");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/When would you like to start/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("As soon as possible.");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/current weekly running volume/i)).toBeVisible();
});

test("guided intake uses the strength training template", async ({ page }) => {
  await registerUser(page, `strength-intake-${Date.now()}`);
  await page.goto("/intake");

  await page.getByLabel("Plan intake message").fill("Weight training");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/What strength goal do you want to train for/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("Build full-body strength.");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/target date or testing date/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("Ongoing.");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/How long should this training block be/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("12 weeks.");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/strength training equipment/i)).toBeVisible();
});

test("guided intake uses the generic fallback template", async ({ page }) => {
  await registerUser(page, `generic-intake-${Date.now()}`);
  await page.goto("/intake");

  await page.getByLabel("Plan intake message").fill("Kayaking");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/What is the main goal for this training plan/i)).toBeVisible();

  await page.getByLabel("Plan intake message").fill("Build general endurance.");
  await page.getByRole("button", { name: "Send intake message" }).click();
  await expect(page.getByText(/How long should this training block be/i)).toBeVisible();
});
