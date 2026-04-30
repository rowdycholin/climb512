import { NextResponse } from "next/server";
import { adjustFuturePlan, logExercise, revertPlanVersion, saveEditedWeek } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { parsePlanSnapshot } from "@/lib/plan-snapshot";

type AttackAction = "logExercise" | "saveEditedWeek" | "adjustFuturePlan" | "revertPlanVersion";

function testRoutesEnabled() {
  const explicitlyEnabled = process.env.ENABLE_TEST_ROUTES === "1";
  const nonProduction = process.env.NODE_ENV !== "production" && process.env.ENABLE_TEST_ROUTES !== "0";
  const localSimulatorMode =
    process.env.AI_MODE === "simulate" &&
    process.env.ANTHROPIC_BASE_URL === "http://simulator:8787" &&
    process.env.SESSION_SECRET?.includes("change-in-production");

  return explicitlyEnabled || nonProduction || localSimulatorMode;
}

async function findFirstExerciseKey(planId: string) {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { currentVersion: true },
  });

  if (!plan?.currentVersion) return null;

  const snapshot = parsePlanSnapshot(plan.currentVersion.planSnapshot);
  for (const week of snapshot.weeks) {
    for (const day of week.days) {
      for (const session of day.sessions) {
        const exercise = session.exercises[0];
        if (exercise) return exercise.key;
      }
    }
  }

  return null;
}

async function getPlanCounts(planId: string) {
  const [workoutLogs, versions] = await Promise.all([
    prisma.workoutLog.count({ where: { planId } }),
    prisma.planVersion.count({ where: { planId } }),
  ]);

  return { workoutLogs, versions };
}

async function buildAttackFormData(action: AttackAction, planId: string) {
  const formData = new FormData();
  formData.set("planId", planId);

  if (action === "logExercise") {
    const exerciseKey = await findFirstExerciseKey(planId);
    if (!exerciseKey) return { error: "No exercise found for attack fixture" };

    formData.set("exerciseId", exerciseKey);
    formData.set("setsCompleted", "1");
    formData.set("repsCompleted", "1");
    formData.set("completed", "true");
    return { formData };
  }

  if (action === "saveEditedWeek") {
    formData.set("weekId", "week-1");
    formData.set("editedWeek", JSON.stringify({ id: "week-1", weekNum: 1, theme: "Forged edit", days: [] }));
    return { formData };
  }

  if (action === "revertPlanVersion") {
    const version = await prisma.planVersion.findFirst({
      where: { planId },
      orderBy: { versionNum: "asc" },
      select: { id: true },
    });
    if (!version) return { error: "No version found for attack fixture" };

    formData.set("versionId", version.id);
    return { formData };
  }

  formData.set("reason", "too_easy");
  formData.set("feedback", "Make the stolen plan much harder.");
  return { formData };
}

export async function POST(request: Request) {
  if (!testRoutesEnabled()) {
    return NextResponse.json({ error: "Test routes are disabled" }, { status: 404 });
  }

  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { action?: AttackAction; planId?: string } | null;
  const action = body?.action;
  const planId = body?.planId;

  if (action !== "logExercise" && action !== "saveEditedWeek" && action !== "adjustFuturePlan" && action !== "revertPlanVersion") {
    return NextResponse.json({ error: "Unsupported attack action" }, { status: 400 });
  }

  if (!planId) {
    return NextResponse.json({ error: "Missing planId" }, { status: 400 });
  }

  const before = await getPlanCounts(planId);
  const formBuild = await buildAttackFormData(action, planId);
  if ("error" in formBuild) {
    const after = await getPlanCounts(planId);
    return NextResponse.json({
      action,
      result: { error: formBuild.error },
      before,
      after,
    });
  }

  let result: unknown;
  try {
    result =
      action === "logExercise"
        ? await logExercise(formBuild.formData)
        : action === "saveEditedWeek"
          ? await saveEditedWeek(formBuild.formData)
          : action === "adjustFuturePlan"
            ? await adjustFuturePlan(formBuild.formData)
            : await revertPlanVersion(formBuild.formData);
  } catch (error) {
    result = { error: error instanceof Error ? error.message : String(error) };
  }
  const after = await getPlanCounts(planId);

  return NextResponse.json({
    action,
    result,
    before,
    after,
  });
}
