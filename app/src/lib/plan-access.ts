import { prisma } from "./prisma";
import {
  buildPlanView,
  findExerciseInSnapshot,
  parsePlanSnapshot,
  toStoredJson,
  type PlanSnapshot,
  type WeekSnapshot,
} from "./plan-snapshot";
import { composePlanSnapshotFromGeneratedWeeks } from "./plan-generation-state";

function parseWeekSnapshot(raw: unknown): WeekSnapshot {
  return raw as WeekSnapshot;
}

function snapshotForGenerationState(params: {
  currentSnapshot: PlanSnapshot;
  generationStatus: string;
  generationJobs: Array<{
    weeks: Array<{
      weekSnapshot: unknown;
    }>;
  }>;
}) {
  const rows = params.generationJobs[0]?.weeks ?? [];
  if (rows.length === 0) return params.currentSnapshot;

  const generatedSnapshot = composePlanSnapshotFromGeneratedWeeks(
    rows.map((row) => parseWeekSnapshot(row.weekSnapshot)),
  );

  if (
    params.generationStatus === "ready" &&
    params.currentSnapshot.weeks.length >= generatedSnapshot.weeks.length
  ) {
    return params.currentSnapshot;
  }

  return generatedSnapshot;
}

export async function findOwnedPlanById(planId: string, userId: string) {
  return prisma.plan.findFirst({
    where: {
      id: planId,
      userId,
    },
    include: {
      currentVersion: true,
    },
  });
}

export async function findOwnedPlanWithLogs(planId: string, userId: string) {
  const plan = await prisma.plan.findFirst({
    where: {
      id: planId,
      userId,
    },
    include: {
      currentVersion: true,
      versions: {
        orderBy: { versionNum: "desc" },
        select: {
          id: true,
          versionNum: true,
          changeType: true,
          changeSummary: true,
          effectiveFromWeek: true,
          effectiveFromDay: true,
          createdAt: true,
        },
      },
      generationJobs: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        include: {
          weeks: {
            orderBy: { weekNum: "asc" },
          },
        },
      },
      workoutLogs: {
        where: { userId },
        orderBy: { loggedAt: "desc" },
      },
    },
  });

  if (!plan || !plan.currentVersion) return null;

  const snapshot = snapshotForGenerationState({
    currentSnapshot: parsePlanSnapshot(plan.currentVersion.planSnapshot),
    generationStatus: plan.generationStatus,
    generationJobs: plan.generationJobs,
  });
  const view = buildPlanView(snapshot, plan.workoutLogs);

  return {
    ...plan,
    currentVersion: {
      ...plan.currentVersion,
      planSnapshot: snapshot,
    },
    planView: view,
  };
}

export interface WorkoutLogInput {
  planId: string;
  exerciseKey: string;
  userId: string;
  setsCompleted: number | null;
  repsCompleted: string | null;
  weightUsed: string | null;
  durationActual: string | null;
  notes: string | null;
  completed: boolean;
}

async function findAuthorizedExercise(planId: string, userId: string, exerciseKey: string) {
  const plan = await prisma.plan.findFirst({
    where: {
      id: planId,
      userId,
    },
    include: {
      currentVersion: true,
      generationJobs: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        include: {
          weeks: {
            orderBy: { weekNum: "asc" },
          },
        },
      },
    },
  });

  if (!plan?.currentVersion) return null;

  const snapshot = snapshotForGenerationState({
    currentSnapshot: parsePlanSnapshot(plan.currentVersion.planSnapshot),
    generationStatus: plan.generationStatus,
    generationJobs: plan.generationJobs,
  });
  const match = findExerciseInSnapshot(snapshot, exerciseKey);
  if (!match) return null;

  return {
    plan,
    snapshot,
    match,
  };
}

export async function upsertExerciseLogForUser(input: WorkoutLogInput) {
  const authorized = await findAuthorizedExercise(input.planId, input.userId, input.exerciseKey);
  if (!authorized) {
    return { error: "Not authorized" as const };
  }

  const { plan, match } = authorized;

  await prisma.workoutLog.upsert({
    where: {
      userId_planId_exerciseKey: {
        userId: input.userId,
        planId: input.planId,
        exerciseKey: input.exerciseKey,
      },
    },
    create: {
      userId: input.userId,
      planId: input.planId,
      planVersionId: plan.currentVersionId!,
      weekNum: match.week.weekNum,
      dayNum: match.day.dayNum,
      sessionKey: match.session.key,
      exerciseKey: input.exerciseKey,
      exerciseName: match.exercise.name,
      prescribedSnapshot: toStoredJson(match.exercise),
      setsCompleted: input.setsCompleted,
      repsCompleted: input.repsCompleted,
      weightUsed: input.weightUsed,
      durationActual: input.durationActual,
      notes: input.notes,
      completed: input.completed,
    },
    update: {
      planVersionId: plan.currentVersionId!,
      weekNum: match.week.weekNum,
      dayNum: match.day.dayNum,
      sessionKey: match.session.key,
      exerciseName: match.exercise.name,
      prescribedSnapshot: toStoredJson(match.exercise),
      setsCompleted: input.setsCompleted,
      repsCompleted: input.repsCompleted,
      weightUsed: input.weightUsed,
      durationActual: input.durationActual,
      notes: input.notes,
      completed: input.completed,
      loggedAt: new Date(),
    },
  });

  return { ok: true as const };
}

export function clonePlanSnapshot(snapshot: PlanSnapshot): PlanSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as PlanSnapshot;
}
