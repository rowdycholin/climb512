import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

export const TEST_PASSWORD = "Climb512!!";

export async function registerUser(page: Page, userId: string, password = TEST_PASSWORD) {
  await page.goto("/register");
  await page.fill('input[name="firstName"]', "Playwright");
  await page.fill('input[name="lastName"]', "User");
  await page.fill('input[name="email"]', `${userId}@example.test`);
  await page.fill('input[name="userId"]', userId);
  await page.fill('input[name="age"]', "28");
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="verifyPassword"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/intake/, { timeout: 10_000 });
}

export async function createPlanFromOnboarding(page: Page, options: { startDate?: string; daysPerWeek?: string } = {}) {
  await page.goto("/onboarding");
  await page.locator('label:has(input[name="goals"][value="send-project"])').click();
  await page.check('input[name="discipline"][value="bouldering"]');
  await page.selectOption('select[name="currentGrade"]', "V4");
  await page.selectOption('select[name="targetGrade"]', "V6");
  if (options.startDate) {
    await page.fill('input[name="startDate"]', options.startDate);
  }
  await page.selectOption('select[name="weeksDuration"]', "4");
  await page.selectOption('select[name="daysPerWeek"]', options.daysPerWeek ?? "2");
  await page.click('button:has-text("Generate My Training Plan")');
  await page.waitForURL(/\/plan\//, { timeout: 60_000 });
}

function runSql(sql: string) {
  const repoRoot = path.resolve(__dirname, "..", "..");
  execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "postgresql://climber:climber512@postgres:5432/climbapp",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    {
      cwd: repoRoot,
      stdio: "pipe",
    },
  );
}

