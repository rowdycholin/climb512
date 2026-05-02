import { z } from "zod";
import type { PlanRequest } from "./plan-request";
import type {
  DaySnapshot,
  ExerciseSnapshot,
  PlanGuidance,
  PlanSnapshot,
  ProfileSnapshot,
  SessionSnapshot,
} from "./plan-snapshot";
import {
  findNextUnloggedPlanDay,
  planDayFromWeekDay,
  splitPlanByEffectiveDay,
  validateLockedHistoryUnchanged,
  type AdjustmentDayRef,
  type WorkoutLogDayMarker,
} from "./plan-adjustment-request";

export const adjustmentChatRoleSchema = z.enum(["user", "assistant"]);

export const adjustmentChatMessageSchema = z.object({
  role: adjustmentChatRoleSchema,
  content: z.string().trim().min(1).max(4000),
});

export const adjustmentChatStateSchema = z.object({
  messages: z.array(adjustmentChatMessageSchema).default([]),
});

const followUpResponseSchema = z.object({
  responseType: z.literal("follow_up"),
  assistantMessage: z.string().trim().min(1).max(1000),
  question: z.string().trim().min(1).max(500),
});

const nullableTextSchema = z.string().nullable();
const optionalNullableTextSchema = nullableTextSchema.optional();

const adjustmentExerciseSnapshotSchema = z.object({
  key: z.string().trim().min(1),
  name: z.string().trim().min(1),
  sets: nullableTextSchema,
  reps: nullableTextSchema,
  duration: nullableTextSchema,
  rest: nullableTextSchema,
  notes: nullableTextSchema,
  rounds: optionalNullableTextSchema,
  work: optionalNullableTextSchema,
  restBetweenReps: optionalNullableTextSchema,
  restBetweenSets: optionalNullableTextSchema,
  load: optionalNullableTextSchema,
  intensity: optionalNullableTextSchema,
  tempo: optionalNullableTextSchema,
  distance: optionalNullableTextSchema,
  grade: optionalNullableTextSchema,
  sides: optionalNullableTextSchema,
  holdType: optionalNullableTextSchema,
  prescriptionDetails: optionalNullableTextSchema,
  modifications: optionalNullableTextSchema,
});

const adjustmentSessionSnapshotSchema = z.object({
  key: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string(),
  duration: z.number().int().min(0).max(360),
  objective: optionalNullableTextSchema,
  intensity: optionalNullableTextSchema,
  warmup: optionalNullableTextSchema,
  cooldown: optionalNullableTextSchema,
  exercises: z.array(adjustmentExerciseSnapshotSchema),
});

const adjustmentDaySnapshotSchema = z.object({
  key: z.string().trim().min(1),
  dayNum: z.number().int().min(1).max(7),
  dayName: z.string().trim().min(1),
  focus: z.string().trim().min(1),
  isRest: z.boolean(),
  coachNotes: optionalNullableTextSchema,
  sessions: z.array(adjustmentSessionSnapshotSchema),
});

const adjustmentWeekSnapshotSchema = z.object({
  key: z.string().trim().min(1),
  weekNum: z.number().int().min(1),
  theme: z.string().trim().min(1),
  summary: optionalNullableTextSchema,
  progressionNote: optionalNullableTextSchema,
  days: z.array(adjustmentDaySnapshotSchema).length(7),
});

const adjustmentPlanGuidanceSchema = z.object({
  overview: nullableTextSchema,
  intensityDistribution: z.array(z.object({
    label: z.string(),
    detail: z.string(),
  })),
  progressionPrinciples: z.array(z.string()),
  recoveryPrinciples: z.array(z.string()),
  recommendations: z.array(z.string()),
  progressionTable: z.array(z.record(z.string(), z.string())),
});

export const adjustmentPlanSnapshotSchema = z.object({
  planGuidance: adjustmentPlanGuidanceSchema.nullable().optional(),
  weeks: z.array(adjustmentWeekSnapshotSchema).min(1),
});

export const adjustmentGoalChangeSchema = z.object({
  requestedByUser: z.boolean(),
  summary: z.string().trim().min(1).max(500),
  revisedGoals: z
    .object({
      sport: z.string().trim().min(1).nullable().optional(),
      goalType: z.string().trim().min(1).nullable().optional(),
      goalDescription: z.string().trim().min(1).optional(),
      targetDate: z.string().trim().min(1).nullable().optional(),
      currentLevel: z.string().trim().min(1).optional(),
      targetLevel: z.string().trim().min(1).optional(),
      blockLengthWeeks: z.number().int().min(1).optional(),
      daysPerWeek: z.number().int().min(1).max(14).optional(),
    })
    .optional(),
});

