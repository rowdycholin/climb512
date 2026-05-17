"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CirclePlus, Copy, Trash2 } from "lucide-react";
import { saveEditedWeek } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ExerciseLog {
  completed: boolean;
}

interface Exercise {
  id: string;
  name: string;
  sets: string | null;
  reps: string | null;
  duration: string | null;
  rest: string | null;
  notes: string | null;
  logs: ExerciseLog[];
}

interface DaySession {
  id: string;
  name: string;
  description: string;
  duration: number;
  exercises: Exercise[];
}

interface Day {
  id: string;
  dayNum: number;
  dayName: string;
  focus: string;
  isRest: boolean;
  sessions: DaySession[];
}

interface Week {
  id: string;
  weekNum: number;
  theme: string;
  days: Day[];
}

interface EditableExercise {
  id: string;
  name: string;
  sets: string | null;
  reps: string | null;
  duration: string | null;
  rest: string | null;
  notes: string | null;
}

interface EditableSession {
  id: string;
  name: string;
  description: string;
  duration: number;
  exercises: EditableExercise[];
}

interface EditableDay {
  id: string;
  dayName: string;
  focus: string;
  isRest: boolean;
  sessions: EditableSession[];
}

interface EditableWeek {
  id: string;
  theme: string;
  days: EditableDay[];
}

function toEditableWeek(week: Week): EditableWeek {
  return {
    id: week.id,
    theme: week.theme,
    days: week.days.map((day) => ({
      id: day.id,
      dayName: day.dayName,
      focus: day.focus,
      isRest: day.isRest,
      sessions: day.sessions.map((session) => ({
        id: session.id,
        name: session.name,
        description: session.description,
        duration: session.duration,
        exercises: session.exercises.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          sets: exercise.sets,
          reps: exercise.reps,
          duration: exercise.duration,
          rest: exercise.rest,
          notes: exercise.notes,
        })),
      })),
    })),
  };
}

function cloneWeek(week: EditableWeek) {
  return JSON.parse(JSON.stringify(week)) as EditableWeek;
}

