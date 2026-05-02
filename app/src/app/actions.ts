"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPostLoginPath } from "@/lib/post-login-route";
import { getSession, getSessionBootId, getSessionExpiresAt, refreshSession } from "@/lib/session";
import {
  buildPlanSnapshot,
  buildPlanGuidance,
  createProfileSnapshot,
  type ExerciseSnapshot,
  type DaySnapshot,
  hasMeaningfulWorkoutLog,
  parsePlanSnapshot,
  parseProfileSnapshot,
  toStoredJson,
  type PlanSnapshot,
  type ProfileSnapshot,
  type WeekSnapshot,
} from "@/lib/plan-snapshot";
import { composePlanSnapshotFromGeneratedWeeks, countGeneratedWeeks } from "@/lib/plan-generation-state";
import { generatePlanWithAI } from "@/lib/ai-plan-generator";
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
import { AiAdjustmentJsonError, generateAdjustmentChatResponse, shouldUseModelBackedAdjustmentChat } from "@/lib/ai-plan-adjustment-chat";
import {
  buildAdjustmentChatContext,
  createAdjustmentChatState,
  adjustmentIntentSchema,
  adjustmentChatProposalSchema,
  summarizeRichSnapshotChanges,
  validateAdjustmentChatProposal,
  type AdjustmentChatMessage,
  type AdjustmentChatProposal,
  type AdjustmentIntent,
} from "@/lib/plan-adjustment-chat";
import {
  buildPlanAdjustmentRequest,
  adjustmentScopeSchema,
  findNextUnloggedPlanDay,
  planDayFromWeekDay,
  scopeContainsPlanDay,
  scopeStartPlanDay,
  validateAdjustmentScopeUnchanged,
  validateLockedHistoryUnchanged,
  weekDayFromPlanDay,
  type AdjustmentScope,
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

export interface PlanAdjustmentChatResponse {
  error?: string;
  responseType?: "follow_up" | "proposal";
  assistantMessage?: string;
  proposal?: string;
}

interface ConfirmedPlanAdjustmentInput {
  planId: string;
  reason: PlanAdjustmentReason;
  feedback: string;
  scope?: AdjustmentScope | null;
  proposalSummary?: string | null;
  proposalChanges?: string[];
  goalChangeConfirmed?: boolean;
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
  request: PlanRequest;
  age: number;
}) {
  const legacyInput = planRequestToLegacyPlanInput(params.request, params.age);
  const profileSnapshot = createProfileSnapshot(legacyInput, params.request);
  const title = `${params.request.sport}: ${params.request.goalDescription}`.slice(0, 120);

  const planId = await prisma.$transaction(async (tx) => {
    const plan = await tx.plan.create({
      data: {
        userId: params.userId,
        title,
        startDate: parseDateInput(params.request.startDate),
        generationStatus: "generating",
        generationError: null,
        generatedWeeks: 0,
      },
    });

    const job = await tx.planGenerationJob.create({
      data: {
        planId: plan.id,
        userId: params.userId,
        status: "pending",
        totalWeeks: params.request.blockLengthWeeks,
        nextWeekNum: 1,
        profileSnapshot: toStoredJson(profileSnapshot),
      },
    });

    console.log(
      `[web] queued guided-intake plan generation user=${params.userId} plan=${plan.id} job=${job.id} sport=${params.request.sport} weeks=${params.request.blockLengthWeeks} daysPerWeek=${params.request.daysPerWeek}`,
    );

    return plan.id;
  });

  redirect(`/plan/${planId}`);
}

