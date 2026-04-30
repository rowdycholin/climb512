import { z } from "zod";
import type { PlanRequest } from "./plan-request";
import type { DaySnapshot, PlanSnapshot, ProfileSnapshot } from "./plan-snapshot";
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

const adjustmentExerciseSnapshotSchema = z.object({
  key: z.string().trim().min(1),
  name: z.string().trim().min(1),
  sets: nullableTextSchema,
  reps: nullableTextSchema,
  duration: nullableTextSchema,
  rest: nullableTextSchema,
  notes: nullableTextSchema,
});

const adjustmentSessionSnapshotSchema = z.object({
  key: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string(),
  duration: z.number().int().min(0).max(360),
  exercises: z.array(adjustmentExerciseSnapshotSchema),
});

const adjustmentDaySnapshotSchema = z.object({
  key: z.string().trim().min(1),
  dayNum: z.number().int().min(1).max(7),
  dayName: z.string().trim().min(1),
  focus: z.string().trim().min(1),
  isRest: z.boolean(),
  sessions: z.array(adjustmentSessionSnapshotSchema),
});

const adjustmentWeekSnapshotSchema = z.object({
  key: z.string().trim().min(1),
  weekNum: z.number().int().min(1),
  theme: z.string().trim().min(1),
  days: z.array(adjustmentDaySnapshotSchema).length(7),
});

export const adjustmentPlanSnapshotSchema = z.object({
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
  revisedPlanSnapshot: adjustmentPlanSnapshotSchema,
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

export const adjustmentChatModelResponseSchema = z.discriminatedUnion("responseType", [
  followUpResponseSchema,
  proposalResponseSchema,
]);

export type AdjustmentChatMessage = z.infer<typeof adjustmentChatMessageSchema>;
export type AdjustmentChatState = z.infer<typeof adjustmentChatStateSchema>;
export type AdjustmentChatModelResponse = z.infer<typeof adjustmentChatModelResponseSchema>;
export type AdjustmentChatProposal = z.infer<typeof adjustmentChatProposalSchema>;
export type AdjustmentProposalValidationResult = z.infer<typeof adjustmentProposalValidationResultSchema>;

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
    sessions: Array<{
      key: string;
      name: string;
      duration: number;
      exercises: Array<{
        key: string;
        name: string;
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
      sessions: day.sessions.map((session) => ({
        key: session.key,
        name: session.name,
        duration: session.duration,
        exercises: session.exercises.map((exercise) => ({
          key: exercise.key,
          name: exercise.name,
        })),
      })),
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
- If there is enough information, return a structured proposal.
- Do not create a brand-new plan. Adjust the existing plan only.
- Keep injury-related changes conservative and ask one follow-up question when risk is unclear.
- When returning a proposal, revisedPlanSnapshot must be the complete plan snapshot with every original week and day included.
- Keep all locked days unchanged.
- Keep stable keys for existing weeks, days, sessions, and exercises. New sessions or exercises may use new unique keys.
- Declare every changed day in changedDays and every changed week in changedWeeks.

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
2. Return a proposal if you have enough detail.

IMPORTANT PROPOSAL RULES:
- revisedPlanSnapshot must include every week from the current plan, not just changed weeks.
- Unchanged weeks and days must still be present.
- Locked history and logged exercise days must be byte-for-byte unchanged.
- changedDays must list every day whose snapshot changed.
- If the user wants to change sport, goal, target level/date, event, block length, or training days per week, set requiresGoalChangeConfirmation to true.

FOLLOW_UP SHAPE:
{
  "responseType": "follow_up",
  "assistantMessage": "short conversational response",
  "question": "one question"
}

PROPOSAL SHAPE:
{
  "responseType": "proposal",
  "assistantMessage": "short conversational response",
  "proposal": {
    "summary": "what will change",
    "changes": ["specific change"],
    "changedWeeks": [2],
    "changedDays": [{ "weekNum": 2, "dayNum": 1, "planDay": 8, "summary": "swap fingerboard work for technique volume" }],
    "effectiveFromPlanDay": 8,
    "preservesOriginalGoal": true,
    "requiresGoalChangeConfirmation": false,
    "revisedPlanSnapshot": { "weeks": [] }
  }
}`;
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

  if (proposal.effectiveFromPlanDay < params.effectiveFromPlanDay) {
    errors.push("Adjustment proposal starts before the first editable plan day");
  }

  try {
    validateLockedHistoryUnchanged(params.originalSnapshot, adjusted, params.effectiveFromPlanDay);
  } catch (error) {
    errors.push((error as Error).message);
  }

  for (const error of validateOriginalStructure(params.originalSnapshot, adjusted)) {
    addUniqueError(errors, error);
  }
  for (const error of collectDuplicateKeys(adjusted)) {
    addUniqueError(errors, error);
  }
  for (const error of validateFutureDayIdentity(params.originalSnapshot, adjusted, params.effectiveFromPlanDay)) {
    addUniqueError(errors, error);
  }
  for (const error of validateExistingKeyParents(params.originalSnapshot, adjusted)) {
    addUniqueError(errors, error);
  }
  for (const error of validateChangedDays({
    original: params.originalSnapshot,
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
