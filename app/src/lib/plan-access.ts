import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export const ownedPlanInclude = {
  profile: true,
  weeks: {
    orderBy: { weekNum: "asc" },
    include: {
      days: {
        orderBy: { dayNum: "asc" },
        include: {
          sessions: {
            include: {
              exercises: {
                orderBy: { order: "asc" },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.TrainingPlanInclude;

export async function findOwnedPlanById(planId: string, userId: string) {
  return prisma.trainingPlan.findFirst({
    where: {
      id: planId,
      profile: { userId },
    },
    include: ownedPlanInclude,
  });
}

export async function findOwnedPlanWithUserLogs(planId: string, userId: string) {
  return prisma.trainingPlan.findFirst({
    where: {
      id: planId,
      profile: { userId },
    },
    include: {
      profile: true,
      weeks: {
        orderBy: { weekNum: "asc" },
        include: {
          days: {
            orderBy: { dayNum: "asc" },
            include: {
              sessions: {
                include: {
                  exercises: {
                    orderBy: { order: "asc" },
                    include: {
                      logs: { where: { userId } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

export interface ExerciseLogInput {
  exerciseId: string;
  userId: string;
  setsCompleted: number | null;
  repsCompleted: string | null;
  weightUsed: string | null;
  durationActual: string | null;
  notes: string | null;
  completed: boolean;
}

export async function userCanAccessExercise(userId: string, exerciseId: string) {
  const exercise = await prisma.exercise.findFirst({
    where: {
      id: exerciseId,
      session: {
        day: {
          week: {
            plan: {
              profile: { userId },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  return Boolean(exercise);
}

export async function upsertExerciseLogForUser(input: ExerciseLogInput) {
  const isAuthorized = await userCanAccessExercise(input.userId, input.exerciseId);
  if (!isAuthorized) {
    return { error: "Not authorized" as const };
  }

  await prisma.exerciseLog.upsert({
    where: {
      exerciseId_userId: {
        exerciseId: input.exerciseId,
        userId: input.userId,
      },
    },
    create: {
      exerciseId: input.exerciseId,
      userId: input.userId,
      setsCompleted: input.setsCompleted,
      repsCompleted: input.repsCompleted,
      weightUsed: input.weightUsed,
      durationActual: input.durationActual,
      notes: input.notes,
      completed: input.completed,
    },
    update: {
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