async function createPlanVersion(params: {
  planId: string;
  profileSnapshot: ProfileSnapshot;
  planSnapshot: PlanSnapshot;
  changeType: string;
  changeSummary?: string | null;
  changeMetadata?: unknown;
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
    changeMetadata,
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
      ...(changeMetadata === undefined ? {} : { changeMetadata: toStoredJson(changeMetadata) }),
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
      generatedWeeks: countGeneratedWeeks(planSnapshot),
      generationStatus: "ready",
      generationError: null,
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

function isRunningExercise(exercise: ExerciseSnapshot) {
  const text = `${exercise.name} ${exercise.notes ?? ""} ${exercise.intensity ?? ""} ${exercise.distance ?? ""}`.toLowerCase();
  return /\brun|jog|stride|tempo|interval|pace|aerobic|walk\b/.test(text);
}

function isWarmupOrCooldownExercise(exercise: ExerciseSnapshot) {
  return /\bwarm[- ]?up|cooldown|cool[- ]?down|mobility|walk\b/i.test(exercise.name);
}

function isStrengthExercise(exercise: ExerciseSnapshot) {
  return /\bstrength|circuit|step[- ]?up|rdl|deadlift|squat|lunge|raise|calf|bridge|row|press\b/i.test(exercise.name);
}

function easierRunningIntensity(exercise: ExerciseSnapshot) {
  if (/\btempo|interval|stride|repeat|hard|fast\b/i.test(exercise.name)) return "RPE 5-6";
  return "RPE 3-4";
}

function easierRunningNotes(exercise: ExerciseSnapshot) {
  if (/\btempo|interval|stride|repeat|hard|fast\b/i.test(exercise.name)) {
    return "Dial this back to controlled aerobic work; finish with legs fresher than usual.";
  }
  if (isWarmupOrCooldownExercise(exercise)) {
    return exercise.notes ?? "Keep this relaxed and easy.";
  }
  return "Keep this conversational and reduce pace before reducing form quality.";
}

function adjustedRunningExercise(exercise: ExerciseSnapshot, direction: "easier" | "harder"): ExerciseSnapshot {
  if (direction === "harder") {
    return {
      ...exercise,
      duration: durationText(exercise.duration, "harder"),
      work: durationText(exercise.work ?? null, "harder") ?? exercise.work ?? null,
      sets: numberText(exercise.sets, "harder"),
      intensity: exercise.intensity ?? "RPE 6-7",
      notes: "Progress only if form and breathing stay controlled.",
    };
  }

  if (isWarmupOrCooldownExercise(exercise)) {
    return {
      ...exercise,
      intensity: exercise.intensity ? "RPE 2-3" : exercise.intensity ?? null,
      notes: easierRunningNotes(exercise),
    };
  }

  if (isStrengthExercise(exercise)) {
    return {
      ...exercise,
      sets: numberText(exercise.sets, "easier"),
      intensity: "RPE 5-6",
      notes: "Keep this supportive, not fatiguing; leave 3-4 reps in reserve.",
    };
  }

  const nextDuration = durationText(exercise.duration, "easier");
  return {
    ...exercise,
    sets: numberText(exercise.sets, "easier"),
    duration: nextDuration,
    work: durationText(exercise.work ?? null, "easier") ?? exercise.work ?? null,
    intensity: easierRunningIntensity(exercise),
    notes: easierRunningNotes(exercise),
  };
}

function adjustedExercise(exercise: ExerciseSnapshot, reason: PlanAdjustmentReason, feedback: string) {
  const feedbackText = feedback.toLowerCase();
  const easier = reason === "too_hard" || reason === "injury" || reason === "travel" || reason === "missed_time" || feedbackText.includes("easy");
  const harder = reason === "too_easy" || feedbackText.includes("harder") || feedbackText.includes("more");
  const direction = harder && !easier ? "harder" : "easier";

  if (isRunningExercise(exercise) && (/\bleg|run|pace|intensity|load|heavy\b/.test(feedbackText) || direction === "harder")) {
    return adjustedRunningExercise(exercise, direction);
  }

  return {
    ...exercise,
    sets: numberText(exercise.sets, direction),
    reps: direction === "easier" ? numberText(exercise.reps, "easier") : exercise.reps,
    duration: durationText(exercise.duration, direction),
    notes: direction === "easier"
      ? "Keep effort controlled and stop before form breaks."
      : "Use the stronger stimulus only while movement quality stays high.",
  };
}

function adjustedDay(day: DaySnapshot, reason: PlanAdjustmentReason, feedback: string): DaySnapshot {
  if (day.isRest || day.sessions.length === 0) return day;
  const feedbackText = feedback.toLowerCase();
  const easier = reason === "too_hard" || reason === "injury" || reason === "travel" || reason === "missed_time" || /\bleg|heavy|reduce|decrease|less|fatigue|recover/.test(feedbackText);
  const isRunningDay = day.sessions.some((session) => session.exercises.some(isRunningExercise));

  return {
    ...day,
    focus: reason === "injury" ? "Modified Training" : day.focus,
    sessions: day.sessions.map((session) => ({
      ...session,
      duration: isRunningDay && easier
        ? session.duration
        : reason === "too_easy"
          ? session.duration + 5
          : Math.max(20, session.duration - 5),
      intensity: isRunningDay && easier ? "RPE 3-5" : session.intensity,
      description: reason === "too_easy"
        ? "Use a stronger training stimulus while movement quality stays high."
        : isRunningDay && easier
          ? "Reduce intensity and keep the work aerobic so the legs can recover."
        : "Protect recovery and keep the session consistent.",
      exercises: session.exercises.map((exercise) => adjustedExercise(exercise, reason, feedback)),
    })),
  };
}

const DAY_NAME_TO_NUM: Record<string, number> = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 7,
  sun: 7,
};

const meaningfulWorkoutLogWhere = {
  OR: [
    { completed: true },
    { setsCompleted: { not: null } },
    { repsCompleted: { not: null } },
    { weightUsed: { not: null } },
    { durationActual: { not: null } },
    { notes: { not: null } },
  ],
};

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseDetailedActuals(formData: FormData) {
  const mode = textValue(formData, "actualMode");
  const rowCount = parseInt(textValue(formData, "actualRowCount") ?? "0", 10);
  if (!mode || !Number.isFinite(rowCount) || rowCount <= 0) return null;

  const prefix = mode === "sets" ? "set" : mode === "intervals" ? "interval" : mode === "attempts" ? "attempt" : "summary";
  const entries = Array.from({ length: rowCount }, (_, index) => {
    const row = index + 1;
    if (mode === "sets") {
      return {
        set: row,
        completed: formData.get(`${prefix}-${row}-completed`) === "on",
        reps: textValue(formData, `${prefix}-${row}-reps`),
        target: textValue(formData, `${prefix}-${row}-target`) ?? textValue(formData, `${prefix}-${row}-load`),
        rpe: textValue(formData, `${prefix}-${row}-rpe`),
        notes: textValue(formData, `${prefix}-${row}-notes`),
      };
    }
    if (mode === "intervals") {
      return {
        interval: row,
        completed: formData.get(`${prefix}-${row}-completed`) === "on",
        work: textValue(formData, `${prefix}-${row}-work`),
        rest: textValue(formData, `${prefix}-${row}-rest`),
        rpe: textValue(formData, `${prefix}-${row}-rpe`),
        notes: textValue(formData, `${prefix}-${row}-notes`),
      };
    }
    if (mode === "attempts") {
      return {
        attempt: row,
        result: textValue(formData, `${prefix}-${row}-result`),
        duration: textValue(formData, `${prefix}-${row}-duration`),
        rpe: textValue(formData, `${prefix}-${row}-rpe`),
        notes: textValue(formData, `${prefix}-${row}-notes`),
      };
    }
    return {
      duration: textValue(formData, "summary-duration"),
      rpe: textValue(formData, "summary-rpe"),
      notes: textValue(formData, "summary-notes"),
    };
  });

  return { mode, entries };
}

function parseActuals(formData: FormData) {
  const detailed = parseDetailedActuals(formData);
  if (detailed) return detailed;

  const raw = formData.get("actualsJson");
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mentionedDayNumbers(text: string) {
  const normalized = text.toLowerCase();
  const seen = new Set<number>();
  for (const [label, dayNum] of Object.entries(DAY_NAME_TO_NUM)) {
    if (new RegExp(`\\b${label}\\b`).test(normalized)) {
      seen.add(dayNum);
    }
  }
  return Array.from(seen);
}

function cloneDayForPosition(source: DaySnapshot, target: DaySnapshot): DaySnapshot {
  return {
    ...source,
    key: target.key,
    dayNum: target.dayNum,
    dayName: target.dayName,
    sessions: source.sessions.map((session, sessionIndex) => ({
      ...session,
      key: target.sessions[sessionIndex]?.key ?? `${target.key}-s${sessionIndex + 1}`,
      exercises: session.exercises.map((exercise, exerciseIndex) => ({
        ...exercise,
        key: target.sessions[sessionIndex]?.exercises[exerciseIndex]?.key ?? `${target.key}-s${sessionIndex + 1}-e${exerciseIndex + 1}`,
      })),
    })),
  };
}

function easierRepeaterExercise(exercise: ExerciseSnapshot): ExerciseSnapshot {
  return {
    ...exercise,
    name: "Easier fingerboard repeaters",
    sets: "3",
    reps: "6 reps",
    duration: null,
    rest: "2 min",
    notes: "Use a comfortable edge and stop before form or finger comfort changes.",
  };
}

function saferInjuryExercise(exercise: ExerciseSnapshot, feedback: string): ExerciseSnapshot {
  const normalized = feedback.toLowerCase();
  const area = normalized.includes("shoulder")
    ? "shoulder-friendly"
    : normalized.includes("elbow")
      ? "elbow-friendly"
      : "pain-free";

  return {
    ...exercise,
    name: `${area} ${exercise.name}`,
    sets: numberText(exercise.sets, "easier"),
    reps: numberText(exercise.reps, "easier"),
    duration: durationText(exercise.duration, "easier"),
    rest: exercise.rest ?? "2 min",
    notes: "Keep this conservative and stop if symptoms increase.",
  };
}

function applyExerciseSwapFixture(day: DaySnapshot, feedback: string) {
  if (!/\bswap|replace|substitute|change\b/i.test(feedback)) return day;
  if (!/\bmax\s*hang|hangs?|fingerboard|hangboard\b/i.test(feedback)) return day;
  if (!/\brepeater|repeaters|easier\b/i.test(feedback)) return day;

  let changed = false;
  const nextDay: DaySnapshot = {
    ...day,
    focus: day.focus === "Rest" ? "Finger Strength" : day.focus,
    isRest: false,
    sessions: day.sessions.map((session) => ({
      ...session,
      description: "Adjusted to a lower-intensity finger-strength option.",
      exercises: session.exercises.map((exercise) => {
        if (!/\bmax\s*hang|hangs?|fingerboard|hangboard\b/i.test(exercise.name)) return exercise;
        changed = true;
        return easierRepeaterExercise(exercise);
      }),
    })),
  };

  if (changed) return nextDay;

  const firstSession = nextDay.sessions[0];
  if (!firstSession) {
    return {
      ...nextDay,
      sessions: [
        {
          key: `${day.key}-adjusted-s1`,
          name: "Finger Strength",
          description: "Adjusted to a lower-intensity finger-strength option.",
          duration: 30,
          exercises: [
            easierRepeaterExercise({
              key: `${day.key}-adjusted-e1-repeaters`,
              name: "Max hangs",
              sets: null,
              reps: null,
              duration: null,
              rest: null,
              notes: null,
            }),
          ],
        },
      ],
    };
  }
  return {
    ...nextDay,
    sessions: [
      {
        ...firstSession,
        description: "Adjusted to a lower-intensity finger-strength option.",
        exercises: [
          easierRepeaterExercise(firstSession.exercises[0] ?? {
            key: `${firstSession.key}-e1-repeaters`,
            name: "Max hangs",
            sets: null,
            reps: null,
            duration: null,
            rest: null,
            notes: null,
          }),
          ...firstSession.exercises.slice(1),
        ],
      },
      ...nextDay.sessions.slice(1),
    ],
  };
}

function applyInjuryFixture(day: DaySnapshot, feedback: string) {
  if (day.isRest || day.sessions.length === 0) return day;
  return {
    ...day,
    focus: "Modified Training",
    sessions: day.sessions.map((session) => ({
      ...session,
      duration: Math.max(20, session.duration - 10),
      description: "Conservative injury-aware session that keeps the plan goal intact.",
      exercises: session.exercises.map((exercise) => saferInjuryExercise(exercise, feedback)),
    })),
  };
}

function applyScheduleSwapFixture(
  snapshot: PlanSnapshot,
  feedback: string,
  scope: AdjustmentScope | null | undefined,
  effectiveFromPlanDay: number,
  lockedPlanDays: Set<number>,
) {
  const normalized = feedback.toLowerCase();
  if (!/\bmove|swap|switch|shift\b/.test(normalized)) return false;
  const [fromDayNum, toDayNum] = mentionedDayNumbers(normalized);
  if (!fromDayNum || !toDayNum || fromDayNum === toDayNum) return false;

  let changed = false;
  for (const week of snapshot.weeks) {
    const fromDay = week.days.find((day) => day.dayNum === fromDayNum);
    const toDay = week.days.find((day) => day.dayNum === toDayNum);
    if (!fromDay || !toDay) continue;

    const fromPlanDay = planDayFromWeekDay(week.weekNum, fromDay.dayNum);
    const toPlanDay = planDayFromWeekDay(week.weekNum, toDay.dayNum);
    if (fromPlanDay < effectiveFromPlanDay || toPlanDay < effectiveFromPlanDay) continue;
    if (scope && (!scopeContainsPlanDay(scope, fromPlanDay) || !scopeContainsPlanDay(scope, toPlanDay))) continue;
    if (lockedPlanDays.has(fromPlanDay) || lockedPlanDays.has(toPlanDay)) continue;

    const fromIndex = week.days.findIndex((day) => day.dayNum === fromDayNum);
    const toIndex = week.days.findIndex((day) => day.dayNum === toDayNum);
    week.days[fromIndex] = cloneDayForPosition(toDay, fromDay);
    week.days[toIndex] = cloneDayForPosition(fromDay, toDay);
    changed = true;
  }

  return changed;
}

function buildAdjustedFutureSnapshot(
  currentSnapshot: PlanSnapshot,
  effectiveFromPlanDay: number,
  reason: PlanAdjustmentReason,
  feedback: string,
  scope?: AdjustmentScope | null,
  lockedPlanDays = new Set<number>(),
) {
  const nextSnapshot = parsePlanSnapshot(JSON.parse(JSON.stringify(currentSnapshot)));
  const changeStartPlanDay = Math.max(effectiveFromPlanDay, scope ? scopeStartPlanDay(scope) : effectiveFromPlanDay);
  const feedbackText = feedback.toLowerCase();
  const scheduleChanged = applyScheduleSwapFixture(nextSnapshot, feedback, scope, changeStartPlanDay, lockedPlanDays);

  nextSnapshot.weeks = nextSnapshot.weeks.map((week) => ({
    ...week,
    days: week.days.map((day) => {
      const planDay = planDayFromWeekDay(week.weekNum, day.dayNum);
      if (planDay < changeStartPlanDay) return day;
      if (scope && !scopeContainsPlanDay(scope, planDay)) return day;
      if (lockedPlanDays.has(planDay)) return day;
      if (scheduleChanged) return day;
      if (/\binjur|\bpain|\btweak|\bsore|\bhurt/.test(feedbackText)) return applyInjuryFixture(day, feedback);
      if (/\bswap|replace|substitute|change\b/.test(feedbackText)) return applyExerciseSwapFixture(day, feedback);
      return adjustedDay(day, reason, feedback);
    }),
  }));

  validateLockedHistoryUnchanged(currentSnapshot, nextSnapshot, effectiveFromPlanDay);
  if (scope) {
    validateAdjustmentScopeUnchanged(currentSnapshot, nextSnapshot, scope, changeStartPlanDay);
  }
  return nextSnapshot;
}

function validateLoggedDaysUnchanged(original: PlanSnapshot, adjusted: PlanSnapshot, lockedPlanDays: Set<number>) {
  if (lockedPlanDays.size === 0) return;

  const adjustedDays = new Map<string, DaySnapshot>();
  for (const week of adjusted.weeks) {
    for (const day of week.days) {
      adjustedDays.set(`${week.weekNum}:${day.dayNum}`, day);
    }
  }

  for (const week of original.weeks) {
    for (const day of week.days) {
      const planDay = planDayFromWeekDay(week.weekNum, day.dayNum);
      if (!lockedPlanDays.has(planDay)) continue;

      const adjustedDay = adjustedDays.get(`${week.weekNum}:${day.dayNum}`);
      if (!adjustedDay || JSON.stringify(day) !== JSON.stringify(adjustedDay)) {
        throw new Error(`Adjusted plan changed logged day week ${week.weekNum} day ${day.dayNum}`);
      }
    }
  }
}

function formatEffectiveFrom(effectiveFrom: { weekNum: number; dayNum: number; date: string }) {
  return `Week ${effectiveFrom.weekNum}, Day ${effectiveFrom.dayNum} (${effectiveFrom.date})`;
}

function parseAdjustmentScope(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return adjustmentScopeSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

function parseProposalChanges(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 12);
  } catch {
    return [];
  }
}

function formatAdjustmentSummary(params: {
  feedback: string;
  effectiveLabel: string;
}) {
  const feedback = params.feedback.trim().replace(/\s+/g, " ").slice(0, 500);
  if (feedback) {
    return `Request: ${feedback}. Effective from ${params.effectiveLabel}.`;
  }

  return `Adjusted future plan from ${params.effectiveLabel}.`;
}

function collectChangedDayRefs(
  original: PlanSnapshot,
  adjusted: PlanSnapshot,
  effectiveFromPlanDay: number,
  lockedPlanDays = new Set<number>(),
) {
  const adjustedDays = new Map<string, DaySnapshot>();
  for (const week of adjusted.weeks) {
    for (const day of week.days) {
      adjustedDays.set(`${week.weekNum}:${day.dayNum}`, day);
    }
  }

  const refs: Array<{ weekNum: number; dayNum: number; planDay: number; dayName: string; summary: string }> = [];
  for (const week of original.weeks) {
    for (const day of week.days) {
      const planDay = planDayFromWeekDay(week.weekNum, day.dayNum);
      if (planDay < effectiveFromPlanDay) continue;
      if (lockedPlanDays.has(planDay)) continue;

      const adjustedDay = adjustedDays.get(`${week.weekNum}:${day.dayNum}`);
      if (!adjustedDay || JSON.stringify(day) === JSON.stringify(adjustedDay)) continue;

      refs.push({
        weekNum: week.weekNum,
        dayNum: day.dayNum,
        planDay,
        dayName: adjustedDay.dayName,
        summary: day.focus === adjustedDay.focus
          ? `${adjustedDay.dayName}: prescription or coaching detail updated`
          : `${day.focus} -> ${adjustedDay.focus}`,
      });
    }
  }

  return refs;
}

function proposalWithRichChanges(proposal: AdjustmentChatProposal, originalSnapshot: PlanSnapshot) {
  return adjustmentChatProposalSchema.parse({
    ...proposal,
    richChanges: summarizeRichSnapshotChanges({
      original: originalSnapshot,
      adjusted: proposal.revisedPlanSnapshot,
      effectiveFromPlanDay: proposal.effectiveFromPlanDay,
    }),
  });
}

function restoreProtectedDays(params: {
  original: PlanSnapshot;
  adjusted: PlanSnapshot;
  effectiveFromPlanDay: number;
  lockedPlanDays: Set<number>;
}) {
  const adjustedWeeks = new Map(params.adjusted.weeks.map((week) => [week.weekNum, week]));

  return parsePlanSnapshot({
    ...params.original,
    planGuidance: params.adjusted.planGuidance ?? params.original.planGuidance ?? null,
    weeks: params.original.weeks.map((originalWeek) => {
      const adjustedWeek = adjustedWeeks.get(originalWeek.weekNum);
      const adjustedDays = new Map(adjustedWeek?.days.map((day) => [day.dayNum, day]) ?? []);

      return {
        ...(adjustedWeek ?? originalWeek),
        key: originalWeek.key,
        weekNum: originalWeek.weekNum,
        days: originalWeek.days.map((originalDay) => {
          const planDay = planDayFromWeekDay(originalWeek.weekNum, originalDay.dayNum);
          if (planDay < params.effectiveFromPlanDay || params.lockedPlanDays.has(planDay)) {
            return originalDay;
          }
          const adjustedDay = adjustedDays.get(originalDay.dayNum);
          return adjustedDay
            ? {
                ...adjustedDay,
                key: originalDay.key,
                dayNum: originalDay.dayNum,
                dayName: originalDay.dayName,
              }
            : originalDay;
        }),
      };
    }),
  });
}

function normalizedAdjustmentProposal(params: {
  proposal: AdjustmentChatProposal;
  originalSnapshot: PlanSnapshot;
  effectiveFromPlanDay: number;
  lockedPlanDays: Set<number>;
}) {
  const effectiveFromPlanDay = Math.max(params.proposal.effectiveFromPlanDay, params.effectiveFromPlanDay);
  const revisedPlanSnapshot = restoreProtectedDays({
    original: params.originalSnapshot,
    adjusted: params.proposal.revisedPlanSnapshot,
    effectiveFromPlanDay,
    lockedPlanDays: params.lockedPlanDays,
  });
  const changedRefs = collectChangedDayRefs(
    params.originalSnapshot,
    revisedPlanSnapshot,
    effectiveFromPlanDay,
    params.lockedPlanDays,
  );

  if (changedRefs.length === 0) {
    throw new Error("The adjustment did not produce any editable future changes after protecting logged days");
  }

  return proposalWithRichChanges(adjustmentChatProposalSchema.parse({
    ...params.proposal,
    effectiveFromPlanDay,
    changedDays: changedRefs.map((ref) => ({
      weekNum: ref.weekNum,
      dayNum: ref.dayNum,
      planDay: ref.planDay,
      summary: ref.summary,
    })),
    changedWeeks: Array.from(new Set(changedRefs.map((ref) => ref.weekNum))).sort((a, b) => a - b),
    revisedPlanSnapshot,
  }), params.originalSnapshot);
}

function inferAdjustmentReasonFromText(text: string): PlanAdjustmentReason {
  const normalized = text.toLowerCase();
  if (/\binjur|\bpain|\btweak|\bsore|\bhurt/.test(normalized)) return "injury";
  if (/\btravel|\btrip|\bhotel|\baway/.test(normalized)) return "travel";
  if (/\bmiss|\bmissed|\bsick|\bresume|\bcatch up/.test(normalized)) return "missed_time";
  if (/\bschedule|\bdays per week|\bavailable|\bavailability|\bbusy|\brest day|\bworkout day/.test(normalized)) return "schedule_change";
  if (/\bgoal|\btarget|\brace|\bevent|\bcompetition/.test(normalized)) return "new_goal";
  if (/\beasier|\breduce|\bless|\btired|\bfatigue|\brecover/.test(normalized)) return "too_hard";
  if (/\bharder|\bmore|\bextra|\badd|\bprogress/.test(normalized)) return "too_easy";
  return "other";
}

function mentionsExplicitGoalChange(text: string) {
  return (
    /\b(new|different|change|switch|replace)\b.*\b(goal|target|event|race|objective|sport|level|grade|date|block)\b/i.test(text) ||
    /\b(goal|target|event|race|objective|sport|level|grade|date|block)\b.*\b(new|different|change|switch|replace)\b/i.test(text)
  );
}

function latestUserAdjustmentText(messages: AdjustmentChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.content.trim() ?? "";
}

function parseAdjustmentMessages(value: FormDataEntryValue | null): AdjustmentChatMessage[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((message): message is AdjustmentChatMessage =>
        message &&
        typeof message === "object" &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0,
      )
      .map((message) => ({ role: message.role, content: message.content.trim().slice(0, 4000) }));
  } catch {
    return [];
  }
}

