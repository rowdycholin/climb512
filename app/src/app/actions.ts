"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPostLoginPath } from "@/lib/post-login-route";
import { getSession, getSessionBootId, getSessionExpiresAt } from "@/lib/session";
import {
  buildPlanSnapshot,
  createProfileSnapshot,
  type ExerciseSnapshot,
  parsePlanSnapshot,
  parseProfileSnapshot,
  toStoredJson,
  type DaySnapshot,
  type PlanSnapshot,
  type ProfileSnapshot,
} from "@/lib/plan-snapshot";
import { generatePlanFromPlanRequestWithAI, generatePlanWithAI } from "@/lib/ai-plan-generator";
import type { PlanInput } from "@/lib/plan-types";
import { planRequestToLegacyPlanInput, type PlanRequest } from "@/lib/plan-request";
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
import {
  intakeDraftToPlanRequest,
  parseIntakeDraftJson,
  partialIntakeDraftSchema,
  type IntakeMessage,
  type IntakeResponse,
} from "@/lib/intake";
import { continuePlanIntakeWithAiContract } from "@/lib/plan-intake-ai";
import {
  buildPlanAdjustmentRequest,
  findNextUnloggedPlanDay,
  planDayFromWeekDay,
  validateLockedHistoryUnchanged,
  type PlanAdjustmentReason,
  type WorkoutLogDayMarker,
} from "@/lib/plan-adjustment-request";

export interface PlanAdjustmentResponse {
  error?: string;
  proposal?: string;
  summary?: string;
  changes?: string[];
  weekKey?: string;
  mode?: "reorder" | "difficulty";
}

export interface FuturePlanAdjustmentResponse {
  error?: string;
  ok?: true;
  summary?: string;
  effectiveFrom?: string;
}

interface EditedExerciseInput {
  id: string;
  name: string;
  sets: string | null;
  reps: string | null;
  duration: string | null;
  rest: string | null;
  notes: string | null;
}

interface EditedSessionInput {
  id: string;
  name: string;
  description: string;
  duration: number;
  exercises: EditedExerciseInput[];
}

interface EditedDayInput {
  id: string;
  focus: string;
  isRest: boolean;
  sessions: EditedSessionInput[];
}

interface EditedWeekInput {
  id: string;
  theme: string;
  days: EditedDayInput[];
}

function toPlanInput(formData: FormData, age: number): PlanInput {
  const goals = formData.getAll("goals") as string[];
  const customGoal = (formData.get("customGoal") as string | null)?.trim();
  const equipment = formData.getAll("equipment") as string[];
  const customEquipment = (formData.get("customEquipment") as string | null)?.trim();

  return {
    goals: customGoal ? [...goals, customGoal] : goals,
    currentGrade: formData.get("currentGrade") as string,
    targetGrade: formData.get("targetGrade") as string,
    age,
    weeksDuration: parseInt(formData.get("weeksDuration") as string, 10),
    daysPerWeek: parseInt(formData.get("daysPerWeek") as string, 10),
    equipment: customEquipment
      ? [...equipment, ...customEquipment.split(",").map((item) => item.trim()).filter(Boolean)]
      : equipment,
    discipline: (formData.get("discipline") as string) || "bouldering",
  };
}

