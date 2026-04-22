"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { logExercise } from "@/app/actions";

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
  order: number;
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

const FOCUS_COLORS: Record<string, string> = {
  "Finger Strength": "bg-red-100 text-red-700 border-red-200",
  "Endurance": "bg-blue-100 text-blue-700 border-blue-200",
  "Project Climbing": "bg-purple-100 text-purple-700 border-purple-200",
  "Mobility & Antagonist": "bg-green-100 text-green-700 border-green-200",
  "Rest & Recovery": "bg-slate-100 text-slate-500 border-slate-200",
};

function ExerciseRow({ ex }: { ex: Exercise }) {
  const log = ex.logs[0] ?? null;
  const [completed, setCompleted] = useState(log?.completed ?? false);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggleComplete() {
    const next = !completed;
    setCompleted(next);
    const fd = new FormData();
    fd.set("exerciseId", ex.id);
    fd.set("completed", next ? "true" : "false");
    if (log?.setsCompleted) fd.set("setsCompleted", String(log.setsCompleted));
    if (log?.repsCompleted) fd.set("repsCompleted", log.repsCompleted);
    if (log?.weightUsed) fd.set("weightUsed", log.weightUsed);
    if (log?.durationActual) fd.set("durationActual", log.durationActual);
    if (log?.notes) fd.set("notes", log.notes);
    startTransition(async () => {
      await logExercise(fd);
      router.refresh();
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("completed", completed ? "true" : "false");
    startTransition(async () => {
      await logExercise(fd);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className={`rounded-xl border mb-2 last:mb-0 overflow-hidden transition-colors ${completed ? "border-green-300 bg-green-50" : "border-slate-200 bg-white"}`}>
      {/* Exercise header row */}
      <div className="flex items-start gap-3 px-3 py-3">
        {/* Completion checkbox */}
        <button
          type="button"
          onClick={toggleComplete}
          disabled={pending}
          className={`mt-0.5 shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors disabled:opacity-60 ${completed ? "bg-green-500 border-green-500" : "border-slate-300 hover:border-green-400"}`}
          title="Mark complete"
        >
          {completed && <span className="text-white text-xs leading-none">✓</span>}
        </button>

        {/* Name + planned targets */}
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-semibold ${completed ? "text-green-700 line-through decoration-green-400" : "text-slate-800"}`}>{ex.name}</span>

          {/* Planned targets */}
          <div className="flex flex-wrap gap-1.5 mt-1">
            {ex.sets && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{ex.sets} sets</span>}
            {ex.reps && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{ex.reps}</span>}
            {ex.duration && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{ex.duration}</span>}
            {ex.rest && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">rest {ex.rest}</span>}
          </div>

          {/* Exercise notes / how-to */}
          {ex.notes && (
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{ex.notes}</p>
          )}

          {/* Logged summary (when collapsed) */}
          {log && !open && (log.setsCompleted || log.weightUsed || log.repsCompleted || log.durationActual) && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {log.setsCompleted && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">Done: {log.setsCompleted} sets</span>}
              {log.repsCompleted && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">{log.repsCompleted}</span>}
              {log.weightUsed && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">{log.weightUsed}</span>}
              {log.durationActual && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">{log.durationActual}</span>}
            </div>
          )}
        </div>

        {/* Log toggle button */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-xs px-2.5 py-1 rounded-lg border border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors"
        >
          {open ? "Close" : log?.setsCompleted || log?.weightUsed ? "Edit log" : "Log"}
        </button>
      </div>

      {/* Log form (expanded) */}
      {open && (
        <form onSubmit={handleSubmit} className="px-3 pb-3 border-t border-slate-100 pt-3 bg-slate-50">
          <input type="hidden" name="exerciseId" value={ex.id} />
          <p className="text-xs text-slate-500 mb-2 font-medium">Record what you actually did:</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Sets completed</label>
              <input
                name="setsCompleted"
                type="number"
                min="0"
                defaultValue={log?.setsCompleted ?? ""}
                placeholder={ex.sets ?? "e.g. 3"}
                className="w-full h-8 px-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Reps / time done</label>
              <input
                name="repsCompleted"
                type="text"
                defaultValue={log?.repsCompleted ?? ""}
                placeholder={ex.reps ?? ex.duration ?? "e.g. 8"}
                className="w-full h-8 px-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Weight used</label>
              <input
                name="weightUsed"
                type="text"
                defaultValue={log?.weightUsed ?? ""}
                placeholder="e.g. 10kg / bodyweight"
                className="w-full h-8 px-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Duration (if timed)</label>
              <input
                name="durationActual"
                type="text"
                defaultValue={log?.durationActual ?? ""}
                placeholder="e.g. 7s / 20 min"
                className="w-full h-8 px-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-500 block mb-1">Notes</label>
              <input
                name="notes"
                type="text"
                defaultValue={log?.notes ?? ""}
                placeholder="How did it feel? Any modifications?"
                className="w-full h-8 px-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="mt-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
          >
            {pending ? "Saving..." : saved ? "Saved!" : "Save log"}
          </button>
        </form>
      )}
    </div>
  );
}

function SessionBlock({ session }: { session: DaySession }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
          {session.name} — {session.duration} min
        </span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <p className="text-xs text-slate-500 italic mb-2 px-1">{session.description}</p>
      <div>
        {session.exercises.map((ex) => <ExerciseRow key={ex.id} ex={ex} />)}
      </div>
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
      strokeLinecap="round" strokeLinejoin="round" className={className ?? "w-4 h-4"}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function DayCard({ day, isToday }: { day: Day; isToday: boolean }) {
  const colorClass = FOCUS_COLORS[day.focus] ?? "bg-slate-100 text-slate-600 border-slate-200";
  const totalDuration = day.sessions.reduce((sum, s) => sum + s.duration, 0);
  const totalExercises = day.sessions.flatMap((s) => s.exercises).length;
  const completedExercises = day.sessions.flatMap((s) => s.exercises).filter((ex) => ex.logs[0]?.completed).length;
  const hasProgress = completedExercises > 0;

  return (
    <AccordionItem
      value={day.id}
      className={`border rounded-xl mb-2 overflow-hidden ${isToday ? "border-blue-300 bg-blue-50/50" : "border-slate-200 bg-white"}`}
    >
      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50 [&[data-state=open]]:bg-slate-50 group">
        <div className="flex items-center gap-2 w-full text-left">
          <ChevronIcon className="w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 group-aria-expanded:rotate-180" />
          <div className="shrink-0 w-[72px]">
            <span className={`text-xs font-semibold ${isToday ? "text-blue-600" : "text-slate-500"}`}>
              {day.dayName}
            </span>
            {isToday && <span className="block text-[10px] text-blue-500 font-medium">Today</span>}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-slate-700">{day.focus}</span>
            {hasProgress && !day.isRest && (
              <span className="ml-2 text-xs text-green-600">{completedExercises}/{totalExercises} done</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!day.isRest && <span className="text-xs text-slate-400">{totalDuration} min</span>}
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${colorClass}`}>{day.isRest ? "Rest" : "Training"}</span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-3 border-t border-slate-100">
        {day.sessions.map((s) => <SessionBlock key={s.id} session={s} />)}
      </AccordionContent>
    </AccordionItem>
  );
}

function WeekCard({ week, todayDayIndex }: { week: Week; todayDayIndex: number }) {
  const trainingDays = week.days.filter((d) => !d.isRest).length;
  const allExercises = week.days.flatMap((d) => d.sessions.flatMap((s) => s.exercises));
  const completedCount = allExercises.filter((ex) => ex.logs[0]?.completed).length;
  const defaultOpenValues = week.days
    .filter((_, idx) => idx === todayDayIndex)
    .map((d) => d.id);

  return (
    <div>
      <div className="mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-slate-800">Week {week.weekNum}</h3>
          <Badge variant="outline" className="text-slate-600 border-slate-300 bg-white">{week.theme}</Badge>
          {completedCount > 0 && (
            <span className="text-xs text-green-600 font-medium">{completedCount}/{allExercises.length} logged</span>
          )}
        </div>
        <p className="text-sm text-slate-500 mt-1">{trainingDays} training days · {7 - trainingDays} rest days</p>
      </div>
      <Accordion multiple defaultValue={defaultOpenValues} className="space-y-0">
        {week.days.map((day, idx) => (
          <DayCard
            key={day.id}
            day={day}
            isToday={idx === todayDayIndex}
          />
        ))}
      </Accordion>
    </div>
  );
}

export default function PlanViewer({
  weeks,
  initialWeekIndex = 0,
  initialDayIndex = 0,
}: {
  weeks: Week[];
  initialWeekIndex?: number;
  initialDayIndex?: number;
}) {
  const [activeWeek, setActiveWeek] = useState(initialWeekIndex);
  const weekScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = weekScrollRef.current;
    if (!el) return;
    const btn = el.children[initialWeekIndex] as HTMLElement | undefined;
    btn?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [initialWeekIndex]);

  return (
    <div>
      {/* Week selector — horizontal scroll */}
      <div
        ref={weekScrollRef}
        className="flex gap-2 overflow-x-auto pb-2 mb-6"
        style={{ scrollbarWidth: "thin" }}
      >
        {weeks.map((w, idx) => {
          const allEx = w.days.flatMap((d) => d.sessions.flatMap((s) => s.exercises));
          const done = allEx.filter((ex) => ex.logs[0]?.completed).length;
          const pct = allEx.length ? Math.round((done / allEx.length) * 100) : 0;
          const isCurrent = idx === initialWeekIndex;
          return (
            <button
              key={w.id}
              onClick={() => setActiveWeek(idx)}
              className={`shrink-0 flex flex-col items-center px-3 py-2 rounded-xl text-sm font-medium transition-colors border ${
                activeWeek === idx
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : isCurrent
                  ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span>W{w.weekNum}</span>
              {isCurrent && activeWeek !== idx && (
                <span className="text-[10px] mt-0.5 text-blue-500">now</span>
              )}
              {pct > 0 && (
                <span className={`text-[10px] mt-0.5 ${activeWeek === idx ? "text-blue-100" : "text-green-600"}`}>
                  {pct}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      <WeekCard week={weeks[activeWeek]} todayDayIndex={activeWeek === initialWeekIndex ? initialDayIndex : -1} />
    </div>
  );
}
