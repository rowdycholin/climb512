import { expect, test, type Page } from "@playwright/test";
import { registerUser, webIntakeRouteForCurrentDockerStack } from "./helpers";

const route = webIntakeRouteForCurrentDockerStack();

test.skip(
  route !== "simulator" && route !== "nemo-guardrails-simulator",
  "Intake route parity tests run only against the simulator-backed stack, with or without NeMo guardrails.",
);

interface IntakeParityScenario {
  id: string;
  firstAnswer: string;
  turns: string[];
}

const scenarios: IntakeParityScenario[] = [
  {
    id: "climbing",
    firstAnswer: "Climbing, mostly bouldering.",
    turns: [
      "I want to send V7 on a trip on 2026-08-15.",
      "I can train 4 days per week.",
      "Start on 2026-06-01.",
      "Current level is around V5.",
      "Indoor climbing gym, hangboard, dumbbells, and a spray wall.",
      "Yes, include strength training for fingers and pulling strength.",
      "No injuries.",
      "Monday, Wednesday, Friday, and Saturday work best.",
      "Sunday should be a rest day.",
      "Nothing else.",
    ],
  },
  {
    id: "cycling",
    firstAnswer: "Cycling.",
    turns: [
      "I want to train for a century ride event on 2026-09-20.",
      "16 weeks.",
      "I can train 4 days per week.",
      "Start on 2026-06-01.",
      "I ride about 60 miles per week and can handle 2 hour rides.",
      "Road bike, indoor trainer, heart rate monitor, and dumbbells.",
      "Yes, include strength training for core and posterior chain.",
      "No injuries.",
      "Tuesday, Thursday, Saturday, and Sunday work best.",
      "Monday and Friday should be rest days.",
      "Nothing else.",
    ],
  },
  {
    id: "running",
    firstAnswer: "Running.",
    turns: [
      "I want to run a 10K race on 2026-08-01.",
      "I can train 4 days per week.",
      "Start on 2026-06-01.",
      "I run about 15 miles per week right now.",
      "Road shoes, treadmill, GPS watch, and dumbbells.",
      "No strength training for now.",
      "No injuries.",
      "Tuesday, Thursday, Saturday, and Sunday work best.",
      "Monday and Friday should be rest days.",
      "Nothing else.",
    ],
  },
  {
    id: "strength-and-conditioning",
    firstAnswer: "Strength and conditioning.",
    turns: [
      "I want a 12 week strength and conditioning block for full-body strength and work capacity.",
      "I can train 5 days per week.",
      "Start on 2026-06-01.",
      "Intermediate lifter.",
      "Full gym with barbells, machines, cables, dumbbells, and a pull-up bar.",
      "Yes, this should be a dedicated strength and conditioning plan.",
      "No injuries, but avoid leg extensions.",
      "Monday through Friday work best.",
      "Saturday and Sunday should be rest days.",
      "Nothing else.",
    ],
  },
];

async function sendIntakeTurn(page: Page, turn: string) {
  const entry = page.getByLabel("Plan intake message");
  const send = page.getByRole("button", { name: "Send intake message" });

  await entry.fill(turn);
  await send.click();
  await expect(page.getByText(turn).last()).toBeVisible();

  await expect(page.getByText("Checking your answer...")).toBeVisible({ timeout: 5_000 }).catch(() => {});
  await expect(page.getByText("Checking your answer...")).toHaveCount(0, { timeout: 45_000 });
  await expect(page.getByText(/Still working\. The AI backend is taking longer than usual\./)).toHaveCount(0, { timeout: 45_000 });
  await expect(entry).toBeEditable({ timeout: 45_000 });
}

for (const scenario of scenarios) {
  test(`guided intake reaches ready for ${scenario.id} via ${route}`, async ({ page }) => {
    await registerUser(page, `intake-parity-${scenario.id}-${Date.now()}`);
    await page.goto("/intake");

    await expect(page.getByText(/strength and conditioning training/i)).toBeVisible();

    const generate = page.getByRole("button", { name: /Generate training plan/i });
    await expect(generate).toBeDisabled();

    for (const turn of [scenario.firstAnswer, ...scenario.turns]) {
      if (await generate.isEnabled()) break;
      await sendIntakeTurn(page, turn);
    }

    await expect(page.getByText(/Click the magic wand|Ready\. Click the magic wand/i).first()).toBeVisible({ timeout: 45_000 });
    await expect(generate).toBeEnabled();
    await expect(page.getByText("Plan Draft")).toHaveCount(0);
  });
}
