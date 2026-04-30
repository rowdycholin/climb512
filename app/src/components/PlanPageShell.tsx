"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, History, MessageCircle, PencilLine, RotateCcw, WandSparkles } from "lucide-react";
import { completePlan, reopenPlan, repairPlanGeneration, revertPlanVersion } from "@/app/actions";
import PlanWorkspace from "@/components/PlanWorkspace";
import { Button } from "@/components/ui/button";

const REPAIR_PROMPTS = [
  "Reduce volume and continue from the prior generated weeks.",
  "Simplify the schedule and avoid cramming missed work.",
  "Avoid the movement that caused the failed week and choose safer alternatives.",
  "Keep the same goal, but make the remaining weeks more conservative.",
];

interface PlanPageShellProps {
  planId: string;
  weeks: Parameters<typeof PlanWorkspace>[0]["weeks"];
  totalWeeks: number;
  initialWeekIndex: number;
  initialDayIndex: number;
  summary: {
    currentGrade: string;
    targetGrade: string;
    weeksDuration: number;
    goals: string[];
    sport: string;
    disciplines: string[];
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
      id: string;
      versionNum: number;
      changeType: string;
      changeSummary: string | null;
      effectiveFromDay: number | null;
      isPreview: boolean;
      previewCreatedAtLabel: string | null;
      currentVersionNum: number;
      changeMetadata: {
        affectedDays: Array<{
          weekNum: number;
          dayNum: number;
          planDay: number;
          dayName: string;
          summary: string;
        }>;
      } | null;
    };
    versions: Array<{
      id: string;
      versionNum: number;
      rawVersionNum: number;
      changeType: string;
      changeSummary: string | null;
      effectiveFromWeek: number | null;
      effectiveFromDay: number | null;
      createdAtLabel: string;
      isCurrent: boolean;
      isPreview: boolean;
    }>;
    generation: {
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
    };
    generationJob: {
      failedWeekNum: number | null;
      lastError: string | null;
      repairNotes: string | null;
    } | null;
  };
}