const adjustmentRichChangeSummarySchema = z.object({
  planGuidance: z.array(z.string()).default([]),
  coaching: z.array(z.string()).default([]),
  prescriptions: z.array(z.string()).default([]),
});

export const adjustmentChatProposalSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  changes: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
  changedWeeks: z.array(z.number().int().min(1)).min(1),
  changedDays: z
    .array(
      z.object({
        weekNum: z.number().int().min(1),
        dayNum: z.number().int().min(1).max(7),
        planDay: z.number().int().min(1),
        summary: z.string().trim().min(1).max(300),
      }),
    )
    .min(1),
  effectiveFromPlanDay: z.number().int().min(1),
  preservesOriginalGoal: z.boolean(),
  requiresGoalChangeConfirmation: z.boolean(),
  goalChange: adjustmentGoalChangeSchema.optional(),
  richChanges: adjustmentRichChangeSummarySchema.optional(),
  revisedPlanSnapshot: adjustmentPlanSnapshotSchema,
});

export const adjustmentIntentSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  changes: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
  changedWeeks: z.array(z.number().int().min(1)).min(1),
  changedDays: z
    .array(
      z.object({
        weekNum: z.number().int().min(1),
        dayNum: z.number().int().min(1).max(7),
        planDay: z.number().int().min(1),
        summary: z.string().trim().min(1).max(300),
      }),
    )
    .min(1),
  effectiveFromPlanDay: z.number().int().min(1),
  preservesOriginalGoal: z.boolean(),
  requiresGoalChangeConfirmation: z.boolean(),
  goalChange: adjustmentGoalChangeSchema.optional(),
  safetyRationale: z.string().trim().min(1).max(500),
  targetWeeks: z.array(z.number().int().min(1)).default([]),
  targetDayTypes: z.array(z.string().trim().min(1).max(80)).default([]),
  targetSessionTypes: z.array(z.string().trim().min(1).max(80)).default([]),
  prescriptionChanges: z.array(z.string().trim().min(1).max(300)).default([]),
  coachingChanges: z.array(z.string().trim().min(1).max(300)).default([]),
  richImpact: z
    .object({
      planGuidance: z.boolean().default(false),
      weekSummaries: z.boolean().default(false),
      dayCoaching: z.boolean().default(false),
      exercisePrescriptions: z.boolean().default(true),
    })
    .default({
      planGuidance: false,
      weekSummaries: false,
      dayCoaching: false,
      exercisePrescriptions: true,
    }),
});

export const adjustmentProposalValidationResultSchema = z.object({
  ok: z.boolean(),
  rejectedReasons: z.array(z.string()),
});

const proposalResponseSchema = z.object({
  responseType: z.literal("proposal"),
  assistantMessage: z.string().trim().min(1).max(1000),
  proposal: adjustmentChatProposalSchema,
});

const intentResponseSchema = z.object({
  responseType: z.literal("intent"),
  assistantMessage: z.string().trim().min(1).max(1000),
  intent: adjustmentIntentSchema,
});

export const adjustmentChatModelResponseSchema = z.discriminatedUnion("responseType", [
  followUpResponseSchema,
  intentResponseSchema,
  proposalResponseSchema,
]);

export type AdjustmentChatMessage = z.infer<typeof adjustmentChatMessageSchema>;
export type AdjustmentChatState = z.infer<typeof adjustmentChatStateSchema>;
export type AdjustmentChatModelResponse = z.infer<typeof adjustmentChatModelResponseSchema>;
export type AdjustmentChatProposal = z.infer<typeof adjustmentChatProposalSchema>;
export type AdjustmentIntent = z.infer<typeof adjustmentIntentSchema>;
export type AdjustmentProposalValidationResult = z.infer<typeof adjustmentProposalValidationResultSchema>;
export type AdjustmentRichChangeSummary = z.infer<typeof adjustmentRichChangeSummarySchema>;

