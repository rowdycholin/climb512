const MS_PER_DAY = 86_400_000;

export interface PlanCalendarStatus {
  startDateLabel: string;
  currentPlanDay: number;
  totalPlanDays: number;
  currentWeekIndex: number;
  currentDayIndex: number;
  isComplete: boolean;
  isBeforeStart: boolean;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export function getPlanCalendarStatus(params: {
  startDate: Date;
  totalWeeks: number;
  now?: Date;
}): PlanCalendarStatus {
  const totalPlanDays = Math.max(1, params.totalWeeks * 7);
  const now = params.now ?? new Date();
  const daysSinceStart = Math.floor((startOfUtcDay(now) - startOfUtcDay(params.startDate)) / MS_PER_DAY);
  const isBeforeStart = daysSinceStart < 0;
  const isComplete = daysSinceStart >= totalPlanDays;
  const currentPlanDay = isBeforeStart ? 0 : clamp(daysSinceStart + 1, 1, totalPlanDays);
  const zeroBasedDay = clamp(daysSinceStart, 0, totalPlanDays - 1);

  return {
    startDateLabel: dateFormatter.format(params.startDate),
    currentPlanDay,
    totalPlanDays,
    currentWeekIndex: Math.floor(zeroBasedDay / 7),
    currentDayIndex: zeroBasedDay % 7,
    isComplete,
    isBeforeStart,
  };
}