function fallbackAdjustmentChatProposal(params: {
  currentSnapshot: PlanSnapshot;
  feedback: string;
  effectiveFromPlanDay: number;
  lockedPlanDays: Set<number>;
}): AdjustmentChatProposal {
  const reason = inferAdjustmentReasonFromText(params.feedback);
  const revisedPlanSnapshot = buildAdjustedFutureSnapshot(
    params.currentSnapshot,
    params.effectiveFromPlanDay,
    reason,
    params.feedback,
    null,
    params.lockedPlanDays,
  );
  const changedRefs = collectChangedDayRefs(
    params.currentSnapshot,
    revisedPlanSnapshot,
    params.effectiveFromPlanDay,
    params.lockedPlanDays,
  );
  const changedDays = changedRefs.map((ref) => ({
    weekNum: ref.weekNum,
    dayNum: ref.dayNum,
    planDay: ref.planDay,
    summary: ref.summary,
  }));
  const changedWeeks = Array.from(new Set(changedDays.map((day) => day.weekNum))).sort((a, b) => a - b);
  const requiresGoalChangeConfirmation = mentionsExplicitGoalChange(params.feedback);

  return normalizedAdjustmentProposal({
    originalSnapshot: params.currentSnapshot,
    effectiveFromPlanDay: params.effectiveFromPlanDay,
    lockedPlanDays: params.lockedPlanDays,
    proposal: {
    summary: "I can adjust the remaining plan around your request.",
    changes: [
      "Keep logged days and completed exercises unchanged.",
      requiresGoalChangeConfirmation
        ? "This looks like a goal or target change and needs confirmation."
        : "Preserve the original sport, goal, target, and block length.",
    ],
    changedWeeks: changedWeeks.length ? changedWeeks : [Math.max(1, Math.ceil(params.effectiveFromPlanDay / 7))],
    changedDays: changedDays.length
      ? changedDays
      : [{
          ...weekDayFromPlanDay(params.effectiveFromPlanDay),
          planDay: params.effectiveFromPlanDay,
          summary: "No visible day-level changes were needed.",
        }],
    effectiveFromPlanDay: params.effectiveFromPlanDay,
    preservesOriginalGoal: !requiresGoalChangeConfirmation,
    requiresGoalChangeConfirmation,
    ...(requiresGoalChangeConfirmation
      ? { goalChange: { requestedByUser: true, summary: "User requested a goal or target change." } }
      : {}),
    revisedPlanSnapshot,
    },
  });
}

