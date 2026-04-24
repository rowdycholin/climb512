"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { upsertExerciseLogForUser } from "@/lib/plan-access";
import type { PlanInput } from "@/lib/plan-generator";
import { generatePlanWithAI } from "@/lib/ai-plan-generator";

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

  const profile = await prisma.trainingProfile.create({
    data: {
      userId: session.userId,
      goals: input.goals,
      currentGrade: input.currentGrade,
      targetGrade: input.targetGrade,
      age: input.age,
      weeksDuration: input.weeksDuration,
      daysPerWeek: input.daysPerWeek,
      equipment: input.equipment,
    },
  });

  const weekData = await generatePlanWithAI(input);

  const plan = await prisma.trainingPlan.create({ data: { profileId: profile.id } });

  for (const w of weekData) {
    const week = await prisma.week.create({
      data: { planId: plan.id, weekNum: w.weekNum, theme: w.theme },
    });
    for (const d of w.days) {
      const day = await prisma.day.create({
        data: { weekId: week.id, dayNum: d.dayNum, dayName: d.dayName, focus: d.focus, isRest: d.isRest },
      });
      for (const s of d.sessions) {
        const sess = await prisma.daySession.create({
          data: { dayId: day.id, name: s.name, description: s.description, duration: typeof s.duration === "string" ? parseInt(s.duration, 10) || 45 : (s.duration ?? 45) },
        });
        for (let i = 0; i < s.exercises.length; i++) {
          const ex = s.exercises[i];
          await prisma.exercise.create({
            data: { sessionId: sess.id, name: ex.name, sets: ex.sets, reps: ex.reps, duration: ex.duration, rest: ex.rest, notes: ex.notes, order: i },
          });
        }
      }
    }
  }

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
