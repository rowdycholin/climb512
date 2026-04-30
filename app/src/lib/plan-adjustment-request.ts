import { z } from "zod";
import type { PlanRequest } from "./plan-request";
import type { PlanSnapshot, ProfileSnapshot, WeekSnapshot, DaySnapshot } from "./plan-snapshot";

export const planAdjustmentReasonSchema = z.enum([
  "too_hard",
  "too_easy",
  "missed_time",
  "injury",
  "travel",
  "new_goal",
  "schedule_change",
  "other",
]);

export const adjustmentDayRefSchema = z.object({
  weekNum: z.number().int().min(1),
  dayNum: z.number().int().min(1).max(7),
  planDay: z.number().int().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const lockedCompletedDaySchema = adjustmentDayRefSchema.extend({
  exerciseKeys: z.array(z.string().min(1)),
});

export const lockedLoggedExerciseSchema = z.object({
  weekNum: z.number().int().min(1),
  dayNum: z.number().int().min(1).max(7),
  sessionKey: z.string().min(1),
  exerciseKey: z.string().min(1),
  exerciseName: z.string().min(1),
  completed: z.boolean(),
});

export const adjustmentScopeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("day_only"),
    startWeek: z.number().int().min(1),
    startDay: z.number().int().min(1).max(7),
    endWeek: z.number().int().min(1),
    endDay: z.number().int().min(1).max(7),
  }),
  z.object({
    type: z.literal("week_only"),
    startWeek: z.number().int().min(1),
    endWeek: z.number().int().min(1),
  }),
  z.object({
    type: z.literal("date_range"),
    startWeek: z.number().int().min(1),
    startDay: z.number().int().min(1).max(7),
    endWeek: z.number().int().min(1),
    endDay: z.number().int().min(1).max(7),
  }),
  z.object({
    type: z.literal("future_from_day"),
    startWeek: z.number().int().min(1),
    startDay: z.number().int().min(1).max(7),
  }),
]);

export const planAdjustmentRequestSchema = z.object({
  reason: planAdjustmentReasonSchema,
  userFeedback: z.string().trim().min(1).max(2000),
  requestedEffectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  effectiveFrom: adjustmentDayRefSchema,
  lockedContext: z.object({
    completedDays: z.array(lockedCompletedDaySchema),
    loggedExercises: z.array(lockedLoggedExerciseSchema),
    currentPlanVersionId: z.string().min(1),
    currentPlanVersionNum: z.number().int().min(1),
    originalPlanRequest: z.custom<PlanRequest>().optional(),
    profileSnapshot: z.custom<ProfileSnapshot>(),
    userFeedback: z.string().trim().min(1).max(2000),
  }),
});

export type PlanAdjustmentReason = z.infer<typeof planAdjustmentReasonSchema>;
export type AdjustmentDayRef = z.infer<typeof adjustmentDayRefSchema>;
export type LockedCompletedDay = z.infer<typeof lockedCompletedDaySchema>;
export type LockedLoggedExercise = z.infer<typeof lockedLoggedExerciseSchema>;
export type AdjustmentScope = z.infer<typeof adjustmentScopeSchema>;
export type PlanAdjustmentRequest = z.infer<typeof planAdjustmentRequestSchema>;

export interface WorkoutLogDayMarker {
  weekNum: number;
  dayNum: number;
  sessionKey: string;
  exerciseKey: string;
  exerciseName: string;
  completed: boolean;
}

export interface PlanVersionAdjustmentContext {
  id: string;
  versionNum: number;
  profileSnapshot: ProfileSnapshot;
}

export function planDayFromWeekDay(weekNum: number, dayNum: number) {
  return (weekNum - 1) * 7 + dayNum;
}

export function scopeContainsPlanDay(scope: AdjustmentScope, planDay: number) {
  switch (scope.type) {
    case "day_only":
    case "date_range": {
      const start = planDayFromWeekDay(scope.startWeek, scope.startDay);
      const end = planDayFromWeekDay(scope.endWeek, scope.endDay);
      return planDay >= start && planDay <= end;
    }
    case "week_only": {
      const start = planDayFromWeekDay(scope.startWeek, 1);
      const end = planDayFromWeekDay(scope.endWeek, 7);
      return planDay >= start && planDay <= end;
    }
    case "future_from_day":
      return planDay >= planDayFromWeekDay(scope.startWeek, scope.startDay);
  }
}

export function scopeStartPlanDay(scope: AdjustmentScope) {
  switch (scope.type) {
    case "day_only":
    case "date_range":
    case "future_from_day":
      return planDayFromWeekDay(scope.startWeek, scope.startDay);
    case "week_only":
      return planDayFromWeekDay(scope.startWeek, 1);
  }
}

export function validateAdjustmentScopeUnchanged(
  original: PlanSnapshot,
  adjusted: PlanSnapshot,
  scope: AdjustmentScope,
  effectiveFromPlanDay: number,
) {
  const adjustedDays = new Map<string, DaySnapshot>();
  for (const week of adjusted.weeks) {
    for (const day of week.days) {
      adjustedDays.set(`${week.weekNum}:${day.dayNum}`, day);
    }
  }

  for (const week of original.weeks) {
    for (const day of week.days) {
      const planDay = planDayFromWeekDay(week.weekNum, day.dayNum);
      if (planDay >= effectiveFromPlanDay && scopeContainsPlanDay(scope, planDay)) continue;

      const adjustedDay = adjustedDays.get(`${week.weekNum}:${day.dayNum}`);
      if (!adjustedDay) {
        throw new Error(`Adjusted plan removed out-of-scope day week ${week.weekNum} day ${day.dayNum}`);
      }

      if (JSON.stringify(day) !== JSON.stringify(adjustedDay)) {
        throw new Error(`Adjusted plan changed out-of-scope day week ${week.weekNum} day ${day.dayNum}`);
      }
    }
  }
}

