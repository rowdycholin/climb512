"use client";

import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CirclePlus, Copy, Hand, GripVertical, Trash2 } from "lucide-react";
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

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SWIPE_THRESHOLD = 64;
const MAX_SWIPE_OFFSET = 84;
const DAY_HOLD_DELAY_MS = 220;

function newExerciseId(sessionId: string) {
  return `${sessionId}-custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function SwipeSurface({
  children,
  className,
  leftHint,
  rightHint,
  onSwipeLeft,
  onSwipeRight,
}: {
  children: ReactNode;
  className?: string;
  leftHint?: string;
  rightHint?: string;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [startX, setStartX] = useState<number | null>(null);

  function reset() {
    setOffset(0);
    setStartX(null);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("input, button, select, textarea, label")) return;
    setStartX(event.clientX);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (startX === null) return;
    const nextOffset = Math.max(-MAX_SWIPE_OFFSET, Math.min(MAX_SWIPE_OFFSET, event.clientX - startX));
    setOffset(nextOffset);
  }

  function handlePointerUp() {
    if (offset <= -SWIPE_THRESHOLD) onSwipeLeft?.();
    if (offset >= SWIPE_THRESHOLD) onSwipeRight?.();
    reset();
  }

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[11px] font-medium text-blue-500/80">
        {rightHint ?? ""}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-medium text-blue-500/80">
        {leftHint ?? ""}
      </div>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={reset}
        onPointerLeave={() => {
          if (startX !== null) handlePointerUp();
        }}
        className="relative z-10 transition-transform duration-150 ease-out"
        style={{ transform: `translateX(${offset}px)`, touchAction: "pan-y" }}
      >
        {children}
      </div>
    </div>
  );
}

export default function PlanEditor({
  planId,
  week,
  isOpen,
  onOpenChange,
}: {
  planId: string;
  week: Week;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [draft, setDraft] = useState<EditableWeek>(() => toEditableWeek(week));
  const [error, setError] = useState<string | null>(null);
  const [armedDayId, setArmedDayId] = useState<string | null>(null);
  const [activeDragDayId, setActiveDragDayId] = useState<string | null>(null);
  const [dragIndicatorY, setDragIndicatorY] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const dayHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const dayCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const activeDragDayIdRef = useRef<string | null>(null);
  const draftRef = useRef(draft);
  const pointerMoveLogicRef = useRef<((event: PointerEvent) => void) | null>(null);
  const pointerUpLogicRef = useRef<(() => void) | null>(null);

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
    setArmedDayId(null);
    setActiveDragDayId(null);
    setDragIndicatorY(null);
  }, [onOpenChange, week]);

  const onWindowPointerMove = useCallback((event: PointerEvent) => {
    pointerMoveLogicRef.current?.(event);
  }, []);

  const onWindowPointerUp = useCallback(() => {
    pointerUpLogicRef.current?.();
  }, []);

  useEffect(() => {
    return () => {
      if (dayHoldTimeoutRef.current) clearTimeout(dayHoldTimeoutRef.current);
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerUp);
    };
  }, [onWindowPointerMove, onWindowPointerUp]);

  useEffect(() => {
    activeDragDayIdRef.current = activeDragDayId;
  }, [activeDragDayId]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  function updateDraft(updater: (current: EditableWeek) => EditableWeek) {
    setDraft((current) => updater(cloneWeek(current)));
  }

  function moveDay(index: number, direction: -1 | 1) {
    updateDraft((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.days.length) return current;
      const [moved] = current.days.splice(index, 1);
      current.days.splice(nextIndex, 0, moved);
      return current;
    });
  }

  function moveDayToIndex(dayId: string, targetIndex: number) {
    updateDraft((current) => {
      const fromIndex = current.days.findIndex((day) => day.id === dayId);
      if (fromIndex < 0 || targetIndex < 0 || targetIndex >= current.days.length || fromIndex === targetIndex) {
        return current;
      }

      const [moved] = current.days.splice(fromIndex, 1);
      current.days.splice(targetIndex, 0, moved);
      return current;
    });
  }

  const clearDayDragState = useCallback(() => {
    if (dayHoldTimeoutRef.current) clearTimeout(dayHoldTimeoutRef.current);
    dayHoldTimeoutRef.current = null;
    dragStartPointRef.current = null;
    activeDragDayIdRef.current = null;
    setArmedDayId(null);
    setActiveDragDayId(null);
    setDragIndicatorY(null);
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("pointerup", onWindowPointerUp);
    window.removeEventListener("pointercancel", onWindowPointerUp);
  }, [onWindowPointerMove, onWindowPointerUp]);

  useEffect(() => {
    pointerUpLogicRef.current = clearDayDragState;
  }, [clearDayDragState]);

  useEffect(() => {
    pointerMoveLogicRef.current = (event: PointerEvent) => {
      const startPoint = dragStartPointRef.current;
      if (!startPoint) return;

      const draggingDayId = activeDragDayIdRef.current;
      const currentDraft = draftRef.current;

      if (!draggingDayId) {
        const movedX = Math.abs(event.clientX - startPoint.x);
        const movedY = Math.abs(event.clientY - startPoint.y);
        if (movedX > 10 || movedY > 10) {
          clearDayDragState();
        }
        return;
      }

      setDragIndicatorY(event.clientY);

      const hoveredIndex = currentDraft.days.findIndex((candidate) => {
        const element = dayCardRefs.current[candidate.id];
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return event.clientY >= rect.top && event.clientY <= rect.bottom;
      });

      if (hoveredIndex >= 0) {
        moveDayToIndex(draggingDayId, hoveredIndex);
        return;
      }

      const beforeIndex = currentDraft.days.findIndex((candidate) => {
        const element = dayCardRefs.current[candidate.id];
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return event.clientY < rect.top;
      });

      if (beforeIndex >= 0) {
        moveDayToIndex(draggingDayId, beforeIndex);
        return;
      }

      const lastIndex = currentDraft.days.length - 1;
      const lastElement = dayCardRefs.current[currentDraft.days[lastIndex]?.id ?? ""];
      if (lastElement && event.clientY > lastElement.getBoundingClientRect().bottom) {
        moveDayToIndex(draggingDayId, lastIndex);
      }
    };
  }, [clearDayDragState, draft]);

  function beginDayHold(dayId: string, event: ReactPointerEvent<HTMLButtonElement>) {
    if (pending) return;
    if (dayHoldTimeoutRef.current) clearTimeout(dayHoldTimeoutRef.current);

    event.preventDefault();
    dragStartPointRef.current = { x: event.clientX, y: event.clientY };
    setArmedDayId(dayId);
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerUp);

    dayHoldTimeoutRef.current = setTimeout(() => {
      activeDragDayIdRef.current = dayId;
      setActiveDragDayId(dayId);
      setDragIndicatorY(event.clientY);
      setArmedDayId(null);
    }, DAY_HOLD_DELAY_MS);
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

  function moveExercise(dayIndex: number, sessionIndex: number, exerciseIndex: number, targetDayId: string) {
    updateDraft((current) => {
      const sourceSession = current.days[dayIndex].sessions[sessionIndex];
      const [exercise] = sourceSession.exercises.splice(exerciseIndex, 1);
      const targetDay = current.days.find((day) => day.id === targetDayId && !day.isRest);
      const targetSession = targetDay?.sessions[0];
      if (!exercise || !targetSession) {
        if (exercise) sourceSession.exercises.splice(exerciseIndex, 0, exercise);
        return current;
      }

      targetSession.exercises.push(exercise);
      return current;
    });
  }

  function addCustomExercise(dayIndex: number) {
    updateDraft((current) => {
      const day = current.days[dayIndex];
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
      current.days[dayIndex].sessions[sessionIndex].exercises[exerciseIndex][field] = value.trim() || null;
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

  function moveExerciseToAdjacentTrainingDay(
    dayIndex: number,
    sessionIndex: number,
    exerciseIndex: number,
    direction: -1 | 1,
  ) {
    const trainingDayIndexes = draft.days
      .map((day, index) => (!day.isRest ? index : -1))
      .filter((index) => index >= 0);
    const currentTrainingIndex = trainingDayIndexes.indexOf(dayIndex);
    const targetTrainingIndex = trainingDayIndexes[currentTrainingIndex + direction];
    if (targetTrainingIndex === undefined) return;
    moveExercise(dayIndex, sessionIndex, exerciseIndex, draft.days[targetTrainingIndex].id);
  }

  if (!isEditing) {
    return null;
  }

  return (
    <Card className="mb-6 border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-slate-800">Edit This Week</CardTitle>
            <CardDescription>
              Reorder days, drop exercises, move work around, and save a new version without going back to AI.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={pending}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasLogs ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This week already has workout logs, so direct edits are locked to protect history.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="week-theme">Week theme</Label>
              <Input id="week-theme" value={draft.theme} onChange={(event) => updateTheme(event.target.value)} />
            </div>

            <div className="space-y-3">
              {activeDragDayId && dragIndicatorY !== null && (
                <div
                  className="pointer-events-none fixed right-5 z-50 flex items-center gap-2 rounded-full bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-lg"
                  style={{ top: Math.max(16, dragIndicatorY - 18) }}
                >
                  <Hand className="h-4 w-4" />
                  Move day
                </div>
              )}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Day order</p>
                    <p className="text-xs text-slate-500">Press and hold a handle, then drag the day up or down.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {draft.days.map((day, dayIndex) => (
                    <div
                      key={`${day.id}-order`}
                      ref={(element) => {
                        dayCardRefs.current[day.id] = element;
                      }}
                      className={`flex select-none items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 transition-shadow ${
                        activeDragDayId === day.id ? "shadow-xl ring-2 ring-blue-300" : ""
                      }`}
                      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
                      onContextMenu={(event) => event.preventDefault()}
                    >
                      <button
                        type="button"
                        aria-label={`Reorder ${DAY_NAMES[dayIndex]}`}
                        onPointerDown={(event) => beginDayHold(day.id, event)}
                        className={`inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition ${
                          armedDayId === day.id || activeDragDayId === day.id ? "scale-105 border-blue-300 text-blue-600" : "active:scale-95"
                        }`}
                        style={{ touchAction: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
                        onContextMenu={(event) => event.preventDefault()}
                      >
                        {activeDragDayId === day.id ? <Hand className="h-4 w-4" /> : <GripVertical className="h-4 w-4" />}
                      </button>
                      <div className="min-w-0 flex-1 select-none" style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
                        <p className="text-sm font-semibold text-slate-800">{dayIndex + 1}. {DAY_NAMES[dayIndex]}</p>
                        <p className="truncate text-xs text-slate-500">{day.isRest ? "Rest day" : day.focus}</p>
                      </div>
                      <div className="hidden gap-2 sm:flex">
                        <Button type="button" variant="outline" size="sm" onClick={() => moveDay(dayIndex, -1)} disabled={dayIndex === 0}>
                          Up
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => moveDay(dayIndex, 1)} disabled={dayIndex === draft.days.length - 1}>
                          Down
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {draft.days
                .map((day, dayIndex) => ({ day, dayIndex }))
                .filter(({ day }) => !day.isRest)
                .map(({ day, dayIndex }) => (
                <div
                  key={day.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{dayIndex + 1}. {DAY_NAMES[dayIndex]}</p>
                        <p className="text-xs text-slate-500">{day.isRest ? "Rest day" : day.focus}</p>
                      </div>
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
                              aria-label={`Add exercise to ${session.name}`}
                              title="Add exercise"
                              className="gap-1.5 rounded-full border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-100 hover:text-sky-800"
                            >
                              <CirclePlus className="h-4 w-4" />
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">Add</span>
                            </Button>
                          </div>

                          <div className="space-y-3">
                            {session.exercises.map((exercise, exerciseIndex) => (
                              <SwipeSurface
                                key={exercise.id}
                                rightHint={draft.days.slice(0, dayIndex).some((item) => !item.isRest) ? "Prev day" : ""}
                                leftHint={draft.days.slice(dayIndex + 1).some((item) => !item.isRest) ? "Next day" : ""}
                                onSwipeRight={
                                  draft.days.slice(0, dayIndex).some((item) => !item.isRest)
                                    ? () => moveExerciseToAdjacentTrainingDay(dayIndex, sessionIndex, exerciseIndex, -1)
                                    : undefined
                                }
                                onSwipeLeft={
                                  draft.days.slice(dayIndex + 1).some((item) => !item.isRest)
                                    ? () => moveExerciseToAdjacentTrainingDay(dayIndex, sessionIndex, exerciseIndex, 1)
                                    : undefined
                                }
                              >
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                  <div className="mb-2">
                                    <div className="flex items-end justify-between gap-2">
                                      <div className="flex-1">
                                        <Input
                                          value={exercise.name}
                                          onChange={(event) => updateExerciseName(dayIndex, sessionIndex, exerciseIndex, event.target.value)}
                                          className="bg-white"
                                        />
                                      </div>
                                      <div className="flex items-center gap-1 pb-px">
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
                                    </div>
                                    <p className="mt-1 text-[11px] text-slate-400">Swipe to move between training days.</p>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      value={exercise.sets ?? ""}
                                      onChange={(event) => updateExerciseField(dayIndex, sessionIndex, exerciseIndex, "sets", event.target.value)}
                                      placeholder="Sets"
                                      className="bg-white"
                                    />
                                    <Input
                                      value={exercise.reps ?? ""}
                                      onChange={(event) => updateExerciseField(dayIndex, sessionIndex, exerciseIndex, "reps", event.target.value)}
                                      placeholder="Reps"
                                      className="bg-white"
                                    />
                                    <Input
                                      value={exercise.duration ?? ""}
                                      onChange={(event) => updateExerciseField(dayIndex, sessionIndex, exerciseIndex, "duration", event.target.value)}
                                      placeholder="Duration"
                                      className="bg-white"
                                    />
                                    <Input
                                      value={exercise.rest ?? ""}
                                      onChange={(event) => updateExerciseField(dayIndex, sessionIndex, exerciseIndex, "rest", event.target.value)}
                                      placeholder="Rest"
                                      className="bg-white"
                                    />
                                    <div className="col-span-2">
                                      <Input
                                        value={exercise.notes ?? ""}
                                        onChange={(event) => updateExerciseField(dayIndex, sessionIndex, exerciseIndex, "notes", event.target.value)}
                                        placeholder="Notes"
                                        className="bg-white"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </SwipeSurface>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
              ))}
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleSave} disabled={pending}>
                {pending ? "Saving..." : "Save week"}
              </Button>
              <Button type="button" variant="outline" onClick={discardChanges} disabled={pending}>
                Discard
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