export function readSqlValue(sql: string) {
  const repoRoot = path.resolve(__dirname, "..", "..");
  return execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "postgresql://climber:climber512@postgres:5432/climbapp",
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
      "-c",
      sql,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

export function dockerServiceUsesSimulator(service: "web" | "plan-worker") {
  const repoRoot = path.resolve(__dirname, "..", "..");

  try {
    const baseUrl = execFileSync(
      "docker",
      ["compose", "exec", "-T", service, "printenv", "ANTHROPIC_BASE_URL"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();

    return baseUrl === "http://simulator:8787";
  } catch {
    return false;
  }
}

function buildGenerationProfileSnapshot() {
  return {
    goals: ["Send a V6 boulder with steady progression"],
    currentGrade: "V4",
    targetGrade: "V6",
    age: 28,
    weeksDuration: 4,
    daysPerWeek: 3,
    equipment: ["climbing gym", "hangboard"],
    discipline: "bouldering",
    createdAt: "2026-04-29T12:00:00.000Z",
    planRequest: {
      sport: "climbing",
      disciplines: ["bouldering"],
      goalType: "ongoing",
      goalDescription: "Send V6 boulders with better power endurance.",
      targetDate: null,
      blockLengthWeeks: 4,
      daysPerWeek: 3,
      currentLevel: "V4",
      targetLevel: "V6",
      startDate: "2026-05-04",
      equipment: ["climbing gym", "hangboard"],
      trainingFocus: ["power endurance", "movement quality"],
      constraints: {
        injuries: [],
        limitations: [],
        avoidExercises: [],
      },
      strengthTraining: {
        include: false,
        focusAreas: [],
      },
    },
  };
}

function buildGeneratedWeeksSnapshot(weekNums: number[]) {
  return {
    weeks: weekNums.map((weekNum) => ({
      key: `week-${weekNum}`,
      weekNum,
      theme: weekNum === 1 ? "Base movement quality" : "Volume progression",
      days: Array.from({ length: 7 }, (_, index) => {
        const dayNum = index + 1;
        const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        const isTraining = [1, 3, 5].includes(dayNum);

        return {
          key: `w${weekNum}-d${dayNum}`,
          dayNum,
          dayName: dayNames[index],
          focus: isTraining ? "Project Climbing" : "Rest",
          isRest: !isTraining,
          sessions: isTraining
            ? [
                {
                  key: `w${weekNum}-d${dayNum}-s1-climbing`,
                  name: "Climbing Session",
                  description: "Warm up, climb quality attempts, and stop before form breaks.",
                  duration: 60,
                  exercises: [
                    {
                      key: `w${weekNum}-d${dayNum}-s1-e1-quality-boulders`,
                      name: "Quality boulder attempts",
                      sets: "4",
                      reps: "3 attempts",
                      duration: null,
                      rest: "2 min",
                      notes: "Keep attempts crisp and controlled.",
                    },
                  ],
                },
              ]
            : [],
        };
      }),
    })),
  };
}

export function seedPendingGenerationPlan(userId: string, suffix: string) {
  const planId = `pw-generation-plan-${suffix}`;
  const versionId = `pw-generation-version-${suffix}`;
  const jobId = `pw-generation-job-${suffix}`;
  const profileSnapshot = buildGenerationProfileSnapshot();
  const planSnapshot = { weeks: [] };

  const sql = `
    INSERT INTO "Plan" (
      "id", "userId", "title", "startDate", "generationStatus", "generationError", "generatedWeeks", "createdAt", "updatedAt"
    )
    SELECT
      '${planId}', "id", 'Worker generation test plan', '2026-05-04T00:00:00.000Z'::timestamptz,
      'generating', NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "User"
    WHERE "userId" = '${userId}';

    INSERT INTO "PlanVersion" (
      "id", "planId", "versionNum", "changeType", "changeSummary", "profileSnapshot", "planSnapshot"
    )
    VALUES (
      '${versionId}', '${planId}', 1, 'worker_generation_started', 'Initial plan shell from test seed',
      '${JSON.stringify(profileSnapshot).replace(/'/g, "''")}'::jsonb,
      '${JSON.stringify(planSnapshot).replace(/'/g, "''")}'::jsonb
    );

    UPDATE "Plan"
    SET "currentVersionId" = '${versionId}', "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = '${planId}';

    INSERT INTO "PlanGenerationJob" (
      "id", "planId", "userId", "status", "totalWeeks", "nextWeekNum", "lastError", "lockedAt", "createdAt", "updatedAt"
    )
    SELECT
      '${jobId}', '${planId}', "id", 'pending', 4, 1, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "User"
    WHERE "userId" = '${userId}';
  `;

  runSql(sql);

  return {
    planId,
    versionId,
    jobId,
  };
}

export function seedFailedGenerationPlan(userId: string, suffix: string) {
  const planId = `pw-repair-plan-${suffix}`;
  const versionId = `pw-repair-version-${suffix}`;
  const jobId = `pw-repair-job-${suffix}`;
  const profileSnapshot = buildGenerationProfileSnapshot();
  const planSnapshot = { weeks: [] };
  const generatedWeeks = buildGeneratedWeeksSnapshot([1, 2]).weeks;

  const sql = `
    INSERT INTO "Plan" (
      "id", "userId", "title", "startDate", "generationStatus", "generationError", "generatedWeeks", "createdAt", "updatedAt"
    )
    SELECT
      '${planId}', "id", 'Repair flow test plan', '2026-05-04T00:00:00.000Z'::timestamptz,
      'failed', 'Simulated AI failure', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "User"
    WHERE "userId" = '${userId}';

    INSERT INTO "PlanVersion" (
      "id", "planId", "versionNum", "changeType", "changeSummary", "profileSnapshot", "planSnapshot"
    )
    VALUES (
      '${versionId}', '${planId}', 1, 'worker_generation_started', 'Initial plan shell from test seed',
      '${JSON.stringify(profileSnapshot).replace(/'/g, "''")}'::jsonb,
      '${JSON.stringify(planSnapshot).replace(/'/g, "''")}'::jsonb
    );

    UPDATE "Plan"
    SET "currentVersionId" = '${versionId}', "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = '${planId}';

    INSERT INTO "PlanGenerationJob" (
      "id", "planId", "userId", "status", "totalWeeks", "nextWeekNum", "lastError", "lockedAt", "createdAt", "updatedAt"
    )
    SELECT
      '${jobId}', '${planId}', "id", 'failed', 4, 3, 'Simulated AI failure', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "User"
    WHERE "userId" = '${userId}';

    INSERT INTO "PlanGenerationWeek" (
      "id", "jobId", "planId", "userId", "weekNum", "status", "weekSnapshot", "createdAt", "updatedAt"
    )
    SELECT
      'pw-repair-week-${suffix}-1', '${jobId}', '${planId}', "id", 1, 'ready',
      '${JSON.stringify(generatedWeeks[0]).replace(/'/g, "''")}'::jsonb,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "User"
    WHERE "userId" = '${userId}';

    INSERT INTO "PlanGenerationWeek" (
      "id", "jobId", "planId", "userId", "weekNum", "status", "weekSnapshot", "createdAt", "updatedAt"
    )
    SELECT
      'pw-repair-week-${suffix}-2', '${jobId}', '${planId}', "id", 2, 'ready',
      '${JSON.stringify(generatedWeeks[1]).replace(/'/g, "''")}'::jsonb,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "User"
    WHERE "userId" = '${userId}';
  `;

  runSql(sql);

  return {
    planId,
    versionId,
    jobId,
  };
}
