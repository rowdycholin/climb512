"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { getSession, getSessionBootId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { upsertExerciseLogForUser } from "@/lib/plan-access";
import type { PlanInput } from "@/lib/plan-generator";
import type { Prisma } from "@prisma/client";
import { generatePlanWithAI } from "@/lib/ai-plan-generator";

function normalizeSessionDuration(duration: number | string | undefined) {
  if (typeof duration === "number") return duration;
  if (typeof duration === "string") return parseInt(duration, 10) || 45;
  return 45;
}

function buildNestedPlanData(weeks: Awaited<ReturnType<typeof generatePlanWithAI>>): Prisma.TrainingPlanCreateWithoutProfileInput {
  return {
    weeks: {
      create: weeks.map((week) => ({
        weekNum: week.weekNum,
        theme: week.theme,
        days: {
          create: week.days.map((day) => ({
            dayNum: day.dayNum,
            dayName: day.dayName,
            focus: day.focus,
            isRest: day.isRest,
            sessions: {
              create: day.sessions.map((session) => ({
                name: session.name,
                description: session.description,
                duration: normalizeSessionDuration(session.duration),
                exercises: {
                  create: session.exercises.map((exercise, index) => ({
                    name: exercise.name,
                    sets: exercise.sets,
                    reps: exercise.reps,
                    duration: exercise.duration,
                    rest: exercise.rest,
                    notes: exercise.notes,
                    order: index,
                  })),
                },
              })),
            },
          })),
        },
      })),
    },
  };
}

export async function login(_prevState: unknown, formData: FormData) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Invalid username or password" };
  }

  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  session.isLoggedIn = true;
  session.bootId = getSessionBootId();
  await session.save();

  const existingPlan = await prisma.trainingPlan.findFirst({
    where: { profile: { userId: user.id } },
  });
  redirect(existingPlan ? "/dashboard" : "/onboarding");
}

export async function register(_prevState: unknown, formData: FormData) {
  const username = (formData.get("username") as string).trim();
  const password = formData.get("password") as string;

  if (!username || !password) return { error: "Username and password are required" };
  if (username.length < 3) return { error: "Username must be at least 3 characters" };
  if (password.length < 8) return { error: "Password must be at least 8 characters" };

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return { error: "Username already taken" };

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { username, passwordHash } });

  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  session.isLoggedIn = true;
  session.bootId = getSessionBootId();
  await session.save();

  redirect("/onboarding");
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}

export async function createPlan(formData: FormData) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const goals = formData.getAll("goals") as string[];
  const customGoal = formData.get("customGoal") as string;
  const allGoals = customGoal ? [...goals, customGoal] : goals;

  const equipment = formData.getAll("equipment") as string[];
  const customEquipment = formData.get("customEquipment") as string;
  const allEquipment = customEquipment
    ? [...equipment, ...customEquipment.split(",").map((s) => s.trim()).filter(Boolean)]
    : equipment;

  const input: PlanInput = {
    goals: allGoals,
    currentGrade: formData.get("currentGrade") as string,
    targetGrade: formData.get("targetGrade") as string,
    age: parseInt(formData.get("age") as string, 10),
    weeksDuration: parseInt(formData.get("weeksDuration") as string, 10),
    daysPerWeek: parseInt(formData.get("daysPerWeek") as string, 10),
    equipment: allEquipment,
    discipline: (formData.get("discipline") as string) || "bouldering",
  };

  const weekData = await generatePlanWithAI(input);
  const plan = await prisma.$transaction(async (tx) => {
    const profile = await tx.trainingProfile.create({
      data: {
        userId: session.userId,
        goals: input.goals,
        currentGrade: input.currentGrade,
        targetGrade: input.targetGrade,
        age: input.age,
        weeksDuration: input.weeksDuration,
        daysPerWeek: input.daysPerWeek,
        equipment: input.equipment,
        plans: {
          create: [buildNestedPlanData(weekData)],
        },
      },
      include: {
        plans: {
          select: { id: true },
          take: 1,
        },
      },
    });

    return profile.plans[0];
  });

  redirect(`/plan/${plan.id}`);
}

async function cascadeDeletePlan(planId: string) {
  const weeks = await prisma.week.findMany({ where: { planId } });
  for (const week of weeks) {
    const days = await prisma.day.findMany({ where: { weekId: week.id } });
    for (const day of days) {
      const sessions = await prisma.daySession.findMany({ where: { dayId: day.id } });
      for (const sess of sessions) {
        const exercises = await prisma.exercise.findMany({ where: { sessionId: sess.id } });
        for (const ex of exercises) {
          await prisma.exerciseLog.deleteMany({ where: { exerciseId: ex.id } });
        }
        await prisma.exercise.deleteMany({ where: { sessionId: sess.id } });
      }
      await prisma.daySession.deleteMany({ where: { dayId: day.id } });
    }
    await prisma.day.deleteMany({ where: { weekId: week.id } });
  }
  await prisma.week.deleteMany({ where: { planId } });
  await prisma.trainingPlan.delete({ where: { id: planId } });
}

export async function deletePlan(formData: FormData) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const planId = formData.get("planId") as string;
  const plan = await prisma.trainingPlan.findFirst({
    where: { id: planId, profile: { userId: session.userId } },
  });
  if (!plan) return;

  await cascadeDeletePlan(planId);
  redirect("/dashboard");
}

export async function deletePlans(formData: FormData) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const planIds = formData.getAll("planIds") as string[];

  for (const planId of planIds) {
    const plan = await prisma.trainingPlan.findFirst({
      where: { id: planId, profile: { userId: session.userId } },
    });
    if (!plan) continue;
    await cascadeDeletePlan(planId);
  }

  redirect("/dashboard");
}

export async function logExercise(formData: FormData) {
  const session = await getSession();
  if (!session.isLoggedIn) return { error: "Not authenticated" };

  const exerciseId = formData.get("exerciseId") as string;
  const setsCompleted = formData.get("setsCompleted") ? parseInt(formData.get("setsCompleted") as string, 10) : null;
  const repsCompleted = (formData.get("repsCompleted") as string) || null;
  const weightUsed = (formData.get("weightUsed") as string) || null;
  const durationActual = (formData.get("durationActual") as string) || null;
  const notes = (formData.get("notes") as string) || null;
  const completed = formData.get("completed") === "true";

  return upsertExerciseLogForUser({
    exerciseId,
    userId: session.userId,
    setsCompleted,
    repsCompleted,
    weightUsed,
    durationActual,
    notes,
    completed,
  });
}