function dayRefForPlanDayFromStart(startDate: Date, planDay: number) {
  const { weekNum, dayNum } = weekDayFromPlanDay(planDay);
  const date = new Date(startDate);
  date.setDate(date.getDate() + planDay - 1);
  return {
    weekNum,
    dayNum,
    planDay,
    date: date.toISOString().slice(0, 10),
  };
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
  const gender = (formData.get("gender") as string | null) ?? "prefer_not_to_say";

  if (!firstName || !lastName || !email || !loginId || !password || !verifyPassword || !Number.isFinite(age)) {
    return { error: "All fields are required" };
  }
  if (!["male", "female", "prefer_not_to_say"].includes(gender)) return { error: "Choose a valid gender option" };
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
    data: { userId: loginId, firstName, lastName, email, age, gender, passwordHash },
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
  const planSnapshot = buildPlanSnapshot(weeks, buildPlanGuidance(profileSnapshot, weeks));

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
  coachName?: string;
  clientToday?: string;
  clientTimeZone?: string;
}): Promise<IntakeResponse> {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return { draft: {}, ready: false, assistantMessage: "SESSION_EXPIRED" };
  }
  await refreshSession(session);

  const draft = partialIntakeDraftSchema.parse(input.draft ?? {});
  return await continuePlanIntakeWithAiContract({
    draft,
    userMessage: input.userMessage,
    messages: input.messages,
    coachName: input.coachName,
    clientToday: input.clientToday,
    clientTimeZone: input.clientTimeZone,
  });
}

