"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logExercise, updatePlanUiState } from "@/app/actions";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import type { PlanUiState } from "@/lib/plan-ui-state";

interface ExerciseLog {
  id: string;
  setsCompleted: number | null;
  repsCompleted: string | null;
  weightUsed: string | null;
  durationActual: string | null;
  notes: string | null;
  actuals?: unknown;
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
  logs: ExerciseLog[];
}

interface DaySession {
  id: string;
  name: string;
  description: string;
  duration: number;
  objective?: string | null;
  intensity?: string | null;
  warmup?: string | null;
  cooldown?: string | null;
  exercises: Exercise[];
}

interface Day {
  id: string;
  dayNum: number;
  dayName: string;
  focus: string;
  isRest: boolean;
  coachNotes?: string | null;
  sessions: DaySession[];
}

interface Week {
  id: string;
  weekNum: number;
  theme: string;
  summary?: string | null;
  progressionNote?: string | null;
  days: Day[];
}

interface PlanGuidance {
  overview: string | null;
  intensityDistribution: Array<{ label: string; detail: string }>;
  progressionPrinciples: string[];
  recoveryPrinciples: string[];
  recommendations: string[];
  progressionTable: Array<Record<string, string>>;
}

interface GenerationProgress {
  status: string;
  generatedWeeks: number;
  totalWeeks: number;
  missingWeeks: number;
  nextWeekNum: number | null;
  percent: number;
  isGenerating: boolean;
  isFailed: boolean;
  isReady: boolean;
  error: string | null;
}

interface AdjustmentMetadata {
  affectedDays: Array<{
    weekNum: number;
    dayNum: number;
    planDay: number;
    dayName: string;
    summary: string;
  }>;
}

const FOCUS_COLORS: Record<string, string> = {
  "Finger Strength": "bg-red-100 text-red-700 border-red-200",
  Endurance: "bg-blue-100 text-blue-700 border-blue-200",
  "Project Climbing": "bg-violet-100 text-violet-700 border-violet-200",
  "Mobility & Antagonist": "bg-green-100 text-green-700 border-green-200",
  Rest: "bg-slate-100 text-slate-500 border-slate-200",
  "Rest & Recovery": "bg-slate-100 text-slate-500 border-slate-200",
};

function detailItems(items: Array<{ label: string; value?: string | null }>) {
  return items.filter((item) => item.value?.trim());
}

function exercisePrescriptionChips(exercise: Exercise) {
  const hasPreciseRest = Boolean(exercise.restBetweenSets?.trim() || exercise.restBetweenReps?.trim());
  const hasWork = Boolean(exercise.work?.trim());

  return detailItems([
    { label: "Sets", value: exercise.sets },
    { label: "Rounds", value: exercise.rounds },
    { label: "Reps", value: exercise.reps },
    { label: "Work", value: exercise.work },
    { label: "Duration", value: hasWork ? null : exercise.duration },
    { label: "Rest", value: exercise.restBetweenSets ?? exercise.restBetweenReps ?? (!hasPreciseRest ? exercise.rest : null) },
    { label: "Load", value: exercise.load },
    { label: "Tempo", value: exercise.tempo },
    { label: "Distance", value: exercise.distance },
    { label: "Sides", value: exercise.sides },
    { label: "RPE", value: exercise.intensity },
  ]);
}

function parseLeadingCount(value?: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^(\d+)/);
  if (!match) return null;
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isClimbingAttemptExercise(exercise: Exercise) {
  const exerciseText = [
    exercise.name,
    exercise.reps,
    exercise.work,
    exercise.duration,
    exercise.intensity,
    exercise.prescriptionDetails,
    exercise.notes,
  ].filter(Boolean).join(" ");

  return Boolean(
    exercise.grade
      || exercise.holdType
      || /\bV\d+(?:\s*-\s*V?\d+)?\b/i.test(exerciseText)
      || /\b5\.\d+[abcd]?(?:\s*-\s*5\.\d+[abcd]?)?\b/i.test(exerciseText)
      || /\b(attempt|problem|route|boulder|circuit|project|pitch|lap)\b/i.test(exercise.name),
  );
}

function inferredClimbingGrade(exercise: Exercise) {
  const exerciseText = [
    exercise.grade,
    exercise.name,
    exercise.reps,
    exercise.work,
    exercise.duration,
    exercise.intensity,
    exercise.prescriptionDetails,
    exercise.notes,
  ].filter(Boolean).join(" ");
  return exerciseText.match(/\bV\d+(?:\s*-\s*V?\d+)?\b/i)?.[0]
    ?? exerciseText.match(/\b5\.\d+[abcd]?(?:\s*-\s*5\.\d+[abcd]?)?\b/i)?.[0]
    ?? null;
}

