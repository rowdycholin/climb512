"use client";

import { useMemo, useState } from "react";
import { PencilLine, Sparkles } from "lucide-react";
import PlanWorkspace from "@/components/PlanWorkspace";
import { Button } from "@/components/ui/button";

interface PlanPageShellProps {
  planId: string;
  weeks: Parameters<typeof PlanWorkspace>[0]["weeks"];
  initialWeekIndex: number;
  initialDayIndex: number;
  summary: {
    currentGrade: string;
    targetGrade: string;
    weeksDuration: number;
    goals: string[];
    daysPerWeek: number;
    age: number;
    equipment: string[];
  };
}

export default function PlanPageShell({
  planId,
  weeks,
  initialWeekIndex,
  initialDayIndex,
  summary,
}: PlanPageShellProps) {
  const [activeWeekIndex, setActiveWeekIndex] = useState(initialWeekIndex);
  const [editorOpen, setEditorOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);

  const activeWeek = weeks[activeWeekIndex];
  const activeWeekLocked = useMemo(
    () =>
      activeWeek.days.some((day) =>
        day.sessions.some((session) =>
          session.exercises.some((exercise) => exercise.logs.length > 0),
        ),
      ),
    [activeWeek],
  );

  function toggleEditor() {
    if (activeWeekLocked) return;
    setEditorOpen((value) => {
      const next = !value;
      if (next) setCoachOpen(false);
      return next;
    });
  }

  function toggleCoach() {
    if (activeWeekLocked) return;
    setCoachOpen((value) => {
      const next = !value;
      if (next) setEditorOpen(false);
      return next;
    });
  }

  return (
    <>
      <div className="mb-6 overflow-hidden rounded-[1.5rem] border border-white/70 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_32%),linear-gradient(145deg,_rgba(255,255,255,0.98),_rgba(240,249,255,0.92)_52%,_rgba(255,251,235,0.86))] p-5 shadow-[0_20px_50px_rgba(15,23,42,0.10)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700/70">Current Block</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Your Plan Summary</h2>
            <p className="mt-1 text-sm text-slate-600">
              {summary.currentGrade} to {summary.targetGrade} over {summary.weeksDuration} weeks
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={editorOpen ? "default" : "outline"}
              size="icon"
              aria-label={editorOpen ? "Close plan editor" : "Open plan editor"}
              title={activeWeekLocked ? "Weeks with logs are locked" : "Edit this week"}
              onClick={toggleEditor}
              disabled={activeWeekLocked}
              className={editorOpen ? "shadow-sm" : "border-white/80 bg-white/80 backdrop-blur"}
            >
              <PencilLine className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={coachOpen ? "default" : "outline"}
              size="icon"
              aria-label={coachOpen ? "Close coach tools" : "Open coach tools"}
              title={activeWeekLocked ? "Weeks with logs are locked" : "Ask the coach"}
              onClick={toggleCoach}
              disabled={activeWeekLocked}
              className={coachOpen ? "shadow-sm" : "border-white/80 bg-white/80 backdrop-blur"}
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-700">
          <span>Goals: {summary.goals.join(", ")}</span>
          <span>&middot;</span>
          <span>{summary.daysPerWeek} days/week</span>
          <span>&middot;</span>
          <span>Age {summary.age}</span>
          <span>&middot;</span>
          <span>Week {activeWeek.weekNum}: {activeWeek.theme}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {summary.equipment.map((item) => (
            <span
              key={item}
              className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs text-slate-700 shadow-sm"
            >
              {item}
            </span>
          ))}
        </div>

        {activeWeekLocked && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Week {activeWeek.weekNum} already has workout logs, so editing and coach suggestions are locked for that week.
          </p>
        )}
      </div>

      <PlanWorkspace
        planId={planId}
        weeks={weeks}
        activeWeekIndex={activeWeekIndex}
        initialDayIndex={initialDayIndex}
        editorOpen={editorOpen}
        onEditorOpenChange={setEditorOpen}
        coachOpen={coachOpen}
        onCoachOpenChange={setCoachOpen}
        onActiveWeekChange={(nextIndex) => {
          setActiveWeekIndex(nextIndex);
          setEditorOpen(false);
          setCoachOpen(false);
        }}
      />
    </>
  );
}
