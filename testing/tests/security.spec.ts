process.env.DATABASE_URL ??= "postgresql://climber:climber512@localhost:5432/climbapp";

import { test, expect } from "@playwright/test";
import { prisma } from "../../app/src/lib/prisma";
import { upsertExerciseLogForUser } from "../../app/src/lib/plan-access";

function uniqueName(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function registerUser(page: import("@playwright/test").Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Register" }).click();
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/onboarding/);
}

async function loginUser(page: import("@playwright/test").Page, username: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|onboarding)/);
}

async function logoutUser(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Logout" }).click();
  await page.waitForURL(/\/login/);
}

async function seedPlanForUser(userId: string) {
  const profile = await prisma.trainingProfile.create({
    data: {
      userId,
      goals: ["security-test"],
      currentGrade: "V4",
      targetGrade: "V5",
      age: 30,
      weeksDuration: 4,
      daysPerWeek: 3,
      equipment: ["hangboard"],
    },
  });

  const plan = await prisma.trainingPlan.create({
    data: {
      profileId: profile.id,
      weeks: {
        create: [
          {
            weekNum: 1,
            theme: "Security Test Week",
            days: {
              create: [
                {
                  dayNum: 1,
                  dayName: "Monday",
                  focus: "Finger Strength",
                  isRest: false,
                  sessions: {
                    create: [
                      {
                        name: "Limit Session",
                        description: "Seeded test session",
                        duration: 45,
                        exercises: {
                          create: [
                            {
                              name: "Seeded exercise",
                              sets: "3",
                              reps: "5",
                              notes: "Security check",
                              order: 0,
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    include: {
      weeks: {
        include: {
          days: {
            include: {
              sessions: {
                include: {
                  exercises: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const exerciseId = plan.weeks[0].days[0].sessions[0].exercises[0].id;
  return { planId: plan.id, exerciseId };
}

test.describe("Security boundaries", () => {
  test("prevents one user from viewing another user's plan", async ({ page }) => {
    const ownerUsername = uniqueName("plan-owner");
    const viewerUsername = uniqueName("plan-viewer");
    const password = "climbin512!";

    const owner = await prisma.user.create({
      data: {
        username: ownerUsername,
        passwordHash: "$2b$10$6PEMAvzkdxl3pNGdisz8nOKHReRrzNRXS6jttuPAHyBs64K6TfGs2",
      },
    });
    const { planId } = await seedPlanForUser(owner.id);

    await registerUser(page, viewerUsername, password);
    await logoutUser(page);
    await loginUser(page, viewerUsername, password);

    const response = await page.goto(`/plan/${planId}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/could not be found/i)).toBeVisible();
    await expect(page.getByText("Security Test Week")).toHaveCount(0);
  });

  test("rejects exercise log writes for a different user's exercise", async () => {
    const owner = await prisma.user.create({
      data: {
        username: uniqueName("log-owner"),
        passwordHash: "not-used-in-this-test",
      },
    });
    const attacker = await prisma.user.create({
      data: {
        username: uniqueName("log-attacker"),
        passwordHash: "not-used-in-this-test",
      },
    });
    const { exerciseId } = await seedPlanForUser(owner.id);

    const result = await upsertExerciseLogForUser({
      exerciseId,
      userId: attacker.id,
      setsCompleted: 2,
      repsCompleted: "4",
      weightUsed: null,
      durationActual: null,
      notes: "should fail",
      completed: true,
    });

    expect(result).toEqual({ error: "Not authorized" });

    const blockedLog = await prisma.exerciseLog.findUnique({
      where: {
        exerciseId_userId: {
          exerciseId,
          userId: attacker.id,
        },
      },
    });
    expect(blockedLog).toBeNull();
  });

  test("still allows the plan owner to log their own exercise", async () => {
    const owner = await prisma.user.create({
      data: {
        username: uniqueName("log-self"),
        passwordHash: "not-used-in-this-test",
      },
    });
    const { exerciseId } = await seedPlanForUser(owner.id);

    const result = await upsertExerciseLogForUser({
      exerciseId,
      userId: owner.id,
      setsCompleted: 3,
      repsCompleted: "5",
      weightUsed: "bodyweight",
      durationActual: "10 min",
      notes: "completed as expected",
      completed: true,
    });

    expect(result).toEqual({ ok: true });

    const savedLog = await prisma.exerciseLog.findUnique({
      where: {
        exerciseId_userId: {
          exerciseId,
          userId: owner.id,
        },
      },
    });
    expect(savedLog).not.toBeNull();
    expect(savedLog?.completed).toBe(true);
    expect(savedLog?.setsCompleted).toBe(3);
  });
});