function isRunningOrCardioExercise(exercise: Exercise) {
  return /\b(run|running|jog|sprint|tempo|pace|mile|meter|metre|km|bike|row|treadmill|cardio)\b/i.test(
    `${exercise.name} ${exercise.distance ?? ""} ${exercise.work ?? ""}`,
  );
}

function setTargetField(exercise: Exercise) {
  if (exercise.grade || isClimbingAttemptExercise(exercise)) {
    const grade = inferredClimbingGrade(exercise);
    return {
      label: "Grade",
      placeholder: exercise.grade ?? grade ?? "grade",
    };
  }
  if (isRunningOrCardioExercise(exercise)) {
    return {
      label: "Pace",
      placeholder: exercise.distance ?? exercise.intensity ?? "pace",
    };
  }
  if (exercise.load || /\b(lift|press|pull-?up|deadlift|squat|row|curl|carry|weighted|weight)\b/i.test(exercise.name)) {
    return {
      label: "Weight",
      placeholder: exercise.load ?? "weight",
    };
  }
  return {
    label: "Intensity",
    placeholder: exercise.intensity ?? "target",
  };
}

function loggingShape(exercise: Exercise) {
  const sets = parseLeadingCount(exercise.sets);
  const rounds = parseLeadingCount(exercise.rounds);
  if (sets && (exercise.reps || exercise.load || !isClimbingAttemptExercise(exercise))) {
    return { mode: "sets" as const, rowCount: Math.min(sets, 12) };
  }
  if (exercise.work && (rounds || sets || exercise.restBetweenReps || exercise.restBetweenSets)) {
    return { mode: "intervals" as const, rowCount: Math.min(rounds ?? sets ?? 1, 20) };
  }
  if (isClimbingAttemptExercise(exercise)) {
    return { mode: "attempts" as const, rowCount: Math.min(rounds ?? sets ?? 3, 12) };
  }
  return { mode: "summary" as const, rowCount: 1 };
}

function actualEntry(log: ExerciseLog | null, mode: string, index: number) {
  if (!log?.actuals || typeof log.actuals !== "object") return {};
  const actuals = log.actuals as { mode?: unknown; entries?: unknown };
  if (actuals.mode !== mode || !Array.isArray(actuals.entries)) return {};
  return (actuals.entries[index] as Record<string, unknown> | undefined) ?? {};
}

