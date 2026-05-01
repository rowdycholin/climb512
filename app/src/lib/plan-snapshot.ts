import type { PlanInput, WeekData } from "./plan-types";
import type { PlanRequest } from "./plan-request";
import type { Prisma } from "@prisma/client";

interface WorkoutLogRecord {
  id: string;
  exerciseKey: string;
  setsCompleted: number | null;
  repsCompleted: string | null;
  weightUsed: string | null;
  durationActual: string | null;
  notes: string | null;
  completed: boolean;
}

export function hasMeaningfulWorkoutLog(log: {
  setsCompleted: number | null;
  repsCompleted: string | null;
  weightUsed: string | null;
  durationActual: string | null;
  notes: string | null;
  completed: boolean;
}) {
  return Boolean(
    log.completed
      || log.setsCompleted !== null
      || log.repsCompleted?.trim()
      || log.weightUsed?.trim()
      || log.durationActual?.trim()
      || log.notes?.trim(),
  );
}

export interface ProfileSnapshot extends PlanInput {
  createdAt: string;
  planRequest?: PlanRequest;
}

export interface ExerciseSnapshot {
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
}

export interface SessionSnapshot {
  key: string;
  name: string;
  description: string;
  duration: number;
  objective?: string | null;
  intensity?: string | null;
  warmup?: string | null;
  cooldown?: string | null;
  exercises: ExerciseSnapshot[];
}

export interface DaySnapshot {
  key: string;
  dayNum: number;
  dayName: string;
  focus: string;
  isRest: boolean;
  coachNotes?: string | null;
  sessions: SessionSnapshot[];
}

export interface WeekSnapshot {
  key: string;
  weekNum: number;
  theme: string;
  summary?: string | null;
  progressionNote?: string | null;
  days: DaySnapshot[];
}

export interface PlanGuidance {
  overview: string | null;
  intensityDistribution: Array<{ label: string; detail: string }>;
  progressionPrinciples: string[];
  recoveryPrinciples: string[];
  recommendations: string[];
  progressionTable: Array<Record<string, string>>;
}

export interface PlanSnapshot {
  planGuidance?: PlanGuidance | null;
  weeks: WeekSnapshot[];
}

export interface ExerciseLogView {
  id: string;
  setsCompleted: number | null;
  repsCompleted: string | null;
  weightUsed: string | null;
  durationActual: string | null;
  notes: string | null;
  completed: boolean;
}

export interface ExerciseView extends ExerciseSnapshot {
  id: string;
  logs: ExerciseLogView[];
}

export interface SessionView extends Omit<SessionSnapshot, "exercises"> {
  id: string;
  exercises: ExerciseView[];
}

export interface DayView extends Omit<DaySnapshot, "sessions"> {
  id: string;
  sessions: SessionView[];
}

export interface WeekView extends Omit<WeekSnapshot, "days"> {
  id: string;
  days: DayView[];
}

export interface PlanView {
  planGuidance: PlanGuidance | null;
  weeks: WeekView[];
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "item";
}

export function createProfileSnapshot(input: PlanInput, planRequest?: PlanRequest): ProfileSnapshot {
  return {
    ...input,
    createdAt: new Date().toISOString(),
    ...(planRequest ? { planRequest } : {}),
  };
}

function uniqueShort(values: string[], maxItems: number) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, maxItems);
}

function guidanceSport(profile: ProfileSnapshot) {
  return profile.planRequest?.sport ?? profile.discipline;
}

function guidanceEquipment(profile: ProfileSnapshot) {
  return profile.planRequest?.equipment ?? profile.equipment;
}