export interface AdjustmentChatContext {
  planId: string;
  originalPlanGoals: {
    sport: string | null;
    goalType: string | null;
    goalDescription: string;
    targetDate: string | null;
    currentLevel: string;
    targetLevel: string;
    blockLengthWeeks: number;
    daysPerWeek: number;
  };
  currentVersion: {
    id: string;
    versionNum: number;
  };
  planGuidance: PlanGuidance | null;
  activeView?: {
    weekNum: number;
    dayNum: number | null;
  };
  effectiveFrom: AdjustmentDayRef | null;
  lockedHistory: {
    throughPlanDay: number;
    completedDays: Array<{
      weekNum: number;
      dayNum: number;
      planDay: number;
      exerciseKeys: string[];
    }>;
    loggedExercises: WorkoutLogDayMarker[];
  };
  adjustableFuture: Array<{
    weekNum: number;
    dayNum: number;
    planDay: number;
    focus: string;
    isRest: boolean;
    summary?: string | null;
    progressionNote?: string | null;
    coachNotes?: string | null;
    sessions: Array<{
      key: string;
      name: string;
      description: string;
      duration: number;
      objective?: string | null;
      intensity?: string | null;
      warmup?: string | null;
      cooldown?: string | null;
      exercises: Array<{
        key: string;
        name: string;
        sets: string | null;
        reps: string | null;
        duration: string | null;
        rest: string | null;
        notes: string | null;
        rounds?: string | null;
        work?: string | null;
        restBetweenReps?: string | null;
        restBetweenSets?: string | null;
        load?: string | null;
        intensity?: string | null;
        tempo?: string | null;
        distance?: string | null;
        grade?: string | null;
        sides?: string | null;
        holdType?: string | null;
        prescriptionDetails?: string | null;
        modifications?: string | null;
      }>;
    }>;
  }>;
}

export function createAdjustmentChatState(messages: AdjustmentChatMessage[] = []): AdjustmentChatState {
  return adjustmentChatStateSchema.parse({ messages });
}

export function appendAdjustmentChatMessage(
  state: AdjustmentChatState,
  message: AdjustmentChatMessage,
): AdjustmentChatState {
  return adjustmentChatStateSchema.parse({
    messages: [...state.messages, message],
  });
}

function planRequestGoals(profile: ProfileSnapshot, planRequest: PlanRequest | undefined) {
  return {
    sport: planRequest?.sport ?? null,
    goalType: planRequest?.goalType ?? null,
    goalDescription: planRequest?.goalDescription ?? profile.goals.join(", "),
    targetDate: planRequest?.targetDate ?? null,
    currentLevel: planRequest?.currentLevel ?? profile.currentGrade,
    targetLevel: planRequest?.targetLevel ?? profile.targetGrade,
    blockLengthWeeks: planRequest?.blockLengthWeeks ?? profile.weeksDuration,
    daysPerWeek: planRequest?.daysPerWeek ?? profile.daysPerWeek,
  };
}

function lockedCompletedDays(logs: WorkoutLogDayMarker[]) {
  const byPlanDay = new Map<number, {
    weekNum: number;
    dayNum: number;
    planDay: number;
    exerciseKeys: string[];
  }>();

  for (const log of logs) {
    const planDay = planDayFromWeekDay(log.weekNum, log.dayNum);
    const existing = byPlanDay.get(planDay) ?? {
      weekNum: log.weekNum,
      dayNum: log.dayNum,
      planDay,
      exerciseKeys: [],
    };
    existing.exerciseKeys.push(log.exerciseKey);
    byPlanDay.set(planDay, existing);
  }

  return Array.from(byPlanDay.values()).sort((a, b) => a.planDay - b.planDay);
}

function richSessionContext(session: SessionSnapshot) {
  return {
    key: session.key,
    name: session.name,
    description: session.description,
    duration: session.duration,
    objective: session.objective ?? null,
    intensity: session.intensity ?? null,
    warmup: session.warmup ?? null,
    cooldown: session.cooldown ?? null,
    exercises: session.exercises.map((exercise) => ({
      key: exercise.key,
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      duration: exercise.duration,
      rest: exercise.rest,
      notes: exercise.notes,
      rounds: exercise.rounds ?? null,
      work: exercise.work ?? null,
      restBetweenReps: exercise.restBetweenReps ?? null,
      restBetweenSets: exercise.restBetweenSets ?? null,
      load: exercise.load ?? null,
      intensity: exercise.intensity ?? null,
      tempo: exercise.tempo ?? null,
      distance: exercise.distance ?? null,
      grade: exercise.grade ?? null,
      sides: exercise.sides ?? null,
      holdType: exercise.holdType ?? null,
      prescriptionDetails: exercise.prescriptionDetails ?? null,
      modifications: exercise.modifications ?? null,
    })),
  };
}