function stringActual(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function booleanActual(value: unknown) {
  return value === true;
}

function actualsSummary(log: ExerciseLog | null) {
  const actuals = log?.actuals;
  if (!actuals || typeof actuals !== "object") return [];
  const parsed = actuals as { mode?: unknown; entries?: unknown };
  if (typeof parsed.mode !== "string" || !Array.isArray(parsed.entries) || parsed.entries.length === 0) return [];
  const entries = parsed.entries as Array<Record<string, unknown>>;
  if (parsed.mode === "sets") {
    const done = entries.filter((entry) => entry.completed || entry.reps || entry.target || entry.load).length;
    return done > 0 ? [`${done} sets logged`] : [];
  }
  if (parsed.mode === "intervals") {
    const done = entries.filter((entry) => entry.completed || entry.work).length;
    return done > 0 ? [`${done} intervals logged`] : [];
  }
  if (parsed.mode === "attempts") {
    const done = entries.filter((entry) => entry.result || entry.duration || entry.notes).length;
    return done > 0 ? [`${done} attempts logged`] : [];
  }
  const entry = entries[0] ?? {};
  return [stringActual(entry.duration), stringActual(entry.rpe)].filter(Boolean);
}

function SmallChip({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "amber" | "blue" }) {
  const classes = {
    slate: "border-slate-200 bg-slate-100 text-slate-600",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
  };

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${classes[tone]}`}>
      {children}
    </span>
  );
}

function scrollToPlanDay(dayId: string) {
  const target = document.getElementById(`plan-day-heading-${dayId}`);
  target?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function PlanGuidancePanel({
  planId,
  planGuidance,
  initialOpen,
}: {
  planId: string;
  planGuidance?: PlanGuidance | null;
  initialOpen: boolean;
}) {
  const [guidanceOpen, setGuidanceOpen] = useState(initialOpen);

  if (!planGuidance) return null;
  const hasGuidance = Boolean(planGuidance.overview)
    || planGuidance.intensityDistribution.length > 0
    || planGuidance.progressionPrinciples.length > 0
    || planGuidance.recoveryPrinciples.length > 0
    || planGuidance.recommendations.length > 0
    || planGuidance.progressionTable.length > 0;
  if (!hasGuidance) return null;

  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm text-slate-700">
      <button
        type="button"
        onClick={() => {
          setGuidanceOpen((value) => {
            const next = !value;
            void updatePlanUiState({ planId, key: "coachGuidanceOpen", value: next });
            return next;
          });
        }}
        className="flex w-full items-center gap-1.5 px-4 py-3 text-left text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
        aria-expanded={guidanceOpen}
      >
        <DisclosureArrowHead open={guidanceOpen} className="text-slate-800" />
        Coach Guidance
      </button>
      {guidanceOpen && (
        <div className="space-y-4 px-4 pb-3">
          {planGuidance.overview && <p className="leading-relaxed text-slate-600">{planGuidance.overview}</p>}
          {planGuidance.intensityDistribution.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Intensity Distribution</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {planGuidance.intensityDistribution.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <span className="text-xs font-semibold text-slate-700">{item.label}</span>
                    <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(planGuidance.progressionPrinciples.length > 0 || planGuidance.recoveryPrinciples.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {planGuidance.progressionPrinciples.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Progression</p>
                  <ul className="space-y-1 text-xs leading-relaxed text-slate-600">
                    {planGuidance.progressionPrinciples.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              )}
              {planGuidance.recoveryPrinciples.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Recovery</p>
                  <ul className="space-y-1 text-xs leading-relaxed text-slate-600">
                    {planGuidance.recoveryPrinciples.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          {planGuidance.recommendations.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Recommendations</p>
              <ul className="space-y-1 text-xs leading-relaxed text-slate-600">
                {planGuidance.recommendations.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
          {planGuidance.progressionTable.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    {Object.keys(planGuidance.progressionTable[0]).map((key) => (
                      <th key={key} className="py-1.5 pr-3 font-semibold capitalize">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {planGuidance.progressionTable.map((row, index) => (
                    <tr key={index} className="border-b border-slate-100 last:border-0">
                      {Object.keys(planGuidance.progressionTable[0]).map((key) => (
                        <td key={key} className="py-1.5 pr-3 text-slate-600">{row[key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailedLogFields({ exercise, log }: { exercise: Exercise; log: ExerciseLog | null }) {
  const shape = loggingShape(exercise);
  const setTarget = setTargetField(exercise);

  if (shape.mode === "sets") {
    return (
      <div className="space-y-2">
        <input type="hidden" name="actualMode" value="sets" />
        <input type="hidden" name="actualRowCount" value={shape.rowCount} />
        <div className="grid grid-cols-[44px_72px_minmax(76px,1fr)_64px_minmax(92px,1fr)] gap-2 px-1 text-xs font-medium text-slate-500">
          <span>Done</span>
          <span>Reps</span>
          <span>{setTarget.label}</span>
          <span>RPE</span>
          <span>Notes</span>
        </div>
        {Array.from({ length: shape.rowCount }, (_, index) => {
          const row = index + 1;
          const entry = actualEntry(log, "sets", index);
          return (
            <div key={`set-${row}`} className="grid grid-cols-[44px_72px_minmax(76px,1fr)_64px_minmax(92px,1fr)] gap-2">
              <label className="flex h-8 items-center gap-1 text-xs text-slate-500">
                <input name={`set-${row}-completed`} type="checkbox" defaultChecked={booleanActual(entry.completed)} className="h-4 w-4" />
                {row}
              </label>
              <input name={`set-${row}-reps`} type="text" defaultValue={stringActual(entry.reps)} placeholder={exercise.reps ?? "reps"} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
              <input name={`set-${row}-target`} type="text" defaultValue={stringActual(entry.target ?? entry.load)} placeholder={setTarget.placeholder} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
              <input name={`set-${row}-rpe`} type="text" defaultValue={stringActual(entry.rpe)} placeholder="RPE" className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
              <input name={`set-${row}-notes`} type="text" defaultValue={stringActual(entry.notes)} placeholder="notes" className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
            </div>
          );
        })}
      </div>
    );
  }

  if (shape.mode === "intervals") {
    return (
      <div className="space-y-2">
        <input type="hidden" name="actualMode" value="intervals" />
        <input type="hidden" name="actualRowCount" value={shape.rowCount} />
        <div className="grid grid-cols-[44px_minmax(76px,1fr)_minmax(76px,1fr)_64px_minmax(92px,1fr)] gap-2 px-1 text-xs font-medium text-slate-500">
          <span>Done</span>
          <span>Work</span>
          <span>Rest</span>
          <span>RPE</span>
          <span>Notes</span>
        </div>
        {Array.from({ length: shape.rowCount }, (_, index) => {
          const row = index + 1;
          const entry = actualEntry(log, "intervals", index);
          return (
            <div key={`interval-${row}`} className="grid grid-cols-[44px_minmax(76px,1fr)_minmax(76px,1fr)_64px_minmax(92px,1fr)] gap-2">
              <label className="flex h-8 items-center gap-1 text-xs text-slate-500">
                <input name={`interval-${row}-completed`} type="checkbox" defaultChecked={booleanActual(entry.completed)} className="h-4 w-4" />
                {row}
              </label>
              <input name={`interval-${row}-work`} type="text" defaultValue={stringActual(entry.work)} placeholder={exercise.work ?? exercise.duration ?? "work"} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
              <input name={`interval-${row}-rest`} type="text" defaultValue={stringActual(entry.rest)} placeholder={exercise.restBetweenReps ?? exercise.restBetweenSets ?? exercise.rest ?? "rest"} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
              <input name={`interval-${row}-rpe`} type="text" defaultValue={stringActual(entry.rpe)} placeholder="RPE" className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
              <input name={`interval-${row}-notes`} type="text" defaultValue={stringActual(entry.notes)} placeholder="notes" className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
            </div>
          );
        })}
      </div>
    );
  }

  if (shape.mode === "attempts") {
    return (
      <div className="space-y-2">
        <input type="hidden" name="actualMode" value="attempts" />
        <input type="hidden" name="actualRowCount" value={shape.rowCount} />
        <div className="grid grid-cols-[52px_minmax(96px,1fr)_minmax(76px,1fr)_64px_minmax(92px,1fr)] gap-2 px-1 text-xs font-medium text-slate-500">
          <span>#</span>
          <span>Result</span>
          <span>Duration</span>
          <span>RPE</span>
          <span>Notes</span>
        </div>
        {Array.from({ length: shape.rowCount }, (_, index) => {
          const row = index + 1;
          const entry = actualEntry(log, "attempts", index);
          return (
            <div key={`attempt-${row}`} className="grid grid-cols-[52px_minmax(96px,1fr)_minmax(76px,1fr)_64px_minmax(92px,1fr)] gap-2">
              <span className="flex h-8 items-center text-xs text-slate-500">#{row}</span>
              <select name={`attempt-${row}-result`} defaultValue={stringActual(entry.result)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm">
                <option value="">Result</option>
                <option value="sent">Sent</option>
                <option value="fell">Fell</option>
                <option value="worked moves">Worked moves</option>
                <option value="skipped">Skipped</option>
              </select>
              <input name={`attempt-${row}-duration`} type="text" defaultValue={stringActual(entry.duration)} placeholder={exercise.work ?? exercise.duration ?? "time"} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
              <input name={`attempt-${row}-rpe`} type="text" defaultValue={stringActual(entry.rpe)} placeholder="RPE" className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
              <input name={`attempt-${row}-notes`} type="text" defaultValue={stringActual(entry.notes)} placeholder="notes" className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
            </div>
          );
        })}
      </div>
    );
  }

  const entry = actualEntry(log, "summary", 0);
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(120px,1fr)_80px_minmax(160px,2fr)]">
      <input type="hidden" name="actualMode" value="summary" />
      <input type="hidden" name="actualRowCount" value={1} />
      <input name="summary-duration" type="text" defaultValue={stringActual(entry.duration)} placeholder={exercise.duration ?? exercise.work ?? "duration"} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
      <input name="summary-rpe" type="text" defaultValue={stringActual(entry.rpe)} placeholder="RPE" className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
      <input name="summary-notes" type="text" defaultValue={stringActual(entry.notes)} placeholder="notes" className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
    </div>
  );
}

function ExerciseRow({ planId, exercise, readOnly = false }: { planId: string; exercise: Exercise; readOnly?: boolean }) {
  const log = exercise.logs[0] ?? null;
  const [completed, setCompleted] = useState(log?.completed ?? false);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const prescriptionChips = exercisePrescriptionChips(exercise);
  const prescriptionDetails = detailItems([
    { label: "Rounds", value: exercise.rounds },
    { label: "Work", value: exercise.work },
    { label: "Rest between reps", value: exercise.restBetweenReps },
    { label: "Rest between sets", value: exercise.restBetweenSets },
    { label: "Load", value: exercise.load },
    { label: "RPE", value: exercise.intensity },
    { label: "Tempo", value: exercise.tempo },
    { label: "Distance", value: exercise.distance },
    { label: "Difficulty", value: exercise.grade },
    { label: "Sides", value: exercise.sides },
    { label: "Hold", value: exercise.holdType },
  ]);
  const hasExpandableDetails = prescriptionDetails.length > 0 || Boolean(exercise.prescriptionDetails) || Boolean(exercise.modifications);

  useEffect(() => {
    setCompleted(log?.completed ?? false);
  }, [exercise.id, log?.completed]);

  function createBaseFormData() {
    const formData = new FormData();
    formData.set("planId", planId);
    formData.set("exerciseId", exercise.id);
    if (log?.setsCompleted !== null && log?.setsCompleted !== undefined) {
      formData.set("setsCompleted", String(log.setsCompleted));
    }
    if (log?.repsCompleted) formData.set("repsCompleted", log.repsCompleted);
    if (log?.weightUsed) formData.set("weightUsed", log.weightUsed);
    if (log?.durationActual) formData.set("durationActual", log.durationActual);
    if (log?.notes) formData.set("notes", log.notes);
    if (log?.actuals) formData.set("actualsJson", JSON.stringify(log.actuals));
    return formData;
  }

  function toggleComplete() {
    if (readOnly) return;
    const next = !completed;
    setCompleted(next);
    const formData = createBaseFormData();
    formData.set("completed", next ? "true" : "false");

    startTransition(async () => {
      await logExercise(formData);
      router.refresh();
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("completed", completed ? "true" : "false");

    startTransition(async () => {
      await logExercise(formData);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div
      className={`mb-2 overflow-hidden rounded-xl border transition-colors last:mb-0 ${
        completed ? "border-green-300 bg-green-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="px-3 py-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={toggleComplete}
            disabled={pending || readOnly}
            aria-label={`${completed ? "Mark incomplete" : "Mark complete"}: ${exercise.name}`}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors disabled:opacity-60 ${
              completed ? "border-green-500 bg-green-500" : "border-slate-300 hover:border-green-400"
            }`}
            title="Mark complete"
          >
            {completed && <CheckMarkIcon className="h-3 w-3 text-white" />}
          </button>

        <div className="min-w-0 flex-1">
          <span
            className={`text-sm font-semibold ${
              completed ? "text-green-700 line-through decoration-green-400" : "text-slate-800"
            }`}
          >
            {exercise.name}
          </span>
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700"
          >
            {open ? "Close" : log ? "Edit log" : "Log"}
          </button>
          )}
        </div>

        <div className="mt-2">
          {prescriptionChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {prescriptionChips.map((item) => {
                const tone = item.label === "Rest" ? "amber" : item.label === "Work" || item.label === "RPE" ? "blue" : "slate";
                const chipText = item.label === "RPE" && /^rpe\b/i.test(item.value ?? "")
                  ? item.value
                  : `${item.label}: ${item.value}`;
                return (
                  <SmallChip key={`${item.label}-${item.value}`} tone={tone}>
                    {chipText}
                  </SmallChip>
                );
              })}
            </div>
          )}

          {exercise.notes && (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{exercise.notes}</p>
          )}

          {log && !open && (actualsSummary(log).length > 0 || log.setsCompleted || log.weightUsed || log.repsCompleted || log.durationActual) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {actualsSummary(log).map((item) => (
                <span key={item} className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-xs text-green-700">
                  {item}
                </span>
              ))}
              {log.setsCompleted && (
                <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-xs text-green-700">
                  Done: {log.setsCompleted} sets
                </span>
              )}
              {log.repsCompleted && (
                <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-xs text-green-700">
                  {log.repsCompleted}
                </span>
              )}
              {log.weightUsed && (
                <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-xs text-green-700">
                  {log.weightUsed}
                </span>
              )}
              {log.durationActual && (
                <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-xs text-green-700">
                  {log.durationActual}
                </span>
              )}
            </div>
          )}

          {hasExpandableDetails && (
            <details className="mt-2 text-xs text-slate-500">
              <summary className="cursor-pointer font-medium text-slate-600">Exercise details</summary>
              <div className="mt-2 space-y-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                {prescriptionDetails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {prescriptionDetails.map((item) => (
                      <SmallChip key={`${item.label}-${item.value}`}>
                        {item.label}: {item.value}
                      </SmallChip>
                    ))}
                  </div>
                )}
                {exercise.prescriptionDetails && <p className="leading-relaxed">{exercise.prescriptionDetails}</p>}
                {exercise.modifications && (
                  <p className="leading-relaxed">
                    <span className="font-semibold text-slate-600">Modify:</span> {exercise.modifications}
                  </p>
                )}
              </div>
            </details>
          )}
        </div>

      </div>

      {open && !readOnly && (
        <form onSubmit={handleSubmit} className="border-t border-slate-100 bg-slate-50 px-3 pb-3 pt-3">
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="exerciseId" value={exercise.id} />
          <p className="mb-2 text-xs font-medium text-slate-500">Record actual work:</p>
          <div className="overflow-x-auto pb-1">
            <div className="min-w-[560px]">
              <DetailedLogFields exercise={exercise} log={log} />
            </div>
          </div>
          <div className="mt-2">
            <label className="mb-1 block text-xs text-slate-500">Overall notes</label>
            <input
              name="notes"
              type="text"
              defaultValue={log?.notes ?? ""}
              placeholder="How did it feel? Anything to remember?"
              className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Saving..." : saved ? "Saved!" : "Save log"}
          </button>
        </form>
      )}
    </div>
  );
}

function SessionBlock({ planId, session, readOnly = false }: { planId: string; session: DaySession; readOnly?: boolean }) {
  const sessionDetails = detailItems([
    { label: "Objective", value: session.objective },
    { label: "Intensity", value: session.intensity },
    { label: "Warm-up", value: session.warmup },
    { label: "Cooldown", value: session.cooldown },
  ]);

  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-2 flex items-center gap-2 px-1">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-slate-400">
          {session.name} | {session.duration} min
        </span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <p className="mb-2 px-1 text-xs italic text-slate-500">{session.description}</p>
      {(session.objective || session.intensity) && (
        <div className="mb-2 flex flex-wrap gap-1.5 px-1">
          {session.objective && <SmallChip tone="blue">Objective: {session.objective}</SmallChip>}
          {session.intensity && <SmallChip tone="blue">{session.intensity}</SmallChip>}
        </div>
      )}
      {sessionDetails.some((item) => item.label === "Warm-up" || item.label === "Cooldown") && (
        <details className="mb-2 px-1 text-xs text-slate-500">
          <summary className="cursor-pointer font-medium text-slate-600">Session details</summary>
          <div className="mt-2 space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            {sessionDetails.map((item) => (
              <p key={item.label} className="leading-relaxed">
                <span className="font-semibold text-slate-600">{item.label}:</span> {item.value}
              </p>
            ))}
          </div>
        </details>
      )}
      <div>
        {session.exercises.map((exercise) => (
          <ExerciseRow key={exercise.id} planId={planId} exercise={exercise} readOnly={readOnly} />
        ))}
      </div>
    </div>
  );
}

function CheckMarkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-3 w-3"}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function DisclosureArrowHead({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-0 w-0 shrink-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-current transition-transform ${open ? "rotate-90" : ""} ${className}`}
    />
  );
}