export async function createPlanFromIntake(formData: FormData) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");
  await refreshSession(session);

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

export async function revertPlanVersion(formData: FormData) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const planId = formData.get("planId");
  const versionId = formData.get("versionId");
  if (typeof planId !== "string" || typeof versionId !== "string") redirect("/dashboard");

  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId: session.userId },
    include: {
      currentVersion: true,
      versions: {
        where: { id: versionId },
        take: 1,
      },
    },
  });

  const selectedVersion = plan?.versions[0] ?? null;
  if (!plan?.currentVersion || !selectedVersion) redirect("/dashboard");

  if (plan.currentVersion.id === selectedVersion.id) {
    redirect(`/plan/${plan.id}`);
  }

  await createPlanVersion({
    planId: plan.id,
    profileSnapshot: parseProfileSnapshot(selectedVersion.profileSnapshot),
    planSnapshot: parsePlanSnapshot(selectedVersion.planSnapshot),
    changeType: "revert",
    changeSummary: selectedVersion.changeSummary,
    changeMetadata: {
      type: "revert",
      revertedToVersionId: selectedVersion.id,
      revertedToVersionNum: selectedVersion.versionNum,
      revertedFromVersionId: plan.currentVersion.id,
      revertedFromVersionNum: plan.currentVersion.versionNum,
    },
    basedOnVersionId: plan.currentVersion.id,
    effectiveFromWeek: null,
    effectiveFromDay: null,
  });

  redirect(`/plan/${plan.id}`);
}

export async function repairPlanGeneration(formData: FormData) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");
  await refreshSession(session);

  const planId = formData.get("planId");
  const repairNotesRaw = formData.get("repairNotes");

  if (typeof planId !== "string") redirect("/dashboard");

  const repairNotes =
    typeof repairNotesRaw === "string" && repairNotesRaw.trim()
      ? repairNotesRaw.trim().slice(0, 2000)
      : "Continue from the failed week using the prior generated weeks as context.";

  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId: session.userId },
    include: {
      currentVersion: true,
      generationJobs: {
        where: { status: "failed" },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });
  if (!plan) redirect("/dashboard");

  const job = plan.generationJobs[0] ?? null;

  if (!job) redirect(`/plan/${plan.id}`);

  const generatedRows = await prisma.planGenerationWeek.findMany({
    where: {
      jobId: job.id,
      planId: plan.id,
      userId: session.userId,
    },
    orderBy: { weekNum: "asc" },
  });
  const generatedWeeks = generatedRows.length;

  if (generatedWeeks >= job.totalWeeks) {
    const generatedSnapshot = composePlanSnapshotFromGeneratedWeeks(
      generatedRows.map((row) => row.weekSnapshot as unknown as WeekSnapshot),
    );

    await createPlanVersion({
      planId: plan.id,
      profileSnapshot: parseProfileSnapshot(job.profileSnapshot),
      planSnapshot: generatedSnapshot,
      changeType: "generated",
      changeSummary: "Initial AI-generated plan",
      basedOnVersionId: plan.currentVersion?.id ?? null,
    });

    await prisma.planGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "ready",
        lastError: null,
        lockedAt: null,
        repairNotes: null,
      },
    });

    redirect(`/plan/${plan.id}`);
  }

  const resumeWeek = Math.min(
    job.totalWeeks,
    Math.max(1, job.nextWeekNum, generatedWeeks + 1),
  );
  const retainedGeneratedWeeks = generatedRows.filter((row) => row.weekNum < resumeWeek).length;

  await prisma.$transaction(async (tx) => {
    await tx.planGenerationWeek.deleteMany({
      where: {
        jobId: job.id,
        weekNum: { gte: resumeWeek },
      },
    });

    await tx.planGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "pending",
        nextWeekNum: resumeWeek,
        lastError: null,
        lockedAt: null,
        repairNotes,
      },
    });

    await tx.plan.update({
      where: { id: plan.id },
      data: {
        generationStatus: "generating",
        generationError: null,
        generatedWeeks: retainedGeneratedWeeks,
        updatedAt: new Date(),
      },
    });
  });

  console.log(
    `[web] repaired plan generation plan=${plan.id} job=${job.id} resumeWeek=${resumeWeek}/${job.totalWeeks}`,
  );

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
  const actuals = parseActuals(formData);
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
    actuals,
    completed,
  });
}