export function weekDayFromPlanDay(planDay: number) {
  return {
    weekNum: Math.floor((planDay - 1) / 7) + 1,
    dayNum: ((planDay - 1) % 7) + 1,
  };
}

function isoDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dayRefForPlanDay(startDate: Date, planDay: number): AdjustmentDayRef {
  const { weekNum, dayNum } = weekDayFromPlanDay(planDay);
  return {
    weekNum,
    dayNum,
    planDay,
    date: isoDateOnly(addDays(startOfLocalDay(startDate), planDay - 1)),
  };
}

function maxPlanDay(snapshot: PlanSnapshot) {
  return snapshot.weeks.reduce((max, week) => Math.max(max, ...week.days.map((day) => planDayFromWeekDay(week.weekNum, day.dayNum))), 0);
}

function loggedPlanDays(logs: WorkoutLogDayMarker[]) {
  return new Set(logs.map((log) => planDayFromWeekDay(log.weekNum, log.dayNum)));
}

export function findNextUnloggedPlanDay(params: {
  planStartDate: Date;
  currentDate: Date;
  snapshot: PlanSnapshot;
  logs: WorkoutLogDayMarker[];
}): AdjustmentDayRef | null {
  const start = startOfLocalDay(params.planStartDate);
  const current = startOfLocalDay(params.currentDate);
  const elapsedDays = Math.floor((current.getTime() - start.getTime()) / 86_400_000);
  const firstCandidate = Math.max(1, elapsedDays + 1);
  const lastPlanDay = maxPlanDay(params.snapshot);
  const loggedDays = loggedPlanDays(params.logs);

  for (let planDay = firstCandidate; planDay <= lastPlanDay; planDay++) {
    if (!loggedDays.has(planDay)) {
      return dayRefForPlanDay(start, planDay);
    }
  }

  return null;
}

export function splitPlanByEffectiveDay(snapshot: PlanSnapshot, effectiveFromPlanDay: number) {
  const lockedDays: Array<{ week: WeekSnapshot; day: DaySnapshot; planDay: number }> = [];
  const adjustableDays: Array<{ week: WeekSnapshot; day: DaySnapshot; planDay: number }> = [];

  for (const week of snapshot.weeks) {
    for (const day of week.days) {
      const planDay = planDayFromWeekDay(week.weekNum, day.dayNum);
      const entry = { week, day, planDay };
      if (planDay < effectiveFromPlanDay) {
        lockedDays.push(entry);
      } else {
        adjustableDays.push(entry);
      }
    }
  }

  return { lockedDays, adjustableDays };
}

export function validateLockedHistoryUnchanged(
  original: PlanSnapshot,
  adjusted: PlanSnapshot,
  effectiveFromPlanDay: number,
) {
  const adjustedDays = new Map<string, DaySnapshot>();
  for (const week of adjusted.weeks) {
    for (const day of week.days) {
      adjustedDays.set(`${week.weekNum}:${day.dayNum}`, day);
    }
  }

  for (const week of original.weeks) {
    for (const day of week.days) {
      const planDay = planDayFromWeekDay(week.weekNum, day.dayNum);
      if (planDay >= effectiveFromPlanDay) continue;

      const adjustedDay = adjustedDays.get(`${week.weekNum}:${day.dayNum}`);
      if (!adjustedDay) {
        throw new Error(`Adjusted plan removed locked day week ${week.weekNum} day ${day.dayNum}`);
      }

      if (JSON.stringify(day) !== JSON.stringify(adjustedDay)) {
        throw new Error(`Adjusted plan changed locked day week ${week.weekNum} day ${day.dayNum}`);
      }
    }
  }
}

export function buildPlanAdjustmentRequest(params: {
  reason: PlanAdjustmentReason;
  userFeedback: string;
  requestedEffectiveDate?: string;
  effectiveFrom: AdjustmentDayRef;
  planStartDate: Date;
  currentVersion: PlanVersionAdjustmentContext;
  logs: WorkoutLogDayMarker[];
}): PlanAdjustmentRequest {
  const start = startOfLocalDay(params.planStartDate);
  const loggedByDay = new Map<number, LockedCompletedDay>();
  for (const log of params.logs) {
    const planDay = planDayFromWeekDay(log.weekNum, log.dayNum);
    const existing = loggedByDay.get(planDay) ?? {
      weekNum: log.weekNum,
      dayNum: log.dayNum,
      planDay,
      date: isoDateOnly(addDays(start, planDay - 1)),
      exerciseKeys: [],
    };
    existing.exerciseKeys.push(log.exerciseKey);
    loggedByDay.set(planDay, existing);
  }

  const request = {
    reason: params.reason,
    userFeedback: params.userFeedback,
    ...(params.requestedEffectiveDate ? { requestedEffectiveDate: params.requestedEffectiveDate } : {}),
    effectiveFrom: params.effectiveFrom,
    lockedContext: {
      completedDays: Array.from(loggedByDay.values()),
      loggedExercises: params.logs.map((log) => ({
        weekNum: log.weekNum,
        dayNum: log.dayNum,
        sessionKey: log.sessionKey,
        exerciseKey: log.exerciseKey,
        exerciseName: log.exerciseName,
        completed: log.completed,
      })),
      currentPlanVersionId: params.currentVersion.id,
      currentPlanVersionNum: params.currentVersion.versionNum,
      originalPlanRequest: params.currentVersion.profileSnapshot.planRequest,
      profileSnapshot: params.currentVersion.profileSnapshot,
      userFeedback: params.userFeedback,
    },
  };

  return planAdjustmentRequestSchema.parse(request);
}
