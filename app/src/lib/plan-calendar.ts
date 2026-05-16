const MS_PER_DAY = 86_400_000;
export const CLIENT_TIME_ZONE_COOKIE = "climb-client-time-zone";

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

function isoDateFromUtcDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoDateInTimeZone(date: Date, timeZone?: string | null) {
  if (!timeZone) return isoDateFromUtcDate(date);

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall through to UTC if the browser sent an invalid timezone.
  }

  return isoDateFromUtcDate(date);
}

function utcDayForIsoDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function normalizeTimeZone(timeZone?: string | null) {
  if (!timeZone) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return undefined;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export function getPlanCalendarStatus(params: {
  startDate: Date;
  totalWeeks: number;
  now?: Date;
  timeZone?: string | null;
}): PlanCalendarStatus {
  const totalPlanDays = Math.max(1, params.totalWeeks * 7);
  const now = params.now ?? new Date();
  const timeZone = normalizeTimeZone(params.timeZone);
  const startIsoDate = isoDateFromUtcDate(params.startDate);
  const todayIsoDate = isoDateInTimeZone(now, timeZone);
  const daysSinceStart = Math.floor((utcDayForIsoDate(todayIsoDate) - utcDayForIsoDate(startIsoDate)) / MS_PER_DAY);
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
