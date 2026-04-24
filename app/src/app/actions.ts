"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, getSessionBootId } from "@/lib/session";
import {
  buildPlanSnapshot,
  createProfileSnapshot,
  parsePlanSnapshot,
  parseProfileSnapshot,
  toStoredJson,
  type PlanSnapshot,
  type ProfileSnapshot,
} from "@/lib/plan-snapshot";
import { generatePlanWithAI } from "@/lib/ai-plan-generator";
import type { PlanInput } from "@/lib/plan-types";
import { findOwnedPlanById, findOwnedPlanWithLogs, upsertExerciseLogForUser } from "@/lib/plan-access";
import {
  adjustmentModeSchema,
  buildDifficultySnapshot,
  buildReorderedSnapshot,
  generatePlanAdjustment,
  type ComparableWeek,
  planAdjustmentProposalSchema,
  type PlanAdjustmentProposal,
  validateAdjustmentProposal,
} from "@/lib/ai-plan-adjuster";

export interface PlanAdjustmentResponse {
  error?: string;
  proposal?: string;
  summary?: string;
  changes?: string[];
  weekKey?: string;
  mode?: "reorder" | "difficulty";
}

function toPlanInput(formData: FormData): PlanInput {
  const goals = formData.getAll("goals") as string[];
  const customGoal = (formData.get("customGoal") as string | null)?.trim();
  const equipment = formData.getAll("equipment") as string[];
  const customEquipment = (formData.get("customEquipment") as string | null)?.trim();

  return {
    goals: customGoal ? [...goals, customGoal] : goals,
    currentGrade: formData.get("currentGrade") as string,
    targetGrade: formData.get("targetGrade") as string,
    age: parseInt(formData.get("age") as string, 10),
    weeksDuration: parseInt(formData.get("weeksDuration") as string, 10),
    daysPerWeek: parseInt(formData.get("daysPerWeek") as string, 10),
    equipment: customEquipment
      ? [...equipment, ...customEquipment.split(",").map((item) => item.trim()).filter(Boolean)]
      : equipment,
    discipline: (formData.get("discipline") as string) || "bouldering",
  };
}

async function createPlanVersion(params: {
  planId: string;
  profileSnapshot: ProfileSnapshot;
  planSnapshot: PlanSnapshot;
  changeType: string;
  changeSummary?: string | null;
  basedOnVersionId?: string | null;
  effectiveFromWeek?: number | null;
}) {
  const { planId, profileSnapshot, planSnapshot, changeType, changeSummary, basedOnVersionId, effectiveFromWeek } = params;

  const latest = await prisma.planVersion.findFirst({
    where: { planId },
    orderBy: { versionNum: "desc" },
    select: { versionNum: true },
  });

  const version = await prisma.planVersion.create({
    data: {
      planId,
      versionNum: (latest?.versionNum ?? 0) + 1,
      basedOnVersionId: basedOnVersionId ?? null,
      changeType,
      changeSummary: changeSummary ?? null,
      effectiveFromWeek: effectiveFromWeek ?? null,
      profileSnapshot: toStoredJson(profileSnapshot),
      planSnapshot: toStoredJson(planSnapshot),
    },
  });

  await prisma.plan.update({
    where: { id: planId },
    data: {
      currentVersionId: version.id,
      updatedAt: new Date(),
    },
  });

  return version;
}

function buildComparableWeek(snapshot: PlanSnapshot, weekKey: string): ComparableWeek | null {
  const week = snapshot.weeks.find((item) => item.key === weekKey);
  if (!week) return null;

  return {
    id: week.key,
    theme: week.theme,
    days: week.days.map((day) => ({
      id: day.key,
      dayNum: day.dayNum,
      dayName: day.dayName,
      focus: day.focus,
      isRest: day.isRest,
      sessions: day.sessions.map((session) => ({
        id: session.key,
        name: session.name,
        description: session.description,
        duration: session.duration,
        exercises: session.exercises.map((exercise, index) => ({
          id: exercise.key,
          name: exercise.name,
          sets: exercise.sets ?? null,
          reps: exercise.reps ?? null,
          duration: exercise.duration ?? null,
          rest: exercise.rest ?? null,
          notes: exercise.notes ?? null,
          order: index,
        })),
      })),
    })),
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

  const existingPlan = await prisma.plan.findFirst({
    where: { userId: user.id },
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

  const input = toPlanInput(formData);
  const weeks = await generatePlanWithAI(input);
  const profileSnapshot = createProfileSnapshot(input);
  const planSnapshot = buildPlanSnapshot(weeks);

  const plan = await prisma.plan.create({
    data: {
      userId: session.userId,
      title: `${input.currentGrade} → ${input.targetGrade}`,
    },
  });

  await createPlanVersion({
    planId: plan.id,
    profileSnapshot,
    planSnapshot,
    changeType: "generated",
    changeSummary: "Initial AI-generated plan",
  });

  redirect(`/plan/${plan.id}`);
}

export async function deletePlan(formData: FormData) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const planId = formData.get("planId") as string;
  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId: session.userId },
  });
  if (!plan) return;

  await prisma.plan.delete({ where: { id: planId } });
  redirect("/dashboard");
}