export async function continuePlanAdjustmentChat(formData: FormData): Promise<PlanAdjustmentChatResponse> {
  const session = await getSession();
  if (!session.isLoggedIn) return { error: "Please sign in again" };

  const planId = formData.get("planId");
  if (typeof planId !== "string") return { error: "Missing plan" };

  const messages = parseAdjustmentMessages(formData.get("messages"));
  const activeWeekNumRaw = formData.get("activeWeekNum");
  const parsedActiveWeekNum = typeof activeWeekNumRaw === "string" ? parseInt(activeWeekNumRaw, 10) : NaN;
  const latestFeedback = latestUserAdjustmentText(messages);
  if (!latestFeedback) return { error: "Tell the coach what needs to change first" };

  const plan = await findOwnedPlanWithLogs(planId, session.userId);
  if (!plan?.currentVersion) return { error: "Plan not found" };

  const currentSnapshot = plan.currentVersion.planSnapshot;
  const profileSnapshot = parseProfileSnapshot(plan.currentVersion.profileSnapshot);
  const logs: WorkoutLogDayMarker[] = plan.workoutLogs
    .filter(hasMeaningfulWorkoutLog)
    .map((log) => ({
      weekNum: log.weekNum,
      dayNum: log.dayNum,
      sessionKey: log.sessionKey,
      exerciseKey: log.exerciseKey,
      exerciseName: log.exerciseName,
      completed: log.completed,
    }));
  const lockedPlanDays = new Set(logs.map((log) => planDayFromWeekDay(log.weekNum, log.dayNum)));
  const effectiveFrom = findNextUnloggedPlanDay({
    planStartDate: plan.startDate,
    currentDate: new Date(),
    snapshot: currentSnapshot,
    logs,
  });

  if (!effectiveFrom) {
    return { error: "There are no unlogged days left to adjust in this plan" };
  }

  const currentVersion = {
    id: plan.currentVersion.id,
    versionNum: plan.currentVersion.versionNum,
    profileSnapshot,
    planSnapshot: currentSnapshot,
  };
  const state = createAdjustmentChatState(messages);
  const context = buildAdjustmentChatContext({
    planId,
    planStartDate: plan.startDate,
    currentVersion,
    activeView: Number.isFinite(parsedActiveWeekNum)
      ? { weekNum: parsedActiveWeekNum, dayNum: null }
      : undefined,
    logs,
  });

  try {
    const response = shouldUseModelBackedAdjustmentChat()
      ? await generateAdjustmentChatResponse({ context, state })
      : {
          responseType: "proposal" as const,
          assistantMessage: "I have enough to propose a scoped adjustment. Review the affected areas below before applying it.",
          proposal: fallbackAdjustmentChatProposal({
            currentSnapshot,
            feedback: latestFeedback,
            effectiveFromPlanDay: effectiveFrom.planDay,
            lockedPlanDays,
          }),
        };

    if (response.responseType === "follow_up") {
      return {
        responseType: "follow_up",
        assistantMessage: response.question || response.assistantMessage,
      };
    }

    if (response.responseType === "intent") {
      return {
        responseType: "proposal",
        assistantMessage: response.assistantMessage,
        proposal: JSON.stringify(response.intent),
      };
    }

    const normalizedProposal = normalizedAdjustmentProposal({
      proposal: response.proposal,
      originalSnapshot: currentSnapshot,
      effectiveFromPlanDay: effectiveFrom.planDay,
      lockedPlanDays,
    });

    const validation = validateAdjustmentChatProposal({
      originalSnapshot: currentSnapshot,
      proposal: normalizedProposal,
      effectiveFromPlanDay: normalizedProposal.effectiveFromPlanDay,
      userExplicitlyRequestedGoalChange: mentionsExplicitGoalChange(latestFeedback),
    });
    if (!validation.ok) {
      return { error: `Adjustment proposal was rejected: ${validation.rejectedReasons.join("; ")}` };
    }

    return {
      responseType: "proposal",
      assistantMessage: response.assistantMessage,
      proposal: JSON.stringify(normalizedProposal),
    };
  } catch (error) {
    if (error instanceof AiAdjustmentJsonError) {
      console.warn(`[ai-adjustment] falling back to deterministic proposal after malformed live response: ${error.message}`);
      try {
        const fallbackProposal = fallbackAdjustmentChatProposal({
          currentSnapshot,
          feedback: latestFeedback,
          effectiveFromPlanDay: effectiveFrom.planDay,
          lockedPlanDays,
        });

        return {
          responseType: "proposal",
          assistantMessage: "The live coach response came back malformed, so I built a conservative adjustment proposal locally. Review it before applying.",
          proposal: JSON.stringify(fallbackProposal),
        };
      } catch (fallbackError) {
        return {
          error: `Adjustment proposal was rejected after live response repair failed: ${(fallbackError as Error).message}`,
        };
      }
    }
    return { error: (error as Error).message };
  }
}