export function buildAdjustmentChatContext(params: {
  planId: string;
  planStartDate: Date;
  currentDate?: Date;
  currentVersion: {
    id: string;
    versionNum: number;
    profileSnapshot: ProfileSnapshot;
    planSnapshot: PlanSnapshot;
  };
  activeView?: {
    weekNum: number;
    dayNum?: number | null;
  };
  logs: WorkoutLogDayMarker[];
}): AdjustmentChatContext {
  const currentDate = params.currentDate ?? new Date();
  const effectiveFrom = findNextUnloggedPlanDay({
    planStartDate: params.planStartDate,
    currentDate,
    snapshot: params.currentVersion.planSnapshot,
    logs: params.logs,
  });
  const effectiveFromPlanDay = effectiveFrom?.planDay ?? Number.MAX_SAFE_INTEGER;
  const split = splitPlanByEffectiveDay(params.currentVersion.planSnapshot, effectiveFromPlanDay);

  return {
    planId: params.planId,
    originalPlanGoals: planRequestGoals(
      params.currentVersion.profileSnapshot,
      params.currentVersion.profileSnapshot.planRequest,
    ),
    currentVersion: {
      id: params.currentVersion.id,
      versionNum: params.currentVersion.versionNum,
    },
    planGuidance: params.currentVersion.planSnapshot.planGuidance ?? null,
    activeView: params.activeView
      ? {
          weekNum: params.activeView.weekNum,
          dayNum: params.activeView.dayNum ?? null,
        }
      : undefined,
    effectiveFrom,
    lockedHistory: {
      throughPlanDay: Math.max(0, effectiveFromPlanDay - 1),
      completedDays: lockedCompletedDays(params.logs),
      loggedExercises: params.logs,
    },
    adjustableFuture: split.adjustableDays.map(({ week, day, planDay }) => ({
      weekNum: week.weekNum,
      dayNum: day.dayNum,
      planDay,
      focus: day.focus,
      isRest: day.isRest,
      summary: week.summary ?? null,
      progressionNote: week.progressionNote ?? null,
      coachNotes: day.coachNotes ?? null,
      sessions: day.sessions.map(richSessionContext),
    })),
  };
}

export function buildAdjustmentChatSystemPrompt() {
  return `You are an expert training-plan adjustment coach.

Your job is to help adjust an existing training plan through conversation.

Boundaries:
- Preserve locked history. Do not edit days or exercises before the effective-from day.
- Default to preserving the original plan goal, sport, target, schedule, and block length.
- If the user explicitly asks to change the goal, label it as a goal change and require confirmation.
- Ask at most one follow-up question at a time.
- If there is enough information, return a structured adjustment intent.
- Do not create a brand-new plan. Adjust the existing plan only.
- Keep injury-related changes conservative and ask one follow-up question when risk is unclear.
- Do not return a full revised plan snapshot.
- Keep all locked days unchanged.
- Declare every changed day in changedDays and every changed week in changedWeeks.
- Preserve planGuidance and rich coaching fields unless the user's request intentionally changes the larger training intent.
- Preserve structured prescription fields such as work, restBetweenSets, load, intensity, grade, tempo, distance, and modifications when changing unrelated text.
- When work/rest/load/intensity or coaching details should change, describe those changes in prescriptionChanges, coachingChanges, and changedDays summaries.

Return JSON only.`;
}

