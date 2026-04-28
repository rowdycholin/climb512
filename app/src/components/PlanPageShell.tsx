"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, MessageCircle, PencilLine, RotateCcw } from "lucide-react";
import { completePlan, reopenPlan } from "@/app/actions";
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
    calendar: {
      startDateLabel: string;
      currentPlanDay: number;
      totalPlanDays: number;
      isComplete: boolean;
      isBeforeStart: boolean;
    };
    completion: {
      isUserCompleted: boolean;
      completedAtLabel: string | null;
      reason: string | null;
      notes: string | null;
    };
    version: {
      changeType: string;
      changeSummary: string | null;
      effectiveFromDay: number | null;
    };
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
  const [completionPanelOpen, setCompletionPanelOpen] = useState(false);

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
    setEditorOpen((value) => {
      const next = !value;
      if (next) setCoachOpen(false);
      return next;
    });
  }

  function toggleCoach() {
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
            {summary.calendar.isComplete && (
              <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                Congratulations! {summary.completion.isUserCompleted ? "You marked this training plan complete." : "You reached the end of this training plan."}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={editorOpen ? "default" : "outline"}
              aria-label={editorOpen ? "Close day editor" : "Open day editor"}
              title={activeWeekLocked ? "Add exercises without changing logged work" : "Edit this week"}
              onClick={toggleEditor}
              className={`gap-2 ${editorOpen ? "shadow-sm" : "border-white/80 bg-white/80 backdrop-blur"}`}
            >
              <PencilLine className="h-4 w-4" />
              <span className="hidden sm:inline">Edit Day</span>
            </Button>
            <Button
              type="button"
              variant={coachOpen ? "default" : "outline"}
              aria-label={coachOpen ? "Close plan adjustment" : "Open plan adjustment"}
              title="Adjust future plan"
              onClick={toggleCoach}
              className={`gap-2 ${coachOpen ? "shadow-sm" : "border-white/80 bg-white/80 backdrop-blur"}`}
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Adjust Plan</span>
            </Button>
            {summary.completion.isUserCompleted ? (
              <form action={reopenPlan}>
                <input type="hidden" name="planId" value={planId} />
                <Button
                  type="submit"
                  variant="outline"
                  aria-label="Reopen plan"
                  title="Reopen plan"
                  className="gap-2 border-white/80 bg-white/80 backdrop-blur"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span className="hidden sm:inline">Reopen</span>
                </Button>
              </form>
            ) : (
              <Button
                type="button"
                variant={completionPanelOpen ? "default" : "outline"}
                aria-label="Complete plan"
                title="Complete plan"
                onClick={() => setCompletionPanelOpen((value) => !value)}
                className={`gap-2 ${completionPanelOpen ? "shadow-sm" : "border-white/80 bg-white/80 backdrop-blur"}`}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span className="hidden sm:inline">Complete</span>
              </Button>
            )}
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
          <span>&middot;</span>
          <span>Start {summary.calendar.startDateLabel}</span>
          <span>&middot;</span>
          <span>
            {summary.calendar.isBeforeStart ? "Starts soon" : `Day ${summary.calendar.currentPlanDay} of ${summary.calendar.totalPlanDays}`}
          </span>
          {summary.calendar.isComplete && (
            <>
              <span>&middot;</span>
              <span className="font-semibold text-emerald-700">Complete</span>
            </>
          )}
        </div>

        {summary.completion.isUserCompleted && summary.completion.completedAtLabel && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-white/80 px-3 py-2 text-sm text-emerald-800">
            <p className="font-medium">Marked complete {summary.completion.completedAtLabel}</p>
            {summary.completion.notes && <p className="mt-1 text-emerald-700">{summary.completion.notes}</p>}
          </div>
        )}

        {summary.version.changeType === "ai_future_adjustment" && summary.version.changeSummary && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            <p className="font-medium">Plan adjusted</p>
            <p className="mt-1">{summary.version.changeSummary}</p>
          </div>
        )}

        {completionPanelOpen && !summary.completion.isUserCompleted && (
          <form action={completePlan} className="mt-4 rounded-xl border border-emerald-200 bg-white/90 p-4 shadow-sm">
            <input type="hidden" name="planId" value={planId} />
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <label htmlFor="completion-reason" className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Completion
                </label>
                <select
                  id="completion-reason"
                  name="completionReason"
                  defaultValue="finished"
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-emerald-400 focus:outline-none"
                >
                  <option value="finished">Finished the plan</option>
                  <option value="goal_completed">Completed the goal</option>
                  <option value="stopped_early">Stopped early</option>
                  <option value="replaced_by_new_plan">Replaced by a new plan</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <Button type="submit" className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Mark Complete
              </Button>
            </div>
            <label htmlFor="completion-notes" className="mb-1 mt-3 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Notes
            </label>
            <textarea
              id="completion-notes"
              name="completionNotes"
              rows={3}
              maxLength={2000}
              placeholder="How did it go? Anything to remember for the next plan?"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
            />
          </form>
        )}

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
            Week {activeWeek.weekNum} already has workout logs. Existing work is protected, but you can still add extra exercises from Edit Day.
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