async function saveConfirmedFutureAdjustment(input: ConfirmedPlanAdjustmentInput): Promise<FuturePlanAdjustmentResponse> {
  const session = await getSession();
  if (!session.isLoggedIn) return { error: "Please sign in again" };

  if (!input.planId) return { error: "Missing plan" };
  if (!input.feedback) return { error: "Tell the coach what needs to change first" };

  const plan = await findOwnedPlanWithLogs(input.planId, session.userId);
  if (!plan) return { error: "Plan not found" };

  const currentSnapshot = plan.currentVersion.planSnapshot;
  const profileSnapshot = parseProfileSnapshot(plan.currentVersion.profileSnapshot);
  const logs: WorkoutLogDayMarker[] = plan.workoutLogs
    .filter(hasMeaningfulWorkoutLog)
    .map((log) => ({
      weekNum: log.weekNum,
      dayNum: log.dayNum,
      sessionKey: log.sessionKey,
      exerciseKey: log.exerciseKey,
      exerciseName: log.exerciseName,
      completed: log.completed,
    }));
  const lockedPlanDays = new Set(logs.map((log) => planDayFromWeekDay(log.weekNum, log.dayNum)));

  const effectiveFrom = findNextUnloggedPlanDay({
    planStartDate: plan.startDate,
    currentDate: new Date(),
    snapshot: currentSnapshot,
    logs,
  });

  if (!effectiveFrom) {
    return { error: "There are no unlogged days left to adjust in this plan" };
  }

  const scopedStartPlanDay = input.scope
    ? Math.max(effectiveFrom.planDay, scopeStartPlanDay(input.scope))
    : effectiveFrom.planDay;
  const scopedEffectiveFrom = dayRefForPlanDayFromStart(plan.startDate, scopedStartPlanDay);

  const adjustmentRequest = buildPlanAdjustmentRequest({
    reason: input.reason,
    userFeedback: input.feedback,
    effectiveFrom: scopedEffectiveFrom,
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
      input.scope,
      lockedPlanDays,
    );
    validateLoggedDaysUnchanged(currentSnapshot, nextSnapshot, lockedPlanDays);
    const effectiveLabel = formatEffectiveFrom(adjustmentRequest.effectiveFrom);
    const summary = formatAdjustmentSummary({
      feedback: input.feedback,
      effectiveLabel,
    });
    const affectedDays = collectChangedDayRefs(
      currentSnapshot,
      nextSnapshot,
      adjustmentRequest.effectiveFrom.planDay,
    );

    await createPlanVersion({
      planId: input.planId,
      profileSnapshot,
      planSnapshot: nextSnapshot,
      changeType: "ai_chat_adjustment",
      changeSummary: summary,
      changeMetadata: {
        type: "ai_chat_adjustment",
        summary,
        changes: input.proposalChanges ?? [],
        scope: input.scope ?? null,
        affectedDays,
      },
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

async function saveConfirmedAiAdjustmentProposal(input: {
  planId: string;
  proposalRaw: string;
  feedback: string;
  goalChangeConfirmed?: boolean;
}): Promise<FuturePlanAdjustmentResponse> {
  const session = await getSession();
  if (!session.isLoggedIn) return { error: "Please sign in again" };

  const plan = await findOwnedPlanWithLogs(input.planId, session.userId);
  if (!plan?.currentVersion) return { error: "Plan not found" };

  let rawProposalJson: unknown;
  try {
    rawProposalJson = JSON.parse(input.proposalRaw);
  } catch {
    return { error: "Adjustment proposal could not be read" };
  }

  const parsedIntent = adjustmentIntentSchema.safeParse(rawProposalJson);
  if (parsedIntent.success) {
    return saveConfirmedAiAdjustmentIntent({
      planId: input.planId,
      intent: parsedIntent.data,
      feedback: input.feedback,
      goalChangeConfirmed: input.goalChangeConfirmed,
    });
  }

  const parsedProposal = adjustmentChatProposalSchema.safeParse(rawProposalJson);
  if (!parsedProposal.success) {
    return { error: "Adjustment proposal could not be read" };
  }

  const proposal = parsedProposal.data;
  if (proposal.requiresGoalChangeConfirmation && !input.goalChangeConfirmed) {
    return { error: "Confirm the goal change before applying this adjustment" };
  }

  const currentSnapshot = plan.currentVersion.planSnapshot;
  const profileSnapshot = parseProfileSnapshot(plan.currentVersion.profileSnapshot);
  const logs: WorkoutLogDayMarker[] = plan.workoutLogs
    .filter(hasMeaningfulWorkoutLog)
    .map((log) => ({
      weekNum: log.weekNum,
      dayNum: log.dayNum,
      sessionKey: log.sessionKey,
      exerciseKey: log.exerciseKey,
      exerciseName: log.exerciseName,
      completed: log.completed,
    }));
  const lockedPlanDays = new Set(logs.map((log) => planDayFromWeekDay(log.weekNum, log.dayNum)));
  const effectiveFrom = findNextUnloggedPlanDay({
    planStartDate: plan.startDate,
    currentDate: new Date(),
    snapshot: currentSnapshot,
    logs,
  });
  if (!effectiveFrom) {
    return { error: "There are no unlogged days left to adjust in this plan" };
  }

  const normalizedProposal = normalizedAdjustmentProposal({
    proposal,
    originalSnapshot: currentSnapshot,
    effectiveFromPlanDay: effectiveFrom.planDay,
    lockedPlanDays,
  });

  const validation = validateAdjustmentChatProposal({
    originalSnapshot: currentSnapshot,
    proposal: normalizedProposal,
    effectiveFromPlanDay: normalizedProposal.effectiveFromPlanDay,
    userExplicitlyRequestedGoalChange: mentionsExplicitGoalChange(input.feedback) || input.goalChangeConfirmed,
  });
  if (!validation.ok) {
    return { error: `Adjustment proposal was rejected: ${validation.rejectedReasons.join("; ")}` };
  }

  const richChanges = normalizedProposal.richChanges ?? { planGuidance: [], coaching: [], prescriptions: [] };
  const proposalEffective = dayRefForPlanDayFromStart(plan.startDate, normalizedProposal.effectiveFromPlanDay);
  const effectiveLabel = formatEffectiveFrom(proposalEffective);
  const summary = formatAdjustmentSummary({
    feedback: input.feedback || proposal.summary,
    effectiveLabel,
  });
  const dayNames = new Map<string, string>();
  for (const week of normalizedProposal.revisedPlanSnapshot.weeks) {
    for (const day of week.days) {
      dayNames.set(`${week.weekNum}:${day.dayNum}`, day.dayName);
    }
  }
  const affectedDays = normalizedProposal.changedDays.map((day) => ({
    weekNum: day.weekNum,
    dayNum: day.dayNum,
    planDay: day.planDay,
    dayName: dayNames.get(`${day.weekNum}:${day.dayNum}`) ?? `Day ${day.dayNum}`,
    summary: day.summary,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.planGenerationJob.create({
      data: {
        planId: input.planId,
        userId: plan.userId,
        jobType: "adjustment",
        baseVersionId: plan.currentVersion.id,
        status: "pending",
        totalWeeks: normalizedProposal.revisedPlanSnapshot.weeks.length,
        nextWeekNum: proposalEffective.weekNum,
        profileSnapshot: toStoredJson(profileSnapshot),
        changeMetadata: toStoredJson({
          type: "ai_chat_adjustment",
          summary,
          proposalSummary: summary,
          proposalChanges: [
            ...normalizedProposal.changes,
            ...richChanges.planGuidance,
            ...richChanges.coaching,
            ...richChanges.prescriptions,
          ],
          effectiveFromPlanDay: normalizedProposal.effectiveFromPlanDay,
          scope: null,
          affectedDays,
          richChanges,
          revisedPlanSnapshot: normalizedProposal.revisedPlanSnapshot,
        }),
      },
    });

    await tx.plan.update({
      where: { id: input.planId },
      data: {
        generationStatus: "pending",
        generationError: null,
        generatedWeeks: 0,
        updatedAt: new Date(),
      },
    });
  });

  return {
    ok: true,
    summary: `${summary} Generation has started and will apply after the adjusted weeks finish.`,
    effectiveFrom: effectiveLabel,
  };
}

async function saveConfirmedAiAdjustmentIntent(input: {
  planId: string;
  intent: AdjustmentIntent;
  feedback: string;
  goalChangeConfirmed?: boolean;
}): Promise<FuturePlanAdjustmentResponse> {
  const session = await getSession();
  if (!session.isLoggedIn) return { error: "Please sign in again" };

  const plan = await findOwnedPlanWithLogs(input.planId, session.userId);
  if (!plan?.currentVersion) return { error: "Plan not found" };

  if (input.intent.requiresGoalChangeConfirmation && !input.goalChangeConfirmed) {
    return { error: "Confirm the goal change before applying this adjustment" };
  }

  const currentSnapshot = plan.currentVersion.planSnapshot;
  const profileSnapshot = parseProfileSnapshot(plan.currentVersion.profileSnapshot);
  const logs: WorkoutLogDayMarker[] = plan.workoutLogs
    .filter(hasMeaningfulWorkoutLog)
    .map((log) => ({
      weekNum: log.weekNum,
      dayNum: log.dayNum,
      sessionKey: log.sessionKey,
      exerciseKey: log.exerciseKey,
      exerciseName: log.exerciseName,
      completed: log.completed,
    }));
  const lockedPlanDays = new Set(logs.map((log) => planDayFromWeekDay(log.weekNum, log.dayNum)));
  const effectiveFrom = findNextUnloggedPlanDay({
    planStartDate: plan.startDate,
    currentDate: new Date(),
    snapshot: currentSnapshot,
    logs,
  });
  if (!effectiveFrom) {
    return { error: "There are no unlogged days left to adjust in this plan" };
  }
  if (input.intent.effectiveFromPlanDay < effectiveFrom.planDay) {
    return { error: "Adjustment intent starts before the first editable plan day" };
  }

  const changedDays = input.intent.changedDays.filter((day) => day.planDay >= effectiveFrom.planDay && !lockedPlanDays.has(day.planDay));
  if (changedDays.length === 0) {
    return { error: "Adjustment intent did not include any editable future days" };
  }

  const adjustedWeekNums = Array.from(new Set(changedDays.map((day) => day.weekNum))).sort((a, b) => a - b);
  const firstWeek = adjustedWeekNums[0];
  const lastWeek = adjustedWeekNums[adjustedWeekNums.length - 1];
  const totalWeeks = lastWeek;
  const proposalEffective = dayRefForPlanDayFromStart(plan.startDate, input.intent.effectiveFromPlanDay);
  const effectiveLabel = formatEffectiveFrom(proposalEffective);
  const summary = formatAdjustmentSummary({
    feedback: input.feedback || input.intent.summary,
    effectiveLabel,
  });
  const dayNames = new Map<string, string>();
  for (const week of currentSnapshot.weeks) {
    for (const day of week.days) {
      dayNames.set(`${week.weekNum}:${day.dayNum}`, day.dayName);
    }
  }
  const affectedDays = changedDays.map((day) => ({
    weekNum: day.weekNum,
    dayNum: day.dayNum,
    planDay: day.planDay,
    dayName: dayNames.get(`${day.weekNum}:${day.dayNum}`) ?? `Day ${day.dayNum}`,
    summary: day.summary,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.planGenerationJob.create({
      data: {
        planId: input.planId,
        userId: plan.userId,
        jobType: "adjustment",
        baseVersionId: plan.currentVersion.id,
        status: "pending",
        totalWeeks,
        nextWeekNum: firstWeek,
        profileSnapshot: toStoredJson(profileSnapshot),
        changeMetadata: toStoredJson({
          type: "ai_chat_adjustment_intent",
          summary,
          proposalSummary: summary,
          proposalChanges: [
            ...input.intent.changes,
            ...input.intent.prescriptionChanges,
            ...input.intent.coachingChanges,
          ],
          effectiveFromPlanDay: input.intent.effectiveFromPlanDay,
          affectedDays,
          richChanges: {
            planGuidance: input.intent.richImpact.planGuidance ? input.intent.coachingChanges : [],
            coaching: input.intent.richImpact.dayCoaching || input.intent.richImpact.weekSummaries ? input.intent.coachingChanges : [],
            prescriptions: input.intent.richImpact.exercisePrescriptions ? input.intent.prescriptionChanges : [],
          },
          adjustmentIntent: {
            ...input.intent,
            changedDays,
            changedWeeks: adjustedWeekNums,
            targetWeeks: input.intent.targetWeeks.length ? input.intent.targetWeeks : adjustedWeekNums,
          },
        }),
      },
    });

    await tx.plan.update({
      where: { id: input.planId },
      data: {
        generationStatus: "pending",
        generationError: null,
        generatedWeeks: 0,
        updatedAt: new Date(),
      },
    });
  });

  return {
    ok: true,
    summary: `${summary} Generation has started and will apply after the adjusted weeks finish.`,
    effectiveFrom: effectiveLabel,
  };
}

export async function applyConfirmedPlanAdjustment(formData: FormData): Promise<FuturePlanAdjustmentResponse> {
  const planId = formData.get("planId");
  const feedback = (formData.get("feedback") as string | null)?.trim() ?? "";
  const proposalSummary = (formData.get("proposalSummary") as string | null)?.trim() ?? null;
  const goalChangeConfirmed = formData.get("goalChangeConfirmed") === "true";
  const proposalRaw = formData.get("proposal");

  if (typeof planId !== "string") return { error: "Missing plan" };
  if (typeof proposalRaw === "string" && proposalRaw.trim()) {
    try {
      return await saveConfirmedAiAdjustmentProposal({
        planId,
        proposalRaw,
        feedback,
        goalChangeConfirmed,
      });
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  if (formData.get("requiresGoalChangeConfirmation") === "true" && !goalChangeConfirmed) {
    return { error: "Confirm the goal change before applying this adjustment" };
  }

  return saveConfirmedFutureAdjustment({
    planId,
    feedback,
    reason: parseAdjustmentReason(formData.get("reason")),
    scope: parseAdjustmentScope(formData.get("adjustmentScope")),
    proposalSummary,
    proposalChanges: parseProposalChanges(formData.get("proposalChanges")),
    goalChangeConfirmed,
  });
}

export async function adjustFuturePlan(formData: FormData): Promise<FuturePlanAdjustmentResponse> {
  const planId = formData.get("planId");
  if (typeof planId !== "string") return { error: "Missing plan" };

  return saveConfirmedFutureAdjustment({
    planId,
    feedback: (formData.get("feedback") as string | null)?.trim() ?? "",
    reason: parseAdjustmentReason(formData.get("reason")),
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
      ...meaningfulWorkoutLogWhere,
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
      ...meaningfulWorkoutLogWhere,
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