function DayCard({
  planId,
  day,
  isHighlighted,
  adjustmentSummary,
  onSelect,
  readOnly,
}: {
  planId: string;
  day: Day;
  isHighlighted: boolean;
  adjustmentSummary: string | null;
  onSelect: (dayId: string) => void;
  readOnly?: boolean;
}) {
  const colorClass = FOCUS_COLORS[day.focus] ?? "border-slate-200 bg-slate-100 text-slate-600";
  const totalDuration = day.sessions.reduce((sum, session) => sum + session.duration, 0);
  const totalExercises = day.sessions.flatMap((session) => session.exercises).length;
  const completedExercises = day.sessions
    .flatMap((session) => session.exercises)
    .filter((exercise) => exercise.logs[0]?.completed).length;
  const hasProgress = completedExercises > 0;
  const isAdjusted = Boolean(adjustmentSummary);

  return (
    <AccordionItem
      value={day.id}
      className={`mb-2 overflow-hidden rounded-xl border ${
        isAdjusted
          ? "border-amber-300 bg-amber-50/60"
          : isHighlighted
            ? "border-blue-300 bg-blue-50/50"
            : "border-slate-200 bg-white"
      }`}
    >
      <AccordionTrigger
        id={`plan-day-heading-${day.id}`}
        className="scroll-mt-28 px-4 py-3 hover:bg-slate-50 hover:no-underline [&[data-state=open]]:bg-slate-50 [&_[data-slot=accordion-trigger-icon]]:!hidden"
        onClick={() => onSelect(day.id)}
      >
        <div className="flex w-full items-center gap-2 text-left">
          <DisclosureArrowHead open={false} className="text-slate-700 group-aria-expanded/accordion-trigger:rotate-90" />
          <div className="w-[72px] shrink-0">
            <span className={`text-xs font-semibold ${isHighlighted ? "text-blue-600" : "text-slate-500"}`}>
              {day.dayName}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-sm font-semibold text-slate-700">{day.focus}</span>
            {isAdjusted && (
              <span className="ml-2 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Adjusted
              </span>
            )}
            {hasProgress && !day.isRest && (
              <span className="ml-2 text-xs text-green-600">{completedExercises}/{totalExercises} done</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!day.isRest && <span className="text-xs text-slate-400">{totalDuration} min</span>}
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass}`}>
              {day.isRest ? "Rest" : "Training"}
            </span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="border-t border-slate-100 px-4 pb-4 pt-3">
        {adjustmentSummary && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {adjustmentSummary}
          </p>
        )}
        {day.coachNotes && (
          <p className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900">
            {day.coachNotes}
          </p>
        )}
        {day.sessions.map((session) => (
          <SessionBlock key={session.id} planId={planId} session={session} readOnly={readOnly} />
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}

function WeekOverview({ week }: { week: Week }) {
  function primaryIntensity(day: Day) {
    const mainSession = day.sessions.find((session) => /\b(main|primary)\b/i.test(session.name));
    return mainSession?.intensity ?? day.sessions.find((session) => session.intensity)?.intensity ?? null;
  }

  return (
    <div className="overflow-hidden bg-white">
      <div className="grid grid-cols-[88px_minmax(0,1fr)_72px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>Day</span>
        <span>Focus</span>
        <span className="text-right">Time</span>
      </div>
      <div className="divide-y divide-slate-100">
        {week.days.map((day) => {
          const totalDuration = day.sessions.reduce((sum, session) => sum + session.duration, 0);
          const intensity = primaryIntensity(day);
          return (
            <div
              key={`overview-${day.id}`}
              className={`grid grid-cols-[88px_minmax(0,1fr)_72px] gap-2 px-3 py-2 text-sm ${
                day.isRest ? "bg-slate-50/70 text-slate-500" : "text-slate-700"
              }`}
            >
              <span className="font-semibold">{day.dayName}</span>
              <span className="min-w-0">
                {day.focus}
                {intensity && <span className="ml-2 text-xs text-blue-600">{intensity}</span>}
              </span>
              <span className="text-right text-xs text-slate-500">{day.isRest ? "Rest" : `${totalDuration} min`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekCard({
  planId,
  week,
  initialUiState,
  initialDayIndex,
  adjustmentMetadata,
  readOnly,
}: {
  planId: string;
  week: Week;
  initialUiState: PlanUiState;
  initialDayIndex: number;
  adjustmentMetadata?: AdjustmentMetadata | null;
  readOnly?: boolean;
}) {
  const trainingDays = week.days.filter((day) => !day.isRest).length;
  const allExercises = week.days.flatMap((day) => day.sessions.flatMap((session) => session.exercises));
  const completedCount = allExercises.filter((exercise) => exercise.logs[0]?.completed).length;
  const initialDayId = week.days[initialDayIndex]?.id ?? null;
  const hasWeekSummary = Boolean(week.summary || week.progressionNote || week.days.length);

  const [openDayIds, setOpenDayIds] = useState<string[]>(() => (initialDayId ? [initialDayId] : []));
  const [highlightedDayId, setHighlightedDayId] = useState<string | null>(initialDayId);
  const [weekSummaryOpen, setWeekSummaryOpen] = useState(() => initialUiState.weekSummaryOpen ?? true);
  const adjustedByDay = useMemo(() => {
    const entries = adjustmentMetadata?.affectedDays.filter((day) => day.weekNum === week.weekNum) ?? [];
    return new Map(entries.map((day) => [day.dayNum, day.summary]));
  }, [adjustmentMetadata?.affectedDays, week.weekNum]);

  useEffect(() => {
    setOpenDayIds(initialDayId ? [initialDayId] : []);
    setHighlightedDayId(initialDayId);
  }, [initialDayId, week.id]);

  useEffect(() => {
    if (!initialDayId) return;
    const timers = [100, 350, 800].map((delay) => window.setTimeout(() => scrollToPlanDay(initialDayId), delay));

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [initialDayId, week.id]);

  return (
    <div>
      <div className="mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-slate-800">Week {week.weekNum}</h3>
          <Badge variant="outline" className="border-slate-300 bg-white text-slate-600">{week.theme}</Badge>
          {completedCount > 0 && (
            <span className="text-xs font-medium text-green-600">
              {completedCount}/{allExercises.length} logged
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">{trainingDays} training days | {7 - trainingDays} rest days</p>
      </div>
      {hasWeekSummary && (
        <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => {
              setWeekSummaryOpen((value) => {
                const next = !value;
                void updatePlanUiState({ planId, key: "weekSummaryOpen", value: next });
                return next;
              });
            }}
            className="flex w-full items-center justify-between gap-3 bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            aria-expanded={weekSummaryOpen}
          >
            <span className="flex items-center gap-1.5">
              <DisclosureArrowHead open={weekSummaryOpen} className="text-slate-700" />
              Week Summary
            </span>
          </button>
          {weekSummaryOpen && (
            <div className="px-0 pb-0">
              {(week.summary || week.progressionNote) && (
                <div className="space-y-1 border-b border-slate-100 px-3 py-3 text-sm leading-relaxed text-slate-600">
                  {week.summary && <p>{week.summary}</p>}
                  {week.progressionNote && <p className="text-xs text-slate-500">{week.progressionNote}</p>}
                </div>
              )}
              <WeekOverview week={week} />
            </div>
          )}
        </div>
      )}
      <Accordion multiple value={openDayIds} onValueChange={setOpenDayIds} className="space-y-0">
        {week.days.map((day, index) => (
          <DayCard
            key={day.id}
            planId={planId}
            day={day}
            isHighlighted={highlightedDayId ? day.id === highlightedDayId : index === initialDayIndex}
            adjustmentSummary={adjustedByDay.get(day.dayNum) ?? null}
            onSelect={setHighlightedDayId}
            readOnly={readOnly}
          />
        ))}
      </Accordion>
    </div>
  );
}

function MissingWeekCard({ weekNum, generation }: { weekNum: number; generation: GenerationProgress }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sm font-semibold text-sky-700">
        W{weekNum}
      </div>
      <h3 className="text-lg font-bold text-slate-800">
        {generation.isFailed ? "Generation paused" : "Week is still generating"}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        {generation.isFailed
          ? generation.error ?? "Earlier weeks remain available while this plan waits for repair."
          : `The worker will add Week ${weekNum} when it reaches this part of the plan.`}
      </p>
      <div className="mx-auto mt-4 h-2 max-w-xs overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-sky-500" style={{ width: `${generation.percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {generation.generatedWeeks}/{generation.totalWeeks} weeks ready
      </p>
    </div>
  );
}

export default function PlanViewer({
  planId,
  initialUiState,
  weeks,
  planGuidance,
  totalWeeks = weeks.length,
  generation,
  adjustmentMetadata,
  initialWeekIndex = 0,
  initialDayIndex = 0,
  activeWeekIndex,
  onActiveWeekChange,
  readOnly = false,
}: {
  planId: string;
  initialUiState: PlanUiState;
  weeks: Week[];
  planGuidance?: PlanGuidance | null;
  totalWeeks?: number;
  generation?: GenerationProgress;
  adjustmentMetadata?: AdjustmentMetadata | null;
  initialWeekIndex?: number;
  initialDayIndex?: number;
  activeWeekIndex?: number;
  onActiveWeekChange?: (index: number) => void;
  readOnly?: boolean;
}) {
  const [internalActiveWeek, setInternalActiveWeek] = useState(initialWeekIndex);
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const resolvedActiveWeek = activeWeekIndex ?? internalActiveWeek;
  const resolvedTotalWeeks = Math.max(totalWeeks, weeks.length);
  const resolvedGeneration = generation ?? {
    status: "ready",
    generatedWeeks: weeks.length,
    totalWeeks: resolvedTotalWeeks,
    missingWeeks: Math.max(0, resolvedTotalWeeks - weeks.length),
    nextWeekNum: weeks.length < resolvedTotalWeeks ? weeks.length + 1 : null,
    percent: resolvedTotalWeeks ? Math.round((weeks.length / resolvedTotalWeeks) * 100) : 100,
    isGenerating: false,
    isFailed: false,
    isReady: true,
    error: null,
  };
  const activeWeek = weeks[resolvedActiveWeek] ?? null;

  function setActiveWeek(index: number) {
    setInternalActiveWeek(index);
    onActiveWeekChange?.(index);
  }

  useEffect(() => {
    const element = weekScrollRef.current;
    if (!element) return;
    const button = element.children[initialWeekIndex] as HTMLElement | undefined;
    button?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [initialWeekIndex]);

  return (
    <div>
      <PlanGuidancePanel
        planId={planId}
        planGuidance={planGuidance}
        initialOpen={initialUiState.coachGuidanceOpen ?? true}
      />
      <div ref={weekScrollRef} className="mb-6 flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
        {Array.from({ length: resolvedTotalWeeks }, (_, index) => {
          const week = weeks[index] ?? null;
          const allExercises = week ? week.days.flatMap((day) => day.sessions.flatMap((session) => session.exercises)) : [];
          const done = week ? allExercises.filter((exercise) => exercise.logs[0]?.completed).length : 0;
          const pct = week && allExercises.length ? Math.round((done / allExercises.length) * 100) : 0;
          const isCurrent = index === initialWeekIndex;
          const isMissing = !week;
          const adjustedCount = week
            ? adjustmentMetadata?.affectedDays.filter((day) => day.weekNum === week.weekNum).length ?? 0
            : 0;

          return (
            <button
              key={week?.id ?? `missing-week-${index + 1}`}
              onClick={() => setActiveWeek(index)}
              className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                resolvedActiveWeek === index
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : isMissing
                    ? "border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:bg-slate-100"
                  : isCurrent
                    ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>W{week?.weekNum ?? index + 1}</span>
              {isMissing && (
                <span className={`mt-0.5 block text-[10px] ${resolvedActiveWeek === index ? "text-blue-100" : "text-slate-400"}`}>
                  pending
                </span>
              )}
              {isCurrent && resolvedActiveWeek !== index && (
                <span className="mt-0.5 block text-[10px] text-blue-500">now</span>
              )}
              {pct > 0 && (
                <span className={`mt-0.5 block text-[10px] ${resolvedActiveWeek === index ? "text-blue-100" : "text-green-600"}`}>
                  {pct}%
                </span>
              )}
              {adjustedCount > 0 && (
                <span className={`mt-0.5 block text-[10px] ${resolvedActiveWeek === index ? "text-blue-100" : "text-amber-600"}`}>
                  adjusted
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeWeek ? (
        <WeekCard
          planId={planId}
          week={activeWeek}
          initialUiState={initialUiState}
          initialDayIndex={resolvedActiveWeek === initialWeekIndex ? initialDayIndex : -1}
          adjustmentMetadata={adjustmentMetadata}
          readOnly={readOnly}
        />
      ) : (
        <MissingWeekCard weekNum={resolvedActiveWeek + 1} generation={resolvedGeneration} />
      )}
    </div>
  );
}