export function buildPlanGuidance(profile: ProfileSnapshot, weeks: Array<WeekData | WeekSnapshot>): PlanGuidance {
  const sport = guidanceSport(profile);
  const equipment = guidanceEquipment(profile).map((item) => item.toLowerCase());
  const weekRows = weeks
    .slice()
    .sort((a, b) => a.weekNum - b.weekNum)
    .slice(0, 6)
    .map((week) => {
      const trainingDays = week.days.filter((day) => !day.isRest);
      return {
        week: String(week.weekNum),
        theme: week.theme,
        trainingDays: String(trainingDays.length),
        keyFocus: uniqueShort(trainingDays.map((day) => day.focus), 3).join(", "),
      };
    });

  return {
    overview: `A ${profile.weeksDuration}-week ${sport} plan built around ${profile.daysPerWeek} training days per week.`,
    intensityDistribution: uniqueShort(
      weeks.flatMap((week) => week.days.filter((day) => !day.isRest).map((day) => `${day.dayName}: ${day.focus}`)),
      6,
    ).map((item) => {
      const [label, ...detail] = item.split(":");
      return { label: label.trim(), detail: detail.join(":").trim() };
    }),
    progressionPrinciples: [
      "Progress volume, intensity, or specificity gradually from week to week.",
      "Keep high-intensity work high quality rather than chasing fatigue.",
      "Use deload or consolidation weeks to absorb training before the next build.",
    ],
    recoveryPrinciples: [
      "Keep rest days truly easy unless the plan lists active recovery.",
      "Reduce session volume if pain or form breakdown appears.",
      "Prioritize consistency over making up missed work all at once.",
    ],
    recommendations: uniqueShort([
      equipment.some((item) => item.includes("hangboard")) ? "Use hangboard work only when fully warm and stop before finger pain." : "",
      equipment.some((item) => item.includes("board") || item.includes("kilter") || item.includes("tb2")) ? "Use board sessions for repeatable intensity and track the same problems over time." : "",
      equipment.some((item) => item.includes("weight") || item.includes("gym")) ? "Keep strength accessories crisp and supportive rather than turning them into exhaustion work." : "",
      `Keep the main goal in view: ${profile.goals.join(", ")}.`,
    ], 4),
    progressionTable: weekRows,
  };
}

export function buildPlanSnapshot(weeks: WeekData[], planGuidance: PlanGuidance | null = null): PlanSnapshot {
  return {
    planGuidance,
    weeks: weeks.map((week) => ({
      key: `week-${week.weekNum}`,
      weekNum: week.weekNum,
      theme: week.theme,
      summary: week.summary ?? null,
      progressionNote: week.progressionNote ?? null,
      days: week.days.map((day) => ({
        key: `w${week.weekNum}-d${day.dayNum}`,
        dayNum: day.dayNum,
        dayName: day.dayName,
        focus: day.focus,
        isRest: day.isRest,
        coachNotes: day.coachNotes ?? null,
        sessions: day.sessions.map((session, sessionIndex) => ({
          key: `w${week.weekNum}-d${day.dayNum}-s${sessionIndex + 1}-${slug(session.name)}`,
          name: session.name,
          description: session.description,
          duration: session.duration,
          objective: session.objective ?? null,
          intensity: session.intensity ?? null,
          warmup: session.warmup ?? null,
          cooldown: session.cooldown ?? null,
          exercises: session.exercises.map((exercise, exerciseIndex) => ({
            key: `w${week.weekNum}-d${day.dayNum}-s${sessionIndex + 1}-e${exerciseIndex + 1}-${slug(exercise.name)}`,
            name: exercise.name,
            sets: exercise.sets ?? null,
            reps: exercise.reps ?? null,
            duration: exercise.duration ?? null,
            rest: exercise.rest ?? null,
            notes: exercise.notes ?? null,
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
        })),
      })),
    })),
  };
}

export function parsePlanSnapshot(raw: unknown): PlanSnapshot {
  return raw as PlanSnapshot;
}

export function parseProfileSnapshot(raw: unknown): ProfileSnapshot {
  return raw as ProfileSnapshot;
}

export function toStoredJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function buildPlanView(snapshot: PlanSnapshot, logs: WorkoutLogRecord[]): PlanView {
  const logMap = new Map<string, ExerciseLogView[]>();
  for (const log of logs) {
    if (!hasMeaningfulWorkoutLog(log)) continue;
    const entry: ExerciseLogView = {
      id: log.id,
      setsCompleted: log.setsCompleted,
      repsCompleted: log.repsCompleted,
      weightUsed: log.weightUsed,
      durationActual: log.durationActual,
      notes: log.notes,
      completed: log.completed,
    };
    const existing = logMap.get(log.exerciseKey) ?? [];
    existing.push(entry);
    logMap.set(log.exerciseKey, existing);
  }

  return {
    planGuidance: snapshot.planGuidance ?? null,
    weeks: snapshot.weeks.map((week) => ({
      ...week,
      id: week.key,
      days: week.days.map((day) => ({
        ...day,
        id: day.key,
        sessions: day.sessions.map((session) => ({
          ...session,
          id: session.key,
          exercises: session.exercises.map((exercise) => ({
            ...exercise,
            id: exercise.key,
            logs: logMap.get(exercise.key) ?? [],
          })),
        })),
      })),
    })),
  };
}

export function findExerciseInSnapshot(snapshot: PlanSnapshot, exerciseKey: string) {
  for (const week of snapshot.weeks) {
    for (const day of week.days) {
      for (const session of day.sessions) {
        for (const exercise of session.exercises) {
          if (exercise.key === exerciseKey) {
            return {
              week,
              day,
              session,
              exercise,
            };
          }
        }
      }
    }
  }

  return null;
}
