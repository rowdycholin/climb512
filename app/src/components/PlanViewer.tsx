"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logExercise } from "@/app/actions";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

interface ExerciseLog {
  id: string;
  setsCompleted: number | null;
  repsCompleted: string | null;
  weightUsed: string | null;
  durationActual: string | null;
  notes: string | null;
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

const FOCUS_COLORS: Record<string, string> = {
  "Finger Strength": "bg-red-100 text-red-700 border-red-200",
  Endurance: "bg-blue-100 text-blue-700 border-blue-200",
  "Project Climbing": "bg-violet-100 text-violet-700 border-violet-200",
  "Mobility & Antagonist": "bg-green-100 text-green-700 border-green-200",
  Rest: "bg-slate-100 text-slate-500 border-slate-200",
  "Rest & Recovery": "bg-slate-100 text-slate-500 border-slate-200",
};

function ExerciseRow({ planId, exercise }: { planId: string; exercise: Exercise }) {
  const log = exercise.logs[0] ?? null;
  const [completed, setCompleted] = useState(log?.completed ?? false);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

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
    return formData;
  }

  function toggleComplete() {
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
      <div className="flex items-start gap-3 px-3 py-3">
        <button
          type="button"
          onClick={toggleComplete}
          disabled={pending}
          aria-label={`${completed ? "Mark incomplete" : "Mark complete"}: ${exercise.name}`}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors disabled:opacity-60 ${
            completed ? "border-green-500 bg-green-500" : "border-slate-300 hover:border-green-400"
          }`}
          title="Mark complete"
        >
          {completed && <span className="text-xs leading-none text-white">✓</span>}
        </button>

        <div className="min-w-0 flex-1">
          <span
            className={`text-sm font-semibold ${
              completed ? "text-green-700 line-through decoration-green-400" : "text-slate-800"
            }`}
          >
            {exercise.name}
          </span>

          <div className="mt-1 flex flex-wrap gap-1.5">
            {exercise.sets && (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {exercise.sets} sets
              </span>
            )}
            {exercise.reps && (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {exercise.reps}
              </span>
            )}
            {exercise.duration && (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {exercise.duration}
              </span>
            )}
            {exercise.rest && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-600">
                rest {exercise.rest}
              </span>
            )}
          </div>

          {exercise.notes && (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{exercise.notes}</p>
          )}

          {log && !open && (log.setsCompleted || log.weightUsed || log.repsCompleted || log.durationActual) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
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
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700"
        >
          {open ? "Close" : log?.setsCompleted || log?.weightUsed ? "Edit log" : "Log"}
        </button>
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="border-t border-slate-100 bg-slate-50 px-3 pb-3 pt-3">
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="exerciseId" value={exercise.id} />
          <p className="mb-2 text-xs font-medium text-slate-500">Record what you actually did:</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Sets completed</label>
              <input
                name="setsCompleted"
                type="number"
                min="0"
                defaultValue={log?.setsCompleted ?? ""}
                placeholder={exercise.sets ?? "e.g. 3"}
                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Reps / time done</label>
              <input
                name="repsCompleted"
                type="text"
                defaultValue={log?.repsCompleted ?? ""}
                placeholder={exercise.reps ?? exercise.duration ?? "e.g. 8"}
                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Weight used</label>
              <input
                name="weightUsed"
                type="text"
                defaultValue={log?.weightUsed ?? ""}
                placeholder="e.g. 10kg / bodyweight"
                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Duration (if timed)</label>
              <input
                name="durationActual"
                type="text"
                defaultValue={log?.durationActual ?? ""}
                placeholder="e.g. 7s / 20 min"
                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-slate-500">Notes</label>
              <input
                name="notes"
                type="text"
                defaultValue={log?.notes ?? ""}
                placeholder="How did it feel? Any modifications?"
                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
              />
            </div>
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

function SessionBlock({ planId, session }: { planId: string; session: DaySession }) {
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
      <div>
        {session.exercises.map((exercise) => (
          <ExerciseRow key={exercise.id} planId={planId} exercise={exercise} />
        ))}
      </div>
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-4 w-4"}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function DayCard({
  planId,
  day,
  isHighlighted,
  onSelect,
}: {
  planId: string;
  day: Day;
  isHighlighted: boolean;
  onSelect: (dayId: string) => void;
}) {
  const colorClass = FOCUS_COLORS[day.focus] ?? "border-slate-200 bg-slate-100 text-slate-600";
  const totalDuration = day.sessions.reduce((sum, session) => sum + session.duration, 0);
  const totalExercises = day.sessions.flatMap((session) => session.exercises).length;
  const completedExercises = day.sessions
    .flatMap((session) => session.exercises)
    .filter((exercise) => exercise.logs[0]?.completed).length;
  const hasProgress = completedExercises > 0;

  return (
    <AccordionItem
      value={day.id}
      className={`mb-2 overflow-hidden rounded-xl border ${
        isHighlighted ? "border-blue-300 bg-blue-50/50" : "border-slate-200 bg-white"
      }`}
    >
      <AccordionTrigger
        className="group px-4 py-3 hover:bg-slate-50 hover:no-underline [&[data-state=open]]:bg-slate-50"
        onClick={() => onSelect(day.id)}
      >
        <div className="flex w-full items-center gap-2 text-left">
          <ChevronIcon className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-aria-expanded:rotate-180" />
          <div className="w-[72px] shrink-0">
            <span className={`text-xs font-semibold ${isHighlighted ? "text-blue-600" : "text-slate-500"}`}>
              {day.dayName}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-sm font-semibold text-slate-700">{day.focus}</span>
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
        {day.sessions.map((session) => (
          <SessionBlock key={session.id} planId={planId} session={session} />
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}

function WeekCard({ planId, week, initialDayIndex }: { planId: string; week: Week; initialDayIndex: number }) {
  const trainingDays = week.days.filter((day) => !day.isRest).length;
  const allExercises = week.days.flatMap((day) => day.sessions.flatMap((session) => session.exercises));
  const completedCount = allExercises.filter((exercise) => exercise.logs[0]?.completed).length;
  const initialDayId = week.days[initialDayIndex]?.id ?? null;

  const [openDayIds, setOpenDayIds] = useState<string[]>(() => (initialDayId ? [initialDayId] : []));
  const [highlightedDayId, setHighlightedDayId] = useState<string | null>(initialDayId);

  useEffect(() => {
    setOpenDayIds(initialDayId ? [initialDayId] : []);
    setHighlightedDayId(initialDayId);
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
      <Accordion multiple value={openDayIds} onValueChange={setOpenDayIds} className="space-y-0">
        {week.days.map((day, index) => (
          <DayCard
            key={day.id}
            planId={planId}
            day={day}
            isHighlighted={highlightedDayId ? day.id === highlightedDayId : index === initialDayIndex}
            onSelect={setHighlightedDayId}
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
  weeks,
  totalWeeks = weeks.length,
  generation,
  initialWeekIndex = 0,
  initialDayIndex = 0,
  activeWeekIndex,
  onActiveWeekChange,
}: {
  planId: string;
  weeks: Week[];
  totalWeeks?: number;
  generation?: GenerationProgress;
  initialWeekIndex?: number;
  initialDayIndex?: number;
  activeWeekIndex?: number;
  onActiveWeekChange?: (index: number) => void;
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
      <div ref={weekScrollRef} className="mb-6 flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
        {Array.from({ length: resolvedTotalWeeks }, (_, index) => {
          const week = weeks[index] ?? null;
          const allExercises = week ? week.days.flatMap((day) => day.sessions.flatMap((session) => session.exercises)) : [];
          const done = week ? allExercises.filter((exercise) => exercise.logs[0]?.completed).length : 0;
          const pct = week && allExercises.length ? Math.round((done / allExercises.length) * 100) : 0;
          const isCurrent = index === initialWeekIndex;
          const isMissing = !week;

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
            </button>
          );
        })}
      </div>

      {activeWeek ? (
        <WeekCard
          planId={planId}
          week={activeWeek}
          initialDayIndex={resolvedActiveWeek === initialWeekIndex ? initialDayIndex : -1}
        />
      ) : (
        <MissingWeekCard weekNum={resolvedActiveWeek + 1} generation={resolvedGeneration} />
      )}
    </div>
  );
}
