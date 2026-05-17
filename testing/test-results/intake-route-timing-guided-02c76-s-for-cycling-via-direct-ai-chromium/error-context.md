# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: intake-route-timing.spec.ts >> guided intake timing path uses 11 turns for cycling via direct-ai
- Location: tests/intake-route-timing.spec.ts:168:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/Click the magic wand|Ready\. Click the magic wand/i).first()
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 120000ms
  - waiting for getByText(/Click the magic wand|Ready\. Click the magic wand/i).first()

```

```
Error: write EPIPE
```

# Test source

```ts
  89  |       "I want to send V7 on a trip on 2026-08-15.",
  90  |       "12 weeks.",
  91  |       "I can train 4 days per week.",
  92  |       "I prefer Monday, Wednesday, Friday, and Saturday training days.",
  93  |       "Start on 2026-06-01.",
  94  |       "Current level is around V5.",
  95  |       "Indoor climbing gym, hangboard, dumbbells, and a spray wall.",
  96  |       "Yes, include strength training for fingers and pulling strength.",
  97  |       "No injuries or pain.",
  98  |       "Nothing else.",
  99  |     ],
  100 |   },
  101 |   {
  102 |     id: "cycling",
  103 |     turns: [
  104 |       "Cycling.",
  105 |       "I want to train for a century ride event on 2026-09-20.",
  106 |       "16 weeks.",
  107 |       "I can train 4 days per week.",
  108 |       "I prefer Tuesday, Thursday, Saturday, and Sunday training days.",
  109 |       "Monday, Wednesday, and Friday can be rest or easy recovery days.",
  110 |       "Start on 2026-06-01.",
  111 |       "Intermediate rider; I ride about 60 miles per week and can handle 2 hour rides.",
  112 |       "Road bike, indoor trainer, heart rate monitor, and dumbbells.",
  113 |       "No injuries or pain. Yes, include strength training for core and posterior chain.",
  114 |       "Nothing else.",
  115 |     ],
  116 |   },
  117 |   {
  118 |     id: "running",
  119 |     turns: [
  120 |       "Running.",
  121 |       "I want to run a 10K race on 2026-08-01.",
  122 |       "12 weeks.",
  123 |       "I can train 4 days per week.",
  124 |       "I prefer Monday, Wednesday, Friday, and Saturday training days.",
  125 |       "Tuesday, Thursday, and Sunday can be rest or easy recovery days.",
  126 |       "Start on 2026-06-01.",
  127 |       "Intermediate recreational runner; I run about 15 miles per week right now.",
  128 |       "Road shoes, treadmill, GPS watch, and dumbbells.",
  129 |       "No injuries or pain.",
  130 |       "No strength training for now.",
  131 |       "Nothing else.",
  132 |     ],
  133 |   },
  134 |   {
  135 |     id: "strength-and-conditioning",
  136 |     turns: [
  137 |       "Strength and conditioning.",
  138 |       "I want a 12 week strength and conditioning block for full-body strength and work capacity.",
  139 |       "I can train 5 days per week.",
  140 |       "I prefer Monday through Friday training days.",
  141 |       "Saturday and Sunday can be rest or light recovery days.",
  142 |       "Start on 2026-06-01.",
  143 |       "Intermediate lifter.",
  144 |       "Full gym with barbells, machines, cables, dumbbells, and a pull-up bar.",
  145 |       "No injuries, pain, or movement restrictions.",
  146 |       "Nothing else.",
  147 |     ],
  148 |   },
  149 | ];
  150 | 
  151 | const scenarios = usesLiveAiBackend ? liveBackendScenarios : simulatorScenarios;
  152 | 
  153 | async function sendIntakeTurn(page: Page, turn: string) {
  154 |   const entry = page.getByLabel("Plan intake message");
  155 |   const send = page.getByRole("button", { name: "Send intake message" });
  156 | 
  157 |   await entry.fill(turn);
  158 |   await send.click();
  159 |   await expect(page.getByText(turn).last()).toBeVisible();
  160 | 
  161 |   await expect(page.getByText("Checking your answer...")).toBeVisible({ timeout: 5_000 }).catch(() => {});
  162 |   await expect(page.getByText("Checking your answer...")).toHaveCount(0, { timeout: aiResponseTimeoutMs });
  163 |   await expect(page.getByText(/Still working\. The AI backend is taking longer than usual\./)).toHaveCount(0, { timeout: aiResponseTimeoutMs });
  164 |   await expect(entry).toBeEditable({ timeout: aiResponseTimeoutMs });
  165 | }
  166 | 
  167 | for (const scenario of scenarios) {
  168 |   test(`guided intake timing path uses ${scenario.turns.length} turns for ${scenario.id} via ${route}`, async ({ page }) => {
  169 |     await registerUser(page, `intake-timing-${scenario.id}-${Date.now()}`);
  170 |     await page.goto("/intake");
  171 | 
  172 |     await expect(page.getByText(/strength and conditioning training/i)).toBeVisible();
  173 | 
  174 |     const generate = page.getByRole("button", { name: /Generate training plan/i });
  175 |     await expect(generate).toBeDisabled();
  176 | 
  177 |     for (let index = 0; index < scenario.turns.length; index += 1) {
  178 |       await sendIntakeTurn(page, scenario.turns[index]);
  179 | 
  180 |       if (usesLiveAiBackend && (await generate.isEnabled())) {
  181 |         break;
  182 |       }
  183 | 
  184 |       if (!usesLiveAiBackend && index < scenario.turns.length - 1) {
  185 |         await expect(generate).toBeDisabled();
  186 |       }
  187 |     }
  188 | 
> 189 |     await expect(page.getByText(/Click the magic wand|Ready\. Click the magic wand/i).first()).toBeVisible({ timeout: aiResponseTimeoutMs });
      |     ^ Error: write EPIPE
  190 |     await expect(generate).toBeEnabled();
  191 |     await expect(page.getByText("Plan Draft")).toHaveCount(0);
  192 |   });
  193 | }
  194 | 
```