export function buildAdjustmentChatUserPrompt(params: {
  context: AdjustmentChatContext;
  state: AdjustmentChatState;
}) {
  return `ADJUSTMENT_CONTEXT_JSON:
${JSON.stringify(params.context)}

MESSAGE_HISTORY_JSON:
${JSON.stringify(params.state.messages)}

RESPONSE OPTIONS:
1. Ask exactly one follow-up question if you need more detail.
2. Return an adjustment intent if you have enough detail.

IMPORTANT INTENT RULES:
- Do NOT return revisedPlanSnapshot.
- changedDays should list the days the worker should adjust based on the request and effective-from day.
- Keep logged history protected. effectiveFromPlanDay must be >= ADJUSTMENT_CONTEXT_JSON.effectiveFrom.planDay.
- Describe the intended training changes precisely enough for a week generator to apply them later.
- Use prescriptionChanges for work/rest/load/intensity/RPE/volume changes.
- Use coachingChanges for plan guidance, week summaries, day coach notes, session objective/intensity/warmup/cooldown, or modifications.
- If the user wants to change sport, goal, target level/date, event, block length, or training days per week, set requiresGoalChangeConfirmation to true.

FOLLOW_UP SHAPE:
{
  "responseType": "follow_up",
  "assistantMessage": "short conversational response",
  "question": "one question"
}

INTENT SHAPE:
{
  "responseType": "intent",
  "assistantMessage": "short conversational response",
  "intent": {
    "summary": "what will change",
    "changes": ["specific change"],
    "changedWeeks": [2],
    "changedDays": [{ "weekNum": 2, "dayNum": 1, "planDay": 8, "summary": "reduce fingerboard intensity by 1-2 RPE" }],
    "effectiveFromPlanDay": 8,
    "preservesOriginalGoal": true,
    "requiresGoalChangeConfirmation": false,
    "safetyRationale": "keeps logged work fixed and changes future load gradually",
    "targetWeeks": [2,3,4],
    "targetDayTypes": ["training days"],
    "targetSessionTypes": ["fingerboard", "limit bouldering"],
    "prescriptionChanges": ["reduce fingerboard intensity by 1-2 RPE", "keep warmups and cooldowns unchanged"],
    "coachingChanges": ["add recovery-focused coach notes on adjusted days"],
    "richImpact": { "planGuidance": false, "weekSummaries": true, "dayCoaching": true, "exercisePrescriptions": true }
  }
}`;
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function changedText(label: string, before: unknown, after: unknown) {
  const oldValue = nullableText(before);
  const newValue = nullableText(after);
  if (oldValue === newValue) return null;
  if (oldValue && newValue) return `${label}: ${oldValue} -> ${newValue}`;
  if (newValue) return `${label}: added ${newValue}`;
  return `${label}: removed`;
}

function objectChanged(before: unknown, after: unknown) {
  return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
}

function sessionByKey(day: DaySnapshot) {
  return new Map(day.sessions.map((session) => [session.key, session]));
}

function exerciseByKey(session: SessionSnapshot) {
  return new Map(session.exercises.map((exercise) => [exercise.key, exercise]));
}

const sessionRichFields = ["objective", "intensity", "warmup", "cooldown"] as const;
const exercisePrescriptionFields = [
  "sets",
  "reps",
  "duration",
  "rest",
  "rounds",
  "work",
  "restBetweenReps",
  "restBetweenSets",
  "load",
  "intensity",
  "tempo",
  "distance",
  "grade",
  "sides",
  "holdType",
  "prescriptionDetails",
  "modifications",
] as const;

function dayLabel(weekNum: number, day: DaySnapshot) {
  return `Week ${weekNum}, ${day.dayName}`;
}

function summarizePlanGuidanceChanges(original: PlanSnapshot, adjusted: PlanSnapshot) {
  const changes: string[] = [];
  const originalGuidance = original.planGuidance ?? null;
  const adjustedGuidance = adjusted.planGuidance ?? null;

  if (!objectChanged(originalGuidance, adjustedGuidance)) return changes;
  if (!originalGuidance && adjustedGuidance) return ["Plan guidance added"];
  if (originalGuidance && !adjustedGuidance) return ["Plan guidance removed"];

  for (const field of ["overview", "intensityDistribution", "progressionPrinciples", "recoveryPrinciples", "recommendations", "progressionTable"] as const) {
    if (objectChanged(originalGuidance?.[field], adjustedGuidance?.[field])) {
      changes.push(`Plan guidance ${field} changed`);
    }
  }

  return changes;
}

export function summarizeRichSnapshotChanges(params: {
  original: PlanSnapshot;
  adjusted: PlanSnapshot;
  effectiveFromPlanDay: number;
}): AdjustmentRichChangeSummary {
  const planGuidance = summarizePlanGuidanceChanges(params.original, params.adjusted);
  const coaching: string[] = [];
  const prescriptions: string[] = [];
  const adjustedWeeks = new Map(params.adjusted.weeks.map((week) => [week.weekNum, week]));

  for (const originalWeek of params.original.weeks) {
    const adjustedWeek = adjustedWeeks.get(originalWeek.weekNum);
    if (!adjustedWeek) continue;

    const weekSummaryChange = changedText(`Week ${originalWeek.weekNum} summary`, originalWeek.summary, adjustedWeek.summary);
    if (weekSummaryChange) coaching.push(weekSummaryChange);
    const weekProgressionChange = changedText(`Week ${originalWeek.weekNum} progression`, originalWeek.progressionNote, adjustedWeek.progressionNote);
    if (weekProgressionChange) coaching.push(weekProgressionChange);

    const adjustedDays = new Map(adjustedWeek.days.map((day) => [day.dayNum, day]));
    for (const originalDay of originalWeek.days) {
      const planDay = planDayFromWeekDay(originalWeek.weekNum, originalDay.dayNum);
      if (planDay < params.effectiveFromPlanDay) continue;
      const adjustedDay = adjustedDays.get(originalDay.dayNum);
      if (!adjustedDay) continue;

      const coachNotesChange = changedText(`${dayLabel(originalWeek.weekNum, originalDay)} coach notes`, originalDay.coachNotes, adjustedDay.coachNotes);
      if (coachNotesChange) coaching.push(coachNotesChange);

      const adjustedSessions = sessionByKey(adjustedDay);
      for (const originalSession of originalDay.sessions) {
        const adjustedSession = adjustedSessions.get(originalSession.key);
        if (!adjustedSession) continue;

        for (const field of sessionRichFields) {
          const change = changedText(`${dayLabel(originalWeek.weekNum, originalDay)} ${originalSession.name} ${field}`, originalSession[field], adjustedSession[field]);
          if (change) coaching.push(change);
        }

        const adjustedExercises = exerciseByKey(adjustedSession);
        for (const originalExercise of originalSession.exercises) {
          const adjustedExercise = adjustedExercises.get(originalExercise.key);
          if (!adjustedExercise) continue;

          for (const field of exercisePrescriptionFields) {
            const change = changedText(
              `${dayLabel(originalWeek.weekNum, originalDay)} ${originalExercise.name} ${field}`,
              originalExercise[field as keyof ExerciseSnapshot],
              adjustedExercise[field as keyof ExerciseSnapshot],
            );
            if (change) prescriptions.push(change);
          }
        }
      }
    }
  }

  return adjustmentRichChangeSummarySchema.parse({
    planGuidance: planGuidance.slice(0, 6),
    coaching: coaching.slice(0, 10),
    prescriptions: prescriptions.slice(0, 12),
  });
}

function addUniqueError(errors: string[], message: string) {
  if (!errors.includes(message)) {
    errors.push(message);
  }
}

function dayByWeekDay(snapshot: PlanSnapshot) {
  const days = new Map<string, DaySnapshot>();
  for (const week of snapshot.weeks) {
    for (const day of week.days) {
      days.set(`${week.weekNum}:${day.dayNum}`, day);
    }
  }
  return days;
}

function collectSnapshotKeyParents(snapshot: PlanSnapshot) {
  const weekKeys = new Map<string, number>();
  const dayKeys = new Map<string, string>();
  const sessionKeys = new Map<string, string>();
  const exerciseKeys = new Map<string, string>();

  for (const week of snapshot.weeks) {
    weekKeys.set(week.key, week.weekNum);
    for (const day of week.days) {
      dayKeys.set(day.key, week.key);
      for (const session of day.sessions) {
        sessionKeys.set(session.key, day.key);
        for (const exercise of session.exercises) {
          exerciseKeys.set(exercise.key, session.key);
        }
      }
    }
  }

  return { weekKeys, dayKeys, sessionKeys, exerciseKeys };
}

function collectDuplicateKeys(snapshot: PlanSnapshot) {
  const errors: string[] = [];
  const seen = new Set<string>();
  const check = (label: string, key: string) => {
    const compound = `${label}:${key}`;
    if (seen.has(compound)) {
      errors.push(`Adjusted plan contains duplicate ${label} key ${key}`);
    }
    seen.add(compound);
  };

  for (const week of snapshot.weeks) {
    check("week", week.key);
    const dayNums = new Set<number>();
    for (const day of week.days) {
      check("day", day.key);
      if (dayNums.has(day.dayNum)) {
        errors.push(`Adjusted week ${week.weekNum} contains duplicate day number ${day.dayNum}`);
      }
      dayNums.add(day.dayNum);

      const sessionKeys = new Set<string>();
      for (const session of day.sessions) {
        check("session", session.key);
        if (sessionKeys.has(session.key)) {
          errors.push(`Adjusted day ${week.weekNum}:${day.dayNum} contains duplicate session key ${session.key}`);
        }
        sessionKeys.add(session.key);

        const exerciseKeys = new Set<string>();
        for (const exercise of session.exercises) {
          check("exercise", exercise.key);
          if (exerciseKeys.has(exercise.key)) {
            errors.push(`Adjusted session ${session.key} contains duplicate exercise key ${exercise.key}`);
          }
          exerciseKeys.add(exercise.key);
        }
      }
    }
  }

  return errors;
}

function validateOriginalStructure(original: PlanSnapshot, adjusted: PlanSnapshot) {
  const errors: string[] = [];
  const adjustedWeeksByNum = new Map(adjusted.weeks.map((week) => [week.weekNum, week]));

  for (const week of original.weeks) {
    const adjustedWeek = adjustedWeeksByNum.get(week.weekNum);
    if (!adjustedWeek) {
      errors.push(`Adjusted plan removed week ${week.weekNum}`);
      continue;
    }
    if (adjustedWeek.key !== week.key) {
      errors.push(`Adjusted plan changed week ${week.weekNum} key`);
    }
    if (adjustedWeek.days.length !== 7) {
      errors.push(`Adjusted week ${week.weekNum} must contain exactly 7 days`);
    }
  }

  if (adjusted.weeks.length !== original.weeks.length) {
    errors.push("Adjusted plan changed the number of weeks");
  }

  return errors;
}

function validateFutureDayIdentity(original: PlanSnapshot, adjusted: PlanSnapshot, effectiveFromPlanDay: number) {
  const errors: string[] = [];
  const adjustedDays = dayByWeekDay(adjusted);

  for (const week of original.weeks) {
    for (const day of week.days) {
      const planDay = planDayFromWeekDay(week.weekNum, day.dayNum);
      if (planDay < effectiveFromPlanDay) continue;

      const adjustedDay = adjustedDays.get(`${week.weekNum}:${day.dayNum}`);
      if (!adjustedDay) {
        errors.push(`Adjusted plan removed future day week ${week.weekNum} day ${day.dayNum}`);
        continue;
      }
      if (adjustedDay.key !== day.key) {
        errors.push(`Adjusted plan changed future day key week ${week.weekNum} day ${day.dayNum}`);
      }
    }
  }

  return errors;
}

function validateExistingKeyParents(original: PlanSnapshot, adjusted: PlanSnapshot) {
  const errors: string[] = [];
  const originalKeys = collectSnapshotKeyParents(original);
  const adjustedKeys = collectSnapshotKeyParents(adjusted);

  for (const [key, weekNum] of Array.from(adjustedKeys.weekKeys)) {
    const originalWeekNum = originalKeys.weekKeys.get(key);
    if (originalWeekNum !== undefined && originalWeekNum !== weekNum) {
      errors.push(`Adjusted plan moved existing week key ${key}`);
    }
  }

  for (const [key, parent] of Array.from(adjustedKeys.dayKeys)) {
    const originalParent = originalKeys.dayKeys.get(key);
    if (originalParent !== undefined && originalParent !== parent) {
      errors.push(`Adjusted plan moved existing day key ${key}`);
    }
  }

  for (const [key, parent] of Array.from(adjustedKeys.sessionKeys)) {
    const originalParent = originalKeys.sessionKeys.get(key);
    if (originalParent !== undefined && originalParent !== parent) {
      errors.push(`Adjusted plan moved existing session key ${key}`);
    }
  }

  for (const [key, parent] of Array.from(adjustedKeys.exerciseKeys)) {
    const originalParent = originalKeys.exerciseKeys.get(key);
    if (originalParent !== undefined && originalParent !== parent) {
      errors.push(`Adjusted plan moved existing exercise key ${key}`);
    }
  }

  return errors;
}

function validateChangedDays(params: {
  original: PlanSnapshot;
  adjusted: PlanSnapshot;
  proposal: AdjustmentChatProposal;
  effectiveFromPlanDay: number;
}) {
  const errors: string[] = [];
  const originalDays = dayByWeekDay(params.original);
  const adjustedDays = dayByWeekDay(params.adjusted);

  for (const changedDay of params.proposal.changedDays) {
    const expectedPlanDay = planDayFromWeekDay(changedDay.weekNum, changedDay.dayNum);
    if (changedDay.planDay !== expectedPlanDay) {
      errors.push(`Changed day week ${changedDay.weekNum} day ${changedDay.dayNum} has the wrong planDay`);
    }
    if (changedDay.planDay < params.effectiveFromPlanDay) {
      errors.push(`Changed day week ${changedDay.weekNum} day ${changedDay.dayNum} is before the effective-from day`);
    }
  }

  for (const changedWeek of params.proposal.changedWeeks) {
    if (!params.proposal.changedDays.some((day) => day.weekNum === changedWeek)) {
      errors.push(`Changed week ${changedWeek} has no changed day entry`);
    }
  }

  for (const originalWeek of params.original.weeks) {
    const adjustedWeek = params.adjusted.weeks.find((week) => week.weekNum === originalWeek.weekNum);
    if (!adjustedWeek) continue;

    for (const originalDay of originalWeek.days) {
      const planDay = planDayFromWeekDay(originalWeek.weekNum, originalDay.dayNum);
      if (planDay < params.effectiveFromPlanDay) continue;

      const adjustedDay = adjustedDays.get(`${originalWeek.weekNum}:${originalDay.dayNum}`);
      if (!adjustedDay) continue;

      const changed = JSON.stringify(originalDays.get(`${originalWeek.weekNum}:${originalDay.dayNum}`)) !== JSON.stringify(adjustedDay);
      const declared = params.proposal.changedDays.some(
        (day) => day.weekNum === originalWeek.weekNum && day.dayNum === originalDay.dayNum,
      );
      if (changed && !declared) {
        errors.push(`Adjusted plan changed week ${originalWeek.weekNum} day ${originalDay.dayNum} without declaring it`);
      }
    }
  }

  return errors;
}

function validateGoalBoundary(params: {
  proposal: AdjustmentChatProposal;
  userExplicitlyRequestedGoalChange: boolean;
}) {
  const errors: string[] = [];
  const goalChangeRequestedByProposal =
    !params.proposal.preservesOriginalGoal ||
    params.proposal.requiresGoalChangeConfirmation ||
    Boolean(params.proposal.goalChange);

  if (goalChangeRequestedByProposal && !params.userExplicitlyRequestedGoalChange) {
    errors.push("Adjustment proposal changes the original plan goal without an explicit user request");
  }

  if (params.proposal.goalChange && params.proposal.goalChange.requestedByUser !== params.userExplicitlyRequestedGoalChange) {
    errors.push("Adjustment proposal goal-change flag does not match the user's explicit request");
  }

  return errors;
}

export function validateAdjustmentChatProposal(params: {
  originalSnapshot: PlanSnapshot;
  proposal: unknown;
  effectiveFromPlanDay: number;
  userExplicitlyRequestedGoalChange?: boolean;
}): AdjustmentProposalValidationResult {
  const errors: string[] = [];
  const parsed = adjustmentChatProposalSchema.safeParse(params.proposal);
  if (!parsed.success) {
    return {
      ok: false,
      rejectedReasons: parsed.error.issues.map((issue) => `${issue.path.join(".") || "proposal"}: ${issue.message}`),
    };
  }

  const proposal = parsed.data;
  const adjusted = proposal.revisedPlanSnapshot;
  const original = adjustmentPlanSnapshotSchema.parse(params.originalSnapshot);

  if (proposal.effectiveFromPlanDay < params.effectiveFromPlanDay) {
    errors.push("Adjustment proposal starts before the first editable plan day");
  }

  try {
    validateLockedHistoryUnchanged(original, adjusted, params.effectiveFromPlanDay);
  } catch (error) {
    errors.push((error as Error).message);
  }

  for (const error of validateOriginalStructure(original, adjusted)) {
    addUniqueError(errors, error);
  }
  for (const error of collectDuplicateKeys(adjusted)) {
    addUniqueError(errors, error);
  }
  for (const error of validateFutureDayIdentity(original, adjusted, params.effectiveFromPlanDay)) {
    addUniqueError(errors, error);
  }
  for (const error of validateExistingKeyParents(original, adjusted)) {
    addUniqueError(errors, error);
  }
  for (const error of validateChangedDays({
    original,
    adjusted,
    proposal,
    effectiveFromPlanDay: params.effectiveFromPlanDay,
  })) {
    addUniqueError(errors, error);
  }
  for (const error of validateGoalBoundary({
    proposal,
    userExplicitlyRequestedGoalChange: params.userExplicitlyRequestedGoalChange ?? false,
  })) {
    addUniqueError(errors, error);
  }

  return adjustmentProposalValidationResultSchema.parse({
    ok: errors.length === 0,
    rejectedReasons: errors,
  });
}