function parsePlanStartDate(formData: FormData) {
  const value = formData.get("startDate");
  if (typeof value !== "string" || !value) {
    return new Date();
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

function parseDateInput(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function createGeneratedPlanFromRequest(params: {
  userId: string;
  loginId?: string;
  request: PlanRequest;
  age: number;
}) {
  const legacyInput = planRequestToLegacyPlanInput(params.request, params.age);
  const weeks = await generatePlanFromPlanRequestWithAI(params.request, params.age, params.loginId);
  const profileSnapshot = createProfileSnapshot(legacyInput, params.request);
  const planSnapshot = buildPlanSnapshot(weeks);
  const title = `${params.request.sport}: ${params.request.goalDescription}`.slice(0, 120);

  const plan = await prisma.plan.create({
    data: {
      userId: params.userId,
      title,
      startDate: parseDateInput(params.request.startDate),
    },
  });

  await createPlanVersion({
    planId: plan.id,
    profileSnapshot,
    planSnapshot,
    changeType: "generated",
    changeSummary: "Initial AI-generated plan from guided intake",
  });

  redirect(`/plan/${plan.id}`);
}

async function createPlanVersion(params: {
  planId: string;
  profileSnapshot: ProfileSnapshot;
  planSnapshot: PlanSnapshot;
  changeType: string;
  changeSummary?: string | null;
  basedOnVersionId?: string | null;
  effectiveFromWeek?: number | null;
  effectiveFromDay?: number | null;
}) {
  const {
    planId,
    profileSnapshot,
    planSnapshot,
    changeType,
    changeSummary,
    basedOnVersionId,
    effectiveFromWeek,
    effectiveFromDay,
  } = params;

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
      effectiveFromDay: effectiveFromDay ?? null,
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

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseEditedWeek(raw: unknown): EditedWeekInput | null {
  if (!raw || typeof raw !== "object") return null;
  const week = raw as Record<string, unknown>;
  if (typeof week.id !== "string" || typeof week.theme !== "string" || !Array.isArray(week.days)) {
    return null;
  }

  const days = week.days.map((day) => {
    if (!day || typeof day !== "object") return null;
    const item = day as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      typeof item.focus !== "string" ||
      typeof item.isRest !== "boolean" ||
      !Array.isArray(item.sessions)
    ) {
      return null;
    }

    const sessions = item.sessions.map((session) => {
      if (!session || typeof session !== "object") return null;
      const value = session as Record<string, unknown>;
      if (
        typeof value.id !== "string" ||
        typeof value.name !== "string" ||
        typeof value.description !== "string" ||
        typeof value.duration !== "number" ||
        !Array.isArray(value.exercises)
      ) {
        return null;
      }

      const exercises = value.exercises.map((exercise) => {
        if (!exercise || typeof exercise !== "object") return null;
        const entry = exercise as Record<string, unknown>;
        if (typeof entry.id !== "string" || typeof entry.name !== "string") {
          return null;
        }

        return {
          id: entry.id,
          name: entry.name.trim(),
          sets: normalizeNullableString(entry.sets),
          reps: normalizeNullableString(entry.reps),
          duration: normalizeNullableString(entry.duration),
          rest: normalizeNullableString(entry.rest),
          notes: normalizeNullableString(entry.notes),
        } satisfies EditedExerciseInput;
      });

      if (exercises.some((exercise) => !exercise || !exercise.name)) {
        return null;
      }

      return {
        id: value.id,
        name: value.name.trim(),
        description: value.description.trim(),
        duration: Math.max(0, Math.min(300, Math.round(value.duration))),
        exercises: exercises as EditedExerciseInput[],
      } satisfies EditedSessionInput;
    });

    if (sessions.some((session) => !session || !session.name)) {
      return null;
    }

    return {
      id: item.id,
      focus: item.focus.trim() || (item.isRest ? "Rest" : "Training"),
      isRest: item.isRest,
      sessions: sessions as EditedSessionInput[],
    } satisfies EditedDayInput;
  });

  if (days.length !== 7 || days.some((day) => !day)) {
    return null;
  }

  return {
    id: week.id,
    theme: week.theme.trim() || "Updated week",
    days: days as EditedDayInput[],
  };
}

function applyEditedWeekToSnapshot(currentSnapshot: PlanSnapshot, editedWeek: EditedWeekInput) {
  const nextSnapshot = parsePlanSnapshot(JSON.parse(JSON.stringify(currentSnapshot)));
  const weekIndex = nextSnapshot.weeks.findIndex((week) => week.key === editedWeek.id);
  if (weekIndex === -1) {
    throw new Error("Week not found");
  }

  const originalWeek = nextSnapshot.weeks[weekIndex];
  const originalDayIds = new Set(originalWeek.days.map((day) => day.key));
  const editedDayIds = new Set(editedWeek.days.map((day) => day.id));
  if (
    originalDayIds.size !== editedDayIds.size ||
    Array.from(originalDayIds).some((id) => !editedDayIds.has(id))
  ) {
    throw new Error("Edited week changed the day structure");
  }

  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  originalWeek.theme = editedWeek.theme;
  originalWeek.days = editedWeek.days.map((day, index) => ({
    key: day.id,
    dayNum: index + 1,
    dayName: dayNames[index],
    focus: day.isRest ? "Rest" : day.focus,
    isRest: day.isRest,
    sessions: day.sessions.map((session) => ({
      key: session.id,
      name: session.name,
      description: session.description,
      duration: session.duration,
      exercises: session.exercises.map((exercise) => ({
        key: exercise.id,
        name: exercise.name,
        sets: exercise.sets,
        reps: exercise.reps,
        duration: exercise.duration,
        rest: exercise.rest,
        notes: exercise.notes,
      })),
    })),
  }));

  return nextSnapshot;
}

function applyAdditiveEditedWeekToSnapshot(currentSnapshot: PlanSnapshot, editedWeek: EditedWeekInput) {
  const nextSnapshot = parsePlanSnapshot(JSON.parse(JSON.stringify(currentSnapshot)));
  const weekIndex = nextSnapshot.weeks.findIndex((week) => week.key === editedWeek.id);
  if (weekIndex === -1) {
    throw new Error("Week not found");
  }

  const originalWeek = nextSnapshot.weeks[weekIndex];
  if (editedWeek.theme !== originalWeek.theme) {
    throw new Error("Logged weeks only allow adding new exercises");
  }

  const editedById = new Map(editedWeek.days.map((day) => [day.id, day]));
  for (const originalDay of originalWeek.days) {
    const editedDay = editedById.get(originalDay.key);
    if (!editedDay) throw new Error("Edited week changed the day structure");
    const originalSessionIds = new Set(originalDay.sessions.map((session) => session.key));
    const addedSessions = editedDay.sessions.filter((session) => !originalSessionIds.has(session.id));
    const isRestDayBecomingTraining = originalDay.isRest && !editedDay.isRest && addedSessions.length > 0;

    if (
      (!isRestDayBecomingTraining && editedDay.focus !== originalDay.focus) ||
      (!isRestDayBecomingTraining && editedDay.isRest !== originalDay.isRest)
    ) {
      throw new Error("Logged weeks only allow adding new exercises");
    }

    const editedSessionsById = new Map(editedDay.sessions.map((session) => [session.id, session]));
    for (const originalSession of originalDay.sessions) {
      const editedSession = editedSessionsById.get(originalSession.key);
      if (!editedSession) throw new Error("Logged weeks cannot remove sessions");
      if (
        editedSession.name !== originalSession.name ||
        editedSession.description !== originalSession.description ||
        editedSession.duration !== originalSession.duration
      ) {
        throw new Error("Logged weeks only allow adding new exercises");
      }

      const editedExercisesById = new Map(editedSession.exercises.map((exercise) => [exercise.id, exercise]));
      for (const originalExercise of originalSession.exercises) {
        const editedExercise = editedExercisesById.get(originalExercise.key);
        if (!editedExercise) throw new Error("Logged weeks cannot remove exercises");
        if (
          editedExercise.name !== originalExercise.name ||
          editedExercise.sets !== originalExercise.sets ||
          editedExercise.reps !== originalExercise.reps ||
          editedExercise.duration !== originalExercise.duration ||
          editedExercise.rest !== originalExercise.rest ||
          editedExercise.notes !== originalExercise.notes
        ) {
          throw new Error("Logged weeks cannot change existing exercises");
        }
      }

      const originalExerciseIds = new Set(originalSession.exercises.map((exercise) => exercise.key));
      const additions = editedSession.exercises.filter((exercise) => !originalExerciseIds.has(exercise.id));
      originalSession.exercises.push(
        ...additions.map((exercise) => ({
          key: exercise.id,
          name: exercise.name,
          sets: exercise.sets,
          reps: exercise.reps,
          duration: exercise.duration,
          rest: exercise.rest,
          notes: exercise.notes,
        })),
      );
    }

    if (addedSessions.length > 0) {
      if (!originalDay.isRest) {
        throw new Error("Logged training days can only add exercises to existing sessions");
      }

      originalDay.isRest = false;
      originalDay.focus = "Training";
      originalDay.sessions.push(
        ...addedSessions.map((session) => ({
          key: session.id,
          name: session.name,
          description: session.description,
          duration: session.duration,
          exercises: session.exercises.map((exercise) => ({
            key: exercise.id,
            name: exercise.name,
            sets: exercise.sets,
            reps: exercise.reps,
            duration: exercise.duration,
            rest: exercise.rest,
            notes: exercise.notes,
          })),
        })),
      );
    }
  }

  return nextSnapshot;
}

function parseAdjustmentReason(value: FormDataEntryValue | null): PlanAdjustmentReason {
  const allowed: PlanAdjustmentReason[] = [
    "too_hard",
    "too_easy",
    "missed_time",
    "injury",
    "travel",
    "new_goal",
    "schedule_change",
    "other",
  ];
  return typeof value === "string" && allowed.includes(value as PlanAdjustmentReason)
    ? (value as PlanAdjustmentReason)
    : "other";
}

function numberText(value: string | null, direction: "easier" | "harder") {
  if (!value) return value;
  const match = value.match(/^(\d+)(.*)$/);
  if (!match) return value;
  const current = parseInt(match[1], 10);
  if (!Number.isFinite(current)) return value;
  const next = direction === "easier" ? Math.max(1, current - 1) : current + 1;
  return `${next}${match[2]}`;
}

function durationText(value: string | null, direction: "easier" | "harder") {
  if (!value) return value;
  const match = value.match(/^(\d+)(.*)$/);
  if (!match) return value;
  const current = parseInt(match[1], 10);
  if (!Number.isFinite(current)) return value;
  const delta = direction === "easier" ? -5 : 5;
  return `${Math.max(1, current + delta)}${match[2]}`;
}

function adjustedExercise(exercise: ExerciseSnapshot, reason: PlanAdjustmentReason, feedback: string) {
  const feedbackText = feedback.toLowerCase();
  const easier = reason === "too_hard" || reason === "injury" || reason === "travel" || reason === "missed_time" || feedbackText.includes("easy");
  const harder = reason === "too_easy" || feedbackText.includes("harder") || feedbackText.includes("more");
  const direction = harder && !easier ? "harder" : "easier";

  return {
    ...exercise,
    sets: numberText(exercise.sets, direction),
    reps: direction === "easier" ? numberText(exercise.reps, "easier") : exercise.reps,
    duration: durationText(exercise.duration, direction),
    notes: direction === "easier"
      ? "Adjusted easier; keep effort controlled"
      : "Adjusted harder; stop before form breaks",
  };
}

function adjustedDay(day: DaySnapshot, reason: PlanAdjustmentReason, feedback: string): DaySnapshot {
  if (day.isRest || day.sessions.length === 0) return day;

  return {
    ...day,
    focus: reason === "injury" ? "Modified Training" : day.focus,
    sessions: day.sessions.map((session) => ({
      ...session,
      duration: reason === "too_easy" ? session.duration + 5 : Math.max(20, session.duration - 5),
      description: reason === "too_easy"
        ? "Adjusted upward for a stronger training stimulus."
        : "Adjusted to protect recovery and consistency.",
      exercises: session.exercises.map((exercise) => adjustedExercise(exercise, reason, feedback)),
    })),
  };
}

function buildAdjustedFutureSnapshot(
  currentSnapshot: PlanSnapshot,
  effectiveFromPlanDay: number,
  reason: PlanAdjustmentReason,
  feedback: string,
) {
  const nextSnapshot = parsePlanSnapshot(JSON.parse(JSON.stringify(currentSnapshot)));

  nextSnapshot.weeks = nextSnapshot.weeks.map((week) => ({
    ...week,
    theme: week.days.some((day) => planDayFromWeekDay(week.weekNum, day.dayNum) >= effectiveFromPlanDay)
      ? `${week.theme} (Adjusted)`
      : week.theme,
    days: week.days.map((day) => {
      const planDay = planDayFromWeekDay(week.weekNum, day.dayNum);
      if (planDay < effectiveFromPlanDay) return day;
      return adjustedDay(day, reason, feedback);
    }),
  }));

  validateLockedHistoryUnchanged(currentSnapshot, nextSnapshot, effectiveFromPlanDay);
  return nextSnapshot;
}

function formatEffectiveFrom(effectiveFrom: { weekNum: number; dayNum: number; date: string }) {
  return `Week ${effectiveFrom.weekNum}, Day ${effectiveFrom.dayNum} (${effectiveFrom.date})`;
}

export async function login(_prevState: unknown, formData: FormData) {
  const loginId = (formData.get("userId") as string).trim();
  const password = formData.get("password") as string;

  const user = await prisma.user.findUnique({ where: { userId: loginId } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Invalid user ID or password" };
  }

  const session = await getSession();
  session.userId = user.id;
  session.loginId = user.userId;
  session.displayName = `${user.firstName} ${user.lastName}`.trim();
  session.isLoggedIn = true;
  session.bootId = getSessionBootId();
  session.expiresAt = getSessionExpiresAt();
  await session.save();

  redirect(await getPostLoginPath(user.id));
}

export async function register(_prevState: unknown, formData: FormData) {
  const firstName = (formData.get("firstName") as string).trim();
  const lastName = (formData.get("lastName") as string).trim();
  const email = (formData.get("email") as string).trim().toLowerCase();
  const loginId = (formData.get("userId") as string).trim();
  const password = formData.get("password") as string;
  const verifyPassword = formData.get("verifyPassword") as string;
  const age = parseInt(formData.get("age") as string, 10);

  if (!firstName || !lastName || !email || !loginId || !password || !verifyPassword || !Number.isFinite(age)) {
    return { error: "All fields are required" };
  }
  if (loginId.length < 8) return { error: "User ID must be at least 8 characters" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address" };
  if (age < 13 || age > 100) return { error: "Age must be between 13 and 100" };
  if (password.length < 10) return { error: "Password must be at least 10 characters" };
  if (!/[a-z]/.test(password)) return { error: "Password must include a lowercase letter" };
  if (!/[A-Z]/.test(password)) return { error: "Password must include an uppercase letter" };
  if (!/[0-9]/.test(password)) return { error: "Password must include a number" };
  if (!/[!@#$%^&*()_\-+=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return { error: "Password must include a special character" };
  }
  if (password !== verifyPassword) return { error: "Passwords do not match" };

  const existingLogin = await prisma.user.findUnique({ where: { userId: loginId } });
  if (existingLogin) return { error: "User ID already taken" };

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) return { error: "Email already registered" };

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { userId: loginId, firstName, lastName, email, age, passwordHash },
  });

  const session = await getSession();
  session.userId = user.id;
  session.loginId = user.userId;
  session.displayName = `${user.firstName} ${user.lastName}`.trim();
  session.isLoggedIn = true;
  session.bootId = getSessionBootId();
  session.expiresAt = getSessionExpiresAt();
  await session.save();

  redirect(await getPostLoginPath(user.id));
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}

export async function createPlan(formData: FormData) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { age: true },
  });
  if (!user) redirect("/login");

  const input = toPlanInput(formData, user.age);
  const startDate = parsePlanStartDate(formData);
  const weeks = await generatePlanWithAI(input, session.loginId);
  const profileSnapshot = createProfileSnapshot(input);
  const planSnapshot = buildPlanSnapshot(weeks);

  const plan = await prisma.plan.create({
    data: {
      userId: session.userId,
      title: `${input.currentGrade} → ${input.targetGrade}`,
      startDate,
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

export async function continuePlanIntake(input: {
  draft: unknown;
  userMessage: string;
  messages: IntakeMessage[];
}): Promise<IntakeResponse> {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return { draft: {}, ready: false, assistantMessage: "Please sign in again before building a plan." };
  }

  const draft = partialIntakeDraftSchema.parse(input.draft ?? {});
  return continuePlanIntakeWithAiContract({
    draft,
    userMessage: input.userMessage,
    messages: input.messages,
  });
}

export async function createPlanFromIntake(formData: FormData) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const rawDraft = formData.get("draft");
  if (typeof rawDraft !== "string") redirect("/intake");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { age: true },
  });
  if (!user) redirect("/login");

  const draft = parseIntakeDraftJson(rawDraft);
  const request = intakeDraftToPlanRequest(draft);
  await createGeneratedPlanFromRequest({
    userId: session.userId,
    loginId: session.loginId,
    request,
    age: user.age,
  });
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

const completionReasons = new Set([
  "finished",
  "goal_completed",
  "stopped_early",
  "replaced_by_new_plan",
  "other",
]);

export async function completePlan(formData: FormData) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const planId = formData.get("planId");
  const reasonRaw = formData.get("completionReason");
  const notesRaw = formData.get("completionNotes");

  if (typeof planId !== "string") redirect("/dashboard");

  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId: session.userId },
    select: { id: true },
  });
  if (!plan) redirect("/dashboard");

  const reason = typeof reasonRaw === "string" && completionReasons.has(reasonRaw) ? reasonRaw : "finished";
  const notes = typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim().slice(0, 2000) : null;

  await prisma.plan.update({
    where: { id: plan.id },
    data: {
      completedAt: new Date(),
      completionReason: reason,
      completionNotes: notes,
    },
  });

  redirect(`/plan/${plan.id}`);
}

