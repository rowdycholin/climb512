import { expect, test, type Page } from "@playwright/test";
import { registerUser, webIntakeRouteForCurrentDockerStack } from "./helpers";

const route = webIntakeRouteForCurrentDockerStack();
const aiResponseTimeoutMs = 120_000;
const usesLiveAiBackend = route === "direct-ai" || route === "nemo-guardrails-live";

test.setTimeout(300_000);

test.skip(
  route === "other",
  "Intake timing tests require a recognized direct or NeMo guided-intake route.",
);

interface IntakeTimingScenario {
  id: string;
  turns: string[];
}

const simulatorScenarios: IntakeTimingScenario[] = [
  {
    id: "climbing",
    turns: [
      "Climbing, mostly bouldering.",
      "I want to send V7 on a trip on 2026-08-15.",
      "I can train 4 days per week.",
      "Start on 2026-06-01.",
      "Current level is around V5.",
      "Indoor climbing gym, hangboard, dumbbells, and a spray wall.",
      "No injuries or pain.",
      "Yes, include strength training for fingers and pulling strength.",
      "I prefer Monday, Wednesday, Friday, and Saturday training days.",
      "Tuesday, Thursday, and Sunday can be rest or easy recovery days.",
    ],
  },
  {
    id: "cycling",
    turns: [
      "Cycling.",
      "I want to train for a century ride event on 2026-09-20.",
      "16 weeks.",
      "I can train 4 days per week.",
      "Start on 2026-06-01.",
      "I ride about 60 miles per week and can handle 2 hour rides.",
      "Road bike, indoor trainer, heart rate monitor, and dumbbells.",
      "No injuries or pain.",
      "Yes, include strength training for core and posterior chain.",
      "I prefer Tuesday, Thursday, Saturday, and Sunday training days.",
      "Monday, Wednesday, and Friday can be rest or easy recovery days.",
    ],
  },
  {
    id: "running",
    turns: [
      "Running.",
      "I want to run a 10K race on 2026-08-01.",
      "I can train 4 days per week.",
      "Start on 2026-06-01.",
      "I run about 15 miles per week right now.",
      "Road shoes, treadmill, GPS watch, and dumbbells.",
      "No injuries or pain.",
      "No strength training for now.",
      "I prefer Monday, Wednesday, Friday, and Saturday training days.",
      "Tuesday, Thursday, and Sunday can be rest or easy recovery days.",
    ],
  },
  {
    id: "strength-and-conditioning",
    turns: [
      "Strength and conditioning.",
      "I want a 12 week strength and conditioning block for full-body strength and work capacity.",
      "I can train 5 days per week.",
      "Start on 2026-06-01.",
      "Intermediate lifter.",
      "Full gym with barbells, machines, cables, dumbbells, and a pull-up bar.",
      "No injuries, pain, or movement restrictions.",
      "I prefer Monday through Friday training days.",
      "Saturday and Sunday can be rest or light recovery days.",
      "Nothing else.",
    ],
  },
];

const liveBackendScenarios: IntakeTimingScenario[] = [
  {
    id: "climbing",
    turns: [
      "Climbing, mostly bouldering.",
      "I want to send V7 on a trip on 2026-08-15.",
      "12 weeks.",
      "I can train 4 days per week.",
      "I prefer Monday, Wednesday, Friday, and Saturday training days.",
      "Start on 2026-06-01.",
      "Current level is around V5.",
      "Indoor climbing gym, hangboard, dumbbells, and a spray wall.",
      "Yes, include strength training for fingers and pulling strength.",
      "No injuries or pain.",
      "Nothing else.",
    ],
  },
  {
    id: "cycling",
    turns: [
      "Cycling.",
      "I want to train for a century ride event on 2026-09-20.",
      "16 weeks.",
      "I can train 4 days per week.",
      "I prefer Tuesday, Thursday, Saturday, and Sunday training days.",
      "Monday, Wednesday, and Friday can be rest or easy recovery days.",
      "Start on 2026-06-01.",
      "Intermediate rider; I ride about 60 miles per week and can handle 2 hour rides.",
      "Road bike, indoor trainer, heart rate monitor, and dumbbells.",
      "No injuries or pain. Yes, include strength training for core and posterior chain.",
      "Nothing else.",
    ],
  },
  {
    id: "running",
    turns: [
      "Running.",
      "I want to run a 10K race on 2026-08-01.",
      "12 weeks.",
      "I can train 4 days per week.",
      "I prefer Monday, Wednesday, Friday, and Saturday training days.",
      "Tuesday, Thursday, and Sunday can be rest or easy recovery days.",
      "Start on 2026-06-01.",
      "Intermediate recreational runner; I run about 15 miles per week right now.",
      "Road shoes, treadmill, GPS watch, and dumbbells.",
      "No injuries or pain.",
      "No strength training for now.",
      "Nothing else.",
    ],
  },
  {
    id: "strength-and-conditioning",
    turns: [
      "Strength and conditioning.",
      "I want a 12 week strength and conditioning block for full-body strength and work capacity.",
      "I can train 5 days per week.",
      "I prefer Monday through Friday training days.",
      "Saturday and Sunday can be rest or light recovery days.",
      "Start on 2026-06-01.",
      "Intermediate lifter.",
      "Full gym with barbells, machines, cables, dumbbells, and a pull-up bar.",
      "No injuries, pain, or movement restrictions.",
      "Nothing else.",
    ],
  },
];

const scenarios = usesLiveAiBackend ? liveBackendScenarios : simulatorScenarios;

async function sendIntakeTurn(page: Page, turn: string) {
  const entry = page.getByLabel("Plan intake message");
  const send = page.getByRole("button", { name: "Send intake message" });

  await entry.fill(turn);
  await send.click();
  await expect(page.getByText(turn).last()).toBeVisible();

  await expect(page.getByText("Checking your answer...")).toBeVisible({ timeout: 5_000 }).catch(() => {});
  await expect(page.getByText("Checking your answer...")).toHaveCount(0, { timeout: aiResponseTimeoutMs });
  await expect(page.getByText(/Still working\. The AI backend is taking longer than usual\./)).toHaveCount(0, { timeout: aiResponseTimeoutMs });
  await expect(entry).toBeEditable({ timeout: aiResponseTimeoutMs });
}

for (const scenario of scenarios) {
  test(`guided intake timing path uses ${scenario.turns.length} turns for ${scenario.id} via ${route}`, async ({ page }) => {
    await registerUser(page, `intake-timing-${scenario.id}-${Date.now()}`);
    await page.goto("/intake");

    await expect(page.getByText(/strength and conditioning training/i)).toBeVisible();

    const generate = page.getByRole("button", { name: /Generate training plan/i });
    await expect(generate).toBeDisabled();

    for (let index = 0; index < scenario.turns.length; index += 1) {
      await sendIntakeTurn(page, scenario.turns[index]);

      if (usesLiveAiBackend && (await generate.isEnabled())) {
        break;
      }

      if (!usesLiveAiBackend && index < scenario.turns.length - 1) {
        await expect(generate).toBeDisabled();
      }
    }

    await expect(page.getByText(/Click the magic wand|Ready\. Click the magic wand/i).first()).toBeVisible({ timeout: aiResponseTimeoutMs });
    await expect(generate).toBeEnabled();
    await expect(page.getByText("Plan Draft")).toHaveCount(0);
  });
}
