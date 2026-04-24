import type { PlanInput, WeekData } from "./plan-types";
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

export interface ProfileSnapshot extends PlanInput {
  createdAt: string;
}

export interface ExerciseSnapshot {
  key: string;
  name: string;
  sets: string | null;
  reps: string | null;
  duration: string | null;
  rest: string | null;
  notes: string | null;
}

export interface SessionSnapshot {
  key: string;
  name: string;
  description: string;
  duration: number;
  exercises: ExerciseSnapshot[];
}

export interface DaySnapshot {
  key: string;
  dayNum: number;
  dayName: string;
  focus: string;
  isRest: boolean;
  sessions: SessionSnapshot[];
}

export interface WeekSnapshot {
  key: string;
  weekNum: number;
  theme: string;
  days: DaySnapshot[];
}

export interface PlanSnapshot {
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
  weeks: WeekView[];
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "item";
}

export function createProfileSnapshot(input: PlanInput): ProfileSnapshot {
  return {
    ...input,
    createdAt: new Date().toISOString(),
  };
}

export function buildPlanSnapshot(weeks: WeekData[]): PlanSnapshot {
  return {
    weeks: weeks.map((week) => ({
      key: `week-${week.weekNum}`,
      weekNum: week.weekNum,
      theme: week.theme,
      days: week.days.map((day) => ({
        key: `w${week.weekNum}-d${day.dayNum}`,
        dayNum: day.dayNum,
        dayName: day.dayName,
        focus: day.focus,
        isRest: day.isRest,
        sessions: day.sessions.map((session, sessionIndex) => ({
          key: `w${week.weekNum}-d${day.dayNum}-s${sessionIndex + 1}-${slug(session.name)}`,
          name: session.name,
          description: session.description,
          duration: session.duration,
          exercises: session.exercises.map((exercise, exerciseIndex) => ({
            key: `w${week.weekNum}-d${day.dayNum}-s${sessionIndex + 1}-e${exerciseIndex + 1}-${slug(exercise.name)}`,
            name: exercise.name,
            sets: exercise.sets ?? null,
            reps: exercise.reps ?? null,
            duration: exercise.duration ?? null,
            rest: exercise.rest ?? null,
            notes: exercise.notes ?? null,
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