function newExerciseId(sessionId: string) {
  return `${sessionId}-custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function newSessionId(dayId: string) {
  return `${dayId}-custom-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isCustomExerciseId(id: string) {
  return id.includes("-custom-");
}

function createDefaultSession(dayId: string, dayName: string): EditableSession {
  return {
    id: newSessionId(dayId),
    name: `${dayName} Session`,
    description: "Custom training session",
    duration: 45,
    exercises: [],
  };
}

export default function PlanEditor({
  planId,
  week,
  dayId,
  isOpen,
  onOpenChange,
}: {
  planId: string;
  week: Week;
  dayId?: string | null;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [draft, setDraft] = useState<EditableWeek>(() => toEditableWeek(week));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const selectedDayIndex = useMemo(() => {
    if (dayId) {
      const index = draft.days.findIndex((day) => day.id === dayId);
      if (index >= 0) return index;
    }

    return -1;
  }, [dayId, draft.days]);
  const selectedDay = draft.days[selectedDayIndex] ?? null;

  const hasLogs = useMemo(
    () =>
      week.days.some((day) =>
        day.sessions.some((session) =>
          session.exercises.some((exercise) => exercise.logs.length > 0),
        ),
      ),
    [week.days],
  );

  const isEditing = isOpen ?? internalOpen;

  function setEditing(nextValue: boolean | ((value: boolean) => boolean)) {
    const next = typeof nextValue === "function" ? nextValue(isEditing) : nextValue;
    if (onOpenChange) {
      onOpenChange(next);
      return;
    }

    setInternalOpen(next);
  }

  useEffect(() => {
    setDraft(toEditableWeek(week));
    if (!onOpenChange) {
      setInternalOpen(false);
    }
    setError(null);
  }, [onOpenChange, week]);

  function updateDraft(updater: (current: EditableWeek) => EditableWeek) {
    setDraft((current) => updater(cloneWeek(current)));
  }

  function removeExercise(dayIndex: number, sessionIndex: number, exerciseIndex: number) {
    updateDraft((current) => {
      current.days[dayIndex].sessions[sessionIndex].exercises.splice(exerciseIndex, 1);
      return current;
    });
  }

  function duplicateExercise(dayIndex: number, sessionIndex: number, exerciseIndex: number) {
    updateDraft((current) => {
      const session = current.days[dayIndex].sessions[sessionIndex];
      const source = session.exercises[exerciseIndex];
      session.exercises.splice(exerciseIndex + 1, 0, {
        ...source,
        id: newExerciseId(session.id),
        name: `${source.name} Copy`,
      });
      return current;
    });
  }

  function moveExerciseWithinDay(dayIndex: number, sessionIndex: number, exerciseIndex: number, direction: -1 | 1) {
    updateDraft((current) => {
      const day = current.days[dayIndex];
      const sourceSession = day.sessions[sessionIndex];
      const targetExerciseIndex = exerciseIndex + direction;

      if (targetExerciseIndex >= 0 && targetExerciseIndex < sourceSession.exercises.length) {
        const [exercise] = sourceSession.exercises.splice(exerciseIndex, 1);
        sourceSession.exercises.splice(targetExerciseIndex, 0, exercise);
        return current;
      }

      const targetSessionIndex = sessionIndex + direction;
      const targetSession = day.sessions[targetSessionIndex];
      if (!targetSession) return current;

      const [exercise] = sourceSession.exercises.splice(exerciseIndex, 1);
      const insertIndex = direction < 0 ? targetSession.exercises.length : 0;
      targetSession.exercises.splice(insertIndex, 0, exercise);
      return current;
    });
  }

  function canMoveExerciseWithinDay(dayIndex: number, sessionIndex: number, exerciseIndex: number, direction: -1 | 1) {
    const day = draft.days[dayIndex];
    if (!day) return false;
    const session = day.sessions[sessionIndex];
    if (!session) return false;
    const targetExerciseIndex = exerciseIndex + direction;
    if (targetExerciseIndex >= 0 && targetExerciseIndex < session.exercises.length) return true;
    return Boolean(day.sessions[sessionIndex + direction]);
  }

  function addCustomExercise(dayIndex: number) {
    updateDraft((current) => {
      const day = current.days[dayIndex];
      if (day.sessions.length === 0) {
        day.sessions.push(createDefaultSession(day.id, day.dayName));
      }

      day.isRest = false;
      day.focus = day.focus === "Rest" ? "Training" : day.focus;
      const session = day.sessions[0];
      if (!session) return current;
      session.exercises.push({
        id: newExerciseId(session.id),
        name: "Custom exercise",
        sets: null,
        reps: null,
        duration: null,
        rest: null,
        notes: null,
      });
      return current;
    });
  }

  function updateExerciseField(
    dayIndex: number,
    sessionIndex: number,
    exerciseIndex: number,
    field: Exclude<keyof EditableExercise, "id" | "name">,
    value: string,
  ) {
    updateDraft((current) => {
      current.days[dayIndex].sessions[sessionIndex].exercises[exerciseIndex][field] = value === "" ? null : value;
      return current;
    });
  }

  function updateExerciseName(dayIndex: number, sessionIndex: number, exerciseIndex: number, value: string) {
    updateDraft((current) => {
      current.days[dayIndex].sessions[sessionIndex].exercises[exerciseIndex].name = value;
      return current;
    });
  }

  function updateTheme(value: string) {
    setDraft((current) => ({
      ...current,
      theme: value,
    }));
  }

  function discardChanges() {
    setDraft(toEditableWeek(week));
    setError(null);
    setEditing(false);
  }

  function handleSave() {
    setError(null);
    const formData = new FormData();
    formData.set("planId", planId);
    formData.set("weekId", draft.id);
    formData.set("editedWeek", JSON.stringify(draft));

    startTransition(async () => {
      const result = await saveEditedWeek(formData);
      if (result.error) {
        setError(result.error);
        return;
      }

      setEditing(false);
      router.refresh();
    });
  }

  if (!isEditing) {
    return null;
  }

  return (
    <Card className="mb-6 border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-slate-800">{hasLogs ? `Add To ${selectedDay?.dayName ?? "Day"}` : `Edit ${selectedDay?.dayName ?? "Day"}`}</CardTitle>
            <CardDescription>
              {hasLogs
                ? "Existing logged work stays protected. Add extra exercises when you want more to track."
                : "Edit the selected day without opening the rest of the week."}
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={pending}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasLogs && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This week already has workout logs. Existing days and exercises are read-only, but new custom exercises can be added and logged.
          </div>
        )}
          <>
            {!hasLogs && (
              <div className="space-y-2">
                <Label htmlFor="week-theme">Week theme</Label>
                <Input id="week-theme" value={draft.theme} onChange={(event) => updateTheme(event.target.value)} />
              </div>
            )}

            <div className="space-y-3">
              {selectedDay ? draft.days
                .map((day, dayIndex) => ({ day, dayIndex }))
                .filter(({ day }) => day.id === selectedDay.id)
                .map(({ day, dayIndex }) => (
                <div
                  key={day.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{day.dayName}</p>
                        <p className="text-xs text-slate-500">{day.isRest ? "Rest day" : day.focus}</p>
                      </div>
                      {day.sessions.length === 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => addCustomExercise(dayIndex)}
                          aria-label={`Add exercise to ${day.dayName}`}
                          title="Add exercise"
                          className="gap-1.5 rounded-full border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-100 hover:text-sky-800"
                        >
                          <CirclePlus className="h-4 w-4" />
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">Add</span>
                        </Button>
                      )}
                    </div>

                    <div className="mt-3 space-y-3">
                      {day.sessions.map((session, sessionIndex) => (
                        <div key={session.id} className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-slate-800">{session.name}</p>
                              <p className="text-xs text-slate-500">{session.duration} min</p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => addCustomExercise(dayIndex)}
                              aria-label={`Add exercise to ${day.dayName}`}
                              title="Add exercise"
                              className="gap-1.5 rounded-full border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-100 hover:text-sky-800"
                            >
                              <CirclePlus className="h-4 w-4" />
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">Add</span>
                            </Button>
                          </div>

                          <div className="space-y-3">
                            {session.exercises.map((exercise, exerciseIndex) => (
                              (() => {
                                const canEditExercise = !hasLogs || isCustomExerciseId(exercise.id);
                                return (
                              <div key={exercise.id}>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                  <div className="mb-2">
                                    <div className="flex items-end justify-between gap-2">
                                      <div className="flex-1">
                                        <Input
                                          value={exercise.name}
                                          onChange={(event) => updateExerciseName(dayIndex, sessionIndex, exerciseIndex, event.target.value)}
                                          disabled={!canEditExercise}
                                          className="bg-white"
                                        />
                                      </div>
                                      {canEditExercise && (
                                        <div className="flex items-center gap-1 pb-px">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() => moveExerciseWithinDay(dayIndex, sessionIndex, exerciseIndex, -1)}
                                          disabled={!canMoveExerciseWithinDay(dayIndex, sessionIndex, exerciseIndex, -1)}
                                          aria-label={`Move ${exercise.name} earlier`}
                                          title="Move earlier"
                                          className="rounded-full border-slate-300 bg-white text-slate-600 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                                        >
                                          Up
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() => moveExerciseWithinDay(dayIndex, sessionIndex, exerciseIndex, 1)}
                                          disabled={!canMoveExerciseWithinDay(dayIndex, sessionIndex, exerciseIndex, 1)}
                                          aria-label={`Move ${exercise.name} later`}
                                          title="Move later"
                                          className="rounded-full border-slate-300 bg-white text-slate-600 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                                        >
                                          Down
                                        </Button>
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="outline"
                                          onClick={() => duplicateExercise(dayIndex, sessionIndex, exerciseIndex)}
                                          aria-label={`Duplicate ${exercise.name}`}
                                          title="Duplicate exercise"
                                          className="rounded-full border-slate-300 bg-white text-slate-600 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                                        >
                                          <Copy className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="outline"
                                          onClick={() => removeExercise(dayIndex, sessionIndex, exerciseIndex)}
                                          aria-label={`Delete ${exercise.name}`}
                                          title="Delete exercise"
                                          className="rounded-full border-red-200 bg-white text-red-600 shadow-sm transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                      )}
                                    </div>
                                    {!hasLogs && <p className="mt-1 text-[11px] text-slate-400">Use Up and Down to move this exercise within the selected day.</p>}
                                    {hasLogs && !canEditExercise && (
                                      <p className="mt-1 text-[11px] text-slate-400">Protected because this week has logs.</p>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      value={exercise.sets ?? ""}
                                      onChange={(event) => updateExerciseField(dayIndex, sessionIndex, exerciseIndex, "sets", event.target.value)}
                                      placeholder="Sets"
                                      disabled={!canEditExercise}
                                      className="bg-white"
                                    />
                                    <Input
                                      value={exercise.reps ?? ""}
                                      onChange={(event) => updateExerciseField(dayIndex, sessionIndex, exerciseIndex, "reps", event.target.value)}
                                      placeholder="Reps"
                                      disabled={!canEditExercise}
                                      className="bg-white"
                                    />
                                    <Input
                                      value={exercise.duration ?? ""}
                                      onChange={(event) => updateExerciseField(dayIndex, sessionIndex, exerciseIndex, "duration", event.target.value)}
                                      placeholder="Duration"
                                      disabled={!canEditExercise}
                                      className="bg-white"
                                    />
                                    <Input
                                      value={exercise.rest ?? ""}
                                      onChange={(event) => updateExerciseField(dayIndex, sessionIndex, exerciseIndex, "rest", event.target.value)}
                                      placeholder="Rest"
                                      disabled={!canEditExercise}
                                      className="bg-white"
                                    />
                                    <div className="col-span-2">
                                      <Input
                                        value={exercise.notes ?? ""}
                                        onChange={(event) => updateExerciseField(dayIndex, sessionIndex, exerciseIndex, "notes", event.target.value)}
                                        placeholder="Notes"
                                        disabled={!canEditExercise}
                                        className="bg-white"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                                );
                              })()
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
              )) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Open a day in the week view, then use Edit Day.
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleSave} disabled={pending}>
                {pending ? "Saving..." : hasLogs ? "Save additions" : "Save day"}
              </Button>
              <Button type="button" variant="outline" onClick={discardChanges} disabled={pending}>
                Discard
              </Button>
            </div>
          </>
      </CardContent>
    </Card>
  );
}