export default function PlanPageShell({
  planId,
  weeks,
  totalWeeks,
  initialWeekIndex,
  initialDayIndex,
  summary,
}: PlanPageShellProps) {
  const router = useRouter();
  const [activeWeekIndex, setActiveWeekIndex] = useState(initialWeekIndex);
  const [editorOpen, setEditorOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [completionPanelOpen, setCompletionPanelOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [repairNotes, setRepairNotes] = useState(summary.generationJob?.repairNotes ?? "");
  const [transientAdjustmentMetadata, setTransientAdjustmentMetadata] =
    useState<typeof summary.version.changeMetadata>(null);

  const activeWeek = weeks[activeWeekIndex] ?? null;
  const activeWeekLocked = useMemo(
    () =>
      activeWeek?.days.some((day) =>
        day.sessions.some((session) =>
          session.exercises.some((exercise) => exercise.logs.length > 0),
        ),
      ) ?? false,
    [activeWeek],
  );
  const completionDisabled = !summary.generation.isReady;
  const planActionsDisabled = !summary.generation.isReady || summary.version.isPreview;

  useEffect(() => {
    if (!summary.generation.isGenerating) return;

    const timer = window.setInterval(() => {
      router.refresh();
    }, 1500);

    return () => window.clearInterval(timer);
  }, [router, summary.generation.isGenerating]);

  useEffect(() => {
    if (!summary.generation.isFailed) return;
    setRepairNotes(summary.generationJob?.repairNotes ?? "");
  }, [summary.generation.isFailed, summary.generationJob?.repairNotes]);

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

  function versionTypeLabel(changeType: string) {
    return changeType
      .replace(/^ai_/, "AI ")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
            {summary.version.isPreview && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-semibold">Previewing Version {summary.version.versionNum}</p>
                <p className="mt-1 text-amber-800">
                  Read-only historical view. Logs, edits, adjustments, completion, and revert actions are disabled.
                </p>
                <a
                  href={`/plan/${planId}`}
                  className="mt-2 inline-flex rounded-md border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                >
                  Return to current version
                </a>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={versionHistoryOpen ? "default" : "outline"}
              aria-label={versionHistoryOpen ? "Close version history" : "Open version history"}
              title="Version history"
              onClick={() => setVersionHistoryOpen((value) => !value)}
              disabled={summary.versions.length === 0}
              className={`gap-2 ${versionHistoryOpen ? "shadow-sm" : "border-white/80 bg-white/80 backdrop-blur"}`}
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Versions</span>
            </Button>
            <Button
              type="button"
              variant={editorOpen ? "default" : "outline"}
              aria-label={editorOpen ? "Close day editor" : "Open day editor"}
              title={activeWeekLocked ? "Add exercises without changing logged work" : "Edit this week"}
              onClick={toggleEditor}
              disabled={!activeWeek || planActionsDisabled}
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
              disabled={!activeWeek || planActionsDisabled}
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
                  disabled={planActionsDisabled}
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
                title={completionDisabled ? "Plan generation must finish first" : "Complete plan"}
                onClick={() => setCompletionPanelOpen((value) => !value)}
                disabled={completionDisabled || summary.version.isPreview}
                className={`gap-2 ${completionPanelOpen ? "shadow-sm" : "border-white/80 bg-white/80 backdrop-blur"}`}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span className="hidden sm:inline">Complete</span>
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-700">
          <span>
            {summary.version.isPreview
              ? `Preview Version ${summary.version.versionNum}`
              : summary.generation.isReady
                ? `Version ${summary.version.versionNum}`
                : "Generating initial plan"}
          </span>
          <span>&middot;</span>
          <span>Goals: {summary.goals.join(", ")}</span>
          <span>&middot;</span>
          <span>{summary.daysPerWeek} days/week</span>
          <span>&middot;</span>
          <span>Age {summary.age}</span>
          <span>&middot;</span>
          <span>{activeWeek ? `Week ${activeWeek.weekNum}: ${activeWeek.theme}` : `Week ${activeWeekIndex + 1}: generating`}</span>
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

        {versionHistoryOpen && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Version History</p>
                <p className="mt-1 text-xs text-slate-500">
                  Reverting creates a new current version. Existing workout logs are preserved.
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                {summary.version.isPreview
                  ? `Preview v${summary.version.versionNum}`
                  : `Current v${summary.version.versionNum}`}
              </span>
            </div>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {summary.versions.map((version) => (
                <div
                  key={version.id}
                  className={`rounded-lg border px-3 py-3 text-sm ${
                    version.isCurrent
                      ? "border-blue-200 bg-blue-50 text-blue-900"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">Version {version.versionNum}</p>
                        {version.isCurrent && (
                          <span className="rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                            Current
                          </span>
                        )}
                        {version.isPreview && (
                          <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            Preview
                          </span>
                        )}
                        <span className="text-xs text-slate-500">{version.createdAtLabel}</span>
                      </div>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {versionTypeLabel(version.changeType)}
                        {version.effectiveFromDay ? ` from day ${version.effectiveFromDay}` : version.effectiveFromWeek ? ` from week ${version.effectiveFromWeek}` : ""}
                      </p>
                      {version.changeSummary && (
                        <p className="mt-1 line-clamp-2 text-sm text-slate-700">{version.changeSummary}</p>
                      )}
                    </div>
                    {!version.isCurrent && (
                      <div className="flex flex-wrap gap-2">
                        {!version.isPreview && (
                          <a
                            href={`/plan/${planId}?version=${version.id}`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                            aria-label={`Preview Version ${version.versionNum}`}
                            title={`Preview Version ${version.versionNum}`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Preview
                          </a>
                        )}
                        {!summary.version.isPreview && (
                          <form
                            action={revertPlanVersion}
                            onSubmit={(event) => {
                              if (
                                !window.confirm(
                                  `Revert to Version ${version.versionNum}? This creates a new current version and keeps workout logs.`,
                                )
                              ) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input type="hidden" name="planId" value={planId} />
                            <input type="hidden" name="versionId" value={version.id} />
                            <Button
                              type="submit"
                              variant="outline"
                              size="sm"
                              aria-label={`Revert to Version ${version.versionNum}`}
                              title={`Revert to Version ${version.versionNum}`}
                            >
                              Revert
                            </Button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {summary.completion.isUserCompleted && summary.completion.completedAtLabel && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-white/80 px-3 py-2 text-sm text-emerald-800">
            <p className="font-medium">Marked complete {summary.completion.completedAtLabel}</p>
            {summary.completion.notes && <p className="mt-1 text-emerald-700">{summary.completion.notes}</p>}
          </div>
        )}

        {(summary.generation.isGenerating || summary.generation.isFailed) && (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            summary.generation.isFailed
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-sky-200 bg-sky-50 text-sky-800"
          }`}>
            <p className="font-medium">
              {summary.generation.isFailed
                ? `Week ${summary.generationJob?.failedWeekNum ?? summary.generation.nextWeekNum ?? summary.generation.generatedWeeks + 1} needs repair`
                : `Generating week ${summary.generation.nextWeekNum ?? summary.generation.generatedWeeks} of ${summary.generation.totalWeeks}`}
            </p>
            <p className="mt-1">
              {summary.generation.isFailed
                ? summary.generationJob?.lastError ?? summary.generation.error ?? "The already generated weeks are still available."
                : `${summary.generation.generatedWeeks}/${summary.generation.totalWeeks} weeks ready (${summary.generation.percent}%).`}
            </p>
            {summary.generation.isFailed && (
              <form action={repairPlanGeneration} className="mt-3 rounded-lg border border-red-200 bg-white/80 p-3 text-slate-800">
                <input type="hidden" name="planId" value={planId} />
                <label htmlFor="repair-notes" className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Repair guidance
                </label>
                <textarea
                  id="repair-notes"
                  name="repairNotes"
                  rows={3}
                  maxLength={2000}
                  required
                  value={repairNotes}
                  onChange={(event) => setRepairNotes(event.target.value)}
                  placeholder="Reduce volume, avoid a movement, simplify the schedule, or continue from prior weeks."
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-red-400 focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {REPAIR_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setRepairNotes(prompt)}
                      className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs text-red-700 transition-colors hover:border-red-200 hover:bg-red-100"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex justify-end">
                  <Button type="submit" className="gap-2">
                    <WandSparkles className="h-4 w-4" />
                    Resume Generation
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {completionPanelOpen && !summary.completion.isUserCompleted && !completionDisabled && (
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

        {activeWeek && activeWeekLocked && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Week {activeWeek.weekNum} already has workout logs. Existing work is protected, but you can still add extra exercises from Edit Day.
          </p>
        )}
      </div>

      <PlanWorkspace
        planId={planId}
        weeks={weeks}
        totalWeeks={totalWeeks}
        generation={summary.generation}
        sport={summary.sport}
        disciplines={summary.disciplines}
        adjustmentMetadata={transientAdjustmentMetadata}
        onAdjustmentApplied={setTransientAdjustmentMetadata}
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
        readOnly={summary.version.isPreview}
      />
    </>
  );
}
