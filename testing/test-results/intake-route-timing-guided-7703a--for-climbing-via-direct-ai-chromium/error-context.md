# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: intake-route-timing.spec.ts >> guided intake timing path uses 11 turns for climbing via direct-ai
- Location: tests/intake-route-timing.spec.ts:168:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/Click the magic wand|Ready\. Click the magic wand/i).first()
Expected: visible
Timeout: 120000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 120000ms
  - waiting for getByText(/Click the magic wand|Ready\. Click the magic wand/i).first()

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]:
          - generic [ref=e6]: c512
          - generic [ref=e7]:
            - paragraph [ref=e8]: Plan Intake
            - heading "Climb512" [level=1] [ref=e9]
            - paragraph [ref=e10]: Alex is your personal training coach. Tell me what you are training for, and we will shape a plan around your goals.
        - button "Open menu" [ref=e12] [cursor=pointer]:
          - img
    - main [ref=e13]:
      - generic [ref=e16]:
        - paragraph [ref=e17]: Guided Setup
        - heading "Build a plan through conversation" [level=1] [ref=e18]
        - generic [ref=e19]: Answer a few focused questions, then create a plan when the chat has what it needs.
      - generic [ref=e21]:
        - generic [ref=e22]:
          - img [ref=e23]
          - text: Guided Intake
        - generic [ref=e25]:
          - generic [ref=e26]: Hi, I'm Alex, your personal training coach. I’ll use what you tell me to build a plan that fits your goals, schedule, experience, equipment, and recovery needs. For now I can build plans for climbing, running, cycling, and strength and conditioning training. Which one would you like to train for?
          - generic [ref=e27]: Climbing, mostly bouldering.
          - generic [ref=e28]: Bouldering it is — nice, that gives us a clear climbing focus without getting lost in rope logistics. What would you like this plan to help you improve or work toward in your bouldering?
          - generic [ref=e29]: I want to send V7 on a trip on 2026-08-15.
          - generic [ref=e30]: V7 on 2026-08-15 is a real objective, and about 13 weeks gives us enough runway to build power, fingers, and project tactics without rushing it. What grade are you climbing consistently right now in bouldering?
          - generic [ref=e31]: 12 weeks.
          - generic [ref=e32]: Perfect — we’ll frame this as a 12-week build into the trip, which is tidy coaching math. What grade are you climbing consistently right now in bouldering?
          - generic [ref=e33]: I can train 4 days per week.
          - generic [ref=e34]: To pitch the sessions correctly, what is your current climbing level?
          - generic [ref=e35]: I prefer Monday, Wednesday, Friday, and Saturday training days.
          - generic [ref=e36]: Monday, Wednesday, Friday, and Saturday fits the 4-day rhythm nicely — that gives us room for a hard/easy flow instead of cramming. To set the grades and intensity correctly, what grade are you climbing consistently right now in bouldering?
          - generic [ref=e37]: Start on 2026-06-01.
          - generic [ref=e38]: June 1 is locked in — that gives us just under 11 weeks to sharpen things before the V7 trip on August 15. To set the grades and intensity correctly, what grade are you climbing consistently right now in bouldering?
          - generic [ref=e39]: Current level is around V5.
          - generic [ref=e40]: V5 to V7 by the trip is a solid jump, but it’s a very coachable one if we match the work to the tools you actually have. What climbing equipment or facilities will you have access to for training?
          - generic [ref=e41]: Indoor climbing gym, hangboard, dumbbells, and a spray wall.
          - generic [ref=e42]: Indoor gym, hangboard, dumbbells, and a spray wall is a strong setup for a V5-to-V7 bouldering block — plenty of tools, without needing to get too fancy. Do you have any injuries or pain I should account for?
          - generic [ref=e43]: Yes, include strength training for fingers and pulling strength.
          - generic [ref=e44]: Before I load this up, I want to keep it safe. Any injuries, pain, or movements I should account for?
          - generic [ref=e45]: No injuries or pain.
          - generic [ref=e46]: Do you want strength and conditioning included, or should this stay focused on the main sport?
          - generic [ref=e47]: Nothing else.
          - generic [ref=e48]: Got it — no extra add-ons beyond the climbing-specific finger and pulling strength work. Since you’re training Monday, Wednesday, Friday, and Saturday, are there any days you prefer to keep easier or fully off?
        - generic [ref=e49]:
          - paragraph [ref=e50]: Known so far
          - generic [ref=e51]:
            - generic [ref=e52]: "Sport: climbing"
            - generic [ref=e53]: "Goal: Send V7 on a climbing trip on 2026-08-15."
            - generic [ref=e54]: "Length: 11 weeks"
            - generic [ref=e55]: "Schedule: 4 days/week"
            - generic [ref=e56]: "Current: Around V5 bouldering."
            - generic [ref=e57]: "Start: 2026-06-01"
            - generic [ref=e58]: "Equipment: Indoor climbing gym, Hangboard, Dumbbells, Spray wall"
        - generic [ref=e59]:
          - textbox "Plan intake message" [active] [ref=e60]:
            - /placeholder: Answer the current question...
          - button "Send intake message" [disabled]:
            - img
        - generic [ref=e61]:
          - paragraph [ref=e62]: Answer the remaining questions to unlock plan creation.
          - button "Generate training plan locked" [disabled]:
            - img
  - alert [ref=e63]
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
      |                                                                                                ^ Error: expect(locator).toBeVisible() failed
  190 |     await expect(generate).toBeEnabled();
  191 |     await expect(page.getByText("Plan Draft")).toHaveCount(0);
  192 |   });
  193 | }
  194 | 
```