export async function reopenPlan(formData: FormData) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const planId = formData.get("planId");
  if (typeof planId !== "string") redirect("/dashboard");

  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId: session.userId },
    select: { id: true },
  });
  if (!plan) redirect("/dashboard");

  await prisma.plan.update({
    where: { id: plan.id },
    data: {
      completedAt: null,
      completionReason: null,
      completionNotes: null,
    },
  });

  redirect(`/plan/${plan.id}`);
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

export async function adjustFuturePlan(formData: FormData): Promise<FuturePlanAdjustmentResponse> {
  const session = await getSession();
  if (!session.isLoggedIn) return { error: "Please sign in again" };

  const planId = formData.get("planId");
  const feedback = (formData.get("feedback") as string | null)?.trim() ?? "";
  const reason = parseAdjustmentReason(formData.get("reason"));

  if (typeof planId !== "string") return { error: "Missing plan" };
  if (!feedback) return { error: "Tell the coach what needs to change first" };

  const plan = await findOwnedPlanWithLogs(planId, session.userId);
  if (!plan) return { error: "Plan not found" };

  const currentSnapshot = plan.currentVersion.planSnapshot;
  const profileSnapshot = parseProfileSnapshot(plan.currentVersion.profileSnapshot);
  const logs: WorkoutLogDayMarker[] = plan.workoutLogs.map((log) => ({
    weekNum: log.weekNum,
    dayNum: log.dayNum,
    sessionKey: log.sessionKey,
    exerciseKey: log.exerciseKey,
    exerciseName: log.exerciseName,
    completed: log.completed,
  }));

  const effectiveFrom = findNextUnloggedPlanDay({
    planStartDate: plan.startDate,
    currentDate: new Date(),
    snapshot: currentSnapshot,
    logs,
  });

  if (!effectiveFrom) {
    return { error: "There are no unlogged days left to adjust in this plan" };
  }

  const adjustmentRequest = buildPlanAdjustmentRequest({
    reason,
    userFeedback: feedback,
    effectiveFrom,
    planStartDate: plan.startDate,
    currentVersion: {
      id: plan.currentVersion.id,
      versionNum: plan.currentVersion.versionNum,
      profileSnapshot,
    },
    logs,
  });

  try {
    const nextSnapshot = buildAdjustedFutureSnapshot(
      currentSnapshot,
      adjustmentRequest.effectiveFrom.planDay,
      adjustmentRequest.reason,
      adjustmentRequest.userFeedback,
    );
    const effectiveLabel = formatEffectiveFrom(adjustmentRequest.effectiveFrom);
    const summary = `Adjusted future plan from ${effectiveLabel}`;

    await createPlanVersion({
      planId,
      profileSnapshot,
      planSnapshot: nextSnapshot,
      changeType: "ai_future_adjustment",
      changeSummary: summary,
      basedOnVersionId: plan.currentVersion.id,
      effectiveFromWeek: adjustmentRequest.effectiveFrom.weekNum,
      effectiveFromDay: adjustmentRequest.effectiveFrom.planDay,
    });

    return {
      ok: true,
      summary,
      effectiveFrom: effectiveLabel,
    };
  } catch (error) {
    return { error: (error as Error).message };
  }
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

export async function saveEditedWeek(formData: FormData): Promise<{ error?: string; ok?: true }> {
  const session = await getSession();
  if (!session.isLoggedIn) return { error: "Please sign in again" };

  const planId = formData.get("planId");
  const weekKey = formData.get("weekId");
  const editedWeekRaw = formData.get("editedWeek");

  if (typeof planId !== "string" || typeof weekKey !== "string" || typeof editedWeekRaw !== "string") {
    return { error: "Missing edited week payload" };
  }

  const plan = await findOwnedPlanById(planId, session.userId);
  if (!plan?.currentVersion) return { error: "Plan not found" };

  let parsedWeekJson: unknown;
  try {
    parsedWeekJson = JSON.parse(editedWeekRaw);
  } catch {
    return { error: "Edited week could not be read" };
  }

  const editedWeek = parseEditedWeek(parsedWeekJson);
  if (!editedWeek || editedWeek.id !== weekKey) {
    return { error: "Edited week payload was invalid" };
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

  try {
    const currentSnapshot = parsePlanSnapshot(plan.currentVersion.planSnapshot);
    const nextSnapshot = existingLog
      ? applyAdditiveEditedWeekToSnapshot(currentSnapshot, editedWeek)
      : applyEditedWeekToSnapshot(currentSnapshot, editedWeek);

    await createPlanVersion({
      planId,
      profileSnapshot: parseProfileSnapshot(plan.currentVersion.profileSnapshot),
      planSnapshot: nextSnapshot,
      changeType: existingLog ? "manual_add_exercise" : "manual_edit",
      changeSummary: existingLog ? `Added exercise to logged Week ${weekNum}` : `Manual edit for Week ${weekNum}`,
      basedOnVersionId: plan.currentVersion.id,
      effectiveFromWeek: weekNum,
    });
  } catch (error) {
    return { error: (error as Error).message };
  }

  return { ok: true };
}