export async function deletePlans(formData: FormData) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const planIds = formData.getAll("planIds") as string[];
  await prisma.plan.deleteMany({
    where: {
      userId: session.userId,
      id: { in: planIds },
    },
  });

  redirect("/dashboard");
}

export async function logExercise(formData: FormData) {
  const session = await getSession();
  if (!session.isLoggedIn) return { error: "Not authenticated" };

  const planId = formData.get("planId") as string;
  const exerciseKey = formData.get("exerciseId") as string;
  const setsCompleted = formData.get("setsCompleted") ? parseInt(formData.get("setsCompleted") as string, 10) : null;
  const repsCompleted = (formData.get("repsCompleted") as string) || null;
  const weightUsed = (formData.get("weightUsed") as string) || null;
  const durationActual = (formData.get("durationActual") as string) || null;
  const notes = (formData.get("notes") as string) || null;
  const completed = formData.get("completed") === "true";

  return upsertExerciseLogForUser({
    planId,
    exerciseKey,
    userId: session.userId,
    setsCompleted,
    repsCompleted,
    weightUsed,
    durationActual,
    notes,
    completed,
  });
}

export async function suggestPlanAdjustment(formData: FormData): Promise<PlanAdjustmentResponse> {
  const session = await getSession();
  if (!session.isLoggedIn) return { error: "Please sign in again" };

  const planId = formData.get("planId");
  const weekKey = formData.get("weekId");
  const mode = formData.get("mode");
  const request = (formData.get("request") as string | null)?.trim() ?? "";

  if (typeof planId !== "string" || typeof weekKey !== "string" || typeof mode !== "string") {
    return { error: "Missing adjustment details" };
  }

  if (!request) return { error: "Tell the coach what you want to change first" };

  const parsedMode = adjustmentModeSchema.safeParse(mode);
  if (!parsedMode.success) return { error: "Unsupported adjustment type" };

  const plan = await findOwnedPlanWithLogs(planId, session.userId);
  if (!plan) return { error: "Plan not found" };

  const comparableWeek = buildComparableWeek(plan.currentVersion.planSnapshot, weekKey);
  if (!comparableWeek) return { error: "Week not found" };

  const weekNum = parseInt(weekKey.replace("week-", ""), 10);
  const hasLogs = plan.workoutLogs.some((log) => log.weekNum === weekNum);
  if (hasLogs) {
    return { error: "Adjustments are only available before you start logging that week" };
  }

  const profileSnapshot = parseProfileSnapshot(plan.currentVersion.profileSnapshot);

  try {
    const proposal = await generatePlanAdjustment(profileSnapshot, comparableWeek, parsedMode.data, request);
    return {
      proposal: JSON.stringify(proposal),
      summary: proposal.summary,
      changes: proposal.changes,
      weekKey,
      mode: parsedMode.data,
    };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export async function applyPlanAdjustment(formData: FormData): Promise<{ error?: string; ok?: true }> {
  const session = await getSession();
  if (!session.isLoggedIn) return { error: "Please sign in again" };

  const planId = formData.get("planId");
  const weekKey = formData.get("weekId");
  const proposalRaw = formData.get("proposal");
  const mode = formData.get("mode");

  if (typeof planId !== "string" || typeof weekKey !== "string" || typeof proposalRaw !== "string" || typeof mode !== "string") {
    return { error: "Missing adjustment payload" };
  }

  const parsedMode = adjustmentModeSchema.safeParse(mode);
  if (!parsedMode.success) return { error: "Unsupported adjustment type" };

  const plan = await findOwnedPlanById(planId, session.userId);
  if (!plan?.currentVersion) return { error: "Plan not found" };

  let parsedProposal: unknown;
  try {
    parsedProposal = JSON.parse(proposalRaw);
  } catch {
    return { error: "Adjustment proposal could not be read" };
  }

  const proposal = planAdjustmentProposalSchema.safeParse(parsedProposal);
  if (!proposal.success) return { error: "Adjustment proposal was invalid" };

  const currentSnapshot = parsePlanSnapshot(plan.currentVersion.planSnapshot);
  const comparableWeek = buildComparableWeek(currentSnapshot, weekKey);
  if (!comparableWeek) return { error: "Week not found" };

  try {
    validateAdjustmentProposal(comparableWeek, parsedMode.data, proposal.data);
  } catch (error) {
    return { error: (error as Error).message };
  }

  const weekNum = parseInt(weekKey.replace("week-", ""), 10);
  const existingLog = await prisma.workoutLog.findFirst({
    where: {
      userId: session.userId,
      planId,
      weekNum,
    },
    select: { id: true },
  });

  if (existingLog) {
    return { error: "This week already has workout logs, so it can no longer be adjusted safely" };
  }

  const nextSnapshot =
    proposal.data.mode === "reorder"
      ? buildReorderedSnapshot(currentSnapshot, weekKey, proposal.data)
      : buildDifficultySnapshot(currentSnapshot, weekKey, proposal.data);

  await createPlanVersion({
    planId,
    profileSnapshot: parseProfileSnapshot(plan.currentVersion.profileSnapshot),
    planSnapshot: nextSnapshot,
    changeType: proposal.data.mode === "reorder" ? "ai_reorder" : "ai_difficulty",
    changeSummary: proposal.data.summary,
    basedOnVersionId: plan.currentVersion.id,
    effectiveFromWeek: weekNum,
  });

  return { ok: true };
}
