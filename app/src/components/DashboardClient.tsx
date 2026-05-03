"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Dumbbell, PlayCircle, Trash2 } from "lucide-react";
import { deletePlans } from "@/app/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionPanel } from "@/components/ui/app-shell";

interface Plan {
  id: string;
  title: string;
  createdAt: Date;
  createdAtLabel: string;
  startDateLabel: string;
  currentPlanDay: number;
  totalPlanDays: number;
  isComplete: boolean;
  isUserCompleted: boolean;
  completedAtLabel: string | null;
  isBeforeStart: boolean;
  generationStatus: string;
  today: {
    weekNum: number;
    dayNum: number;
    dayName: string;
    focus: string;
    isRest: boolean;
    sessionCount: number;
  } | null;
  profile: {
    currentGrade: string;
    targetGrade: string;
    weeksDuration: number;
    daysPerWeek: number;
  };
}

function progressLabel(plan: Plan) {
  if (plan.generationStatus !== "ready") return "Generating";
  if (plan.isComplete) return "Complete";
  if (plan.isBeforeStart) return "Starts soon";
  return `Day ${plan.currentPlanDay} of ${plan.totalPlanDays}`;
}

function statusClass(plan: Plan) {
  if (plan.isComplete) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (plan.generationStatus !== "ready") return "border-sky-200 bg-sky-50 text-sky-700";
  if (plan.isBeforeStart) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function DashboardClient({ plans, currentPlanId }: { plans: Plan[]; currentPlanId: string | null }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const planIds = useMemo(() => new Set(plans.map((plan) => plan.id)), [plans]);
  const selectedPlanIds = useMemo(() => Array.from(selected).filter((id) => planIds.has(id)), [planIds, selected]);
  const currentPlan = plans.find((plan) => plan.id === currentPlanId) ?? plans[0];
  const otherPlans = plans.filter((plan) => plan.id !== currentPlan?.id);

  useEffect(() => {
    setSelected((previous) => {
      const next = new Set(Array.from(previous).filter((id) => planIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [planIds]);

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {currentPlan && (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <SectionPanel>
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-sky-100 bg-sky-50 p-2 text-sky-700">
                <PlayCircle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Continue Current Plan</p>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(currentPlan)}`}>
                    {progressLabel(currentPlan)}
                  </span>
                </div>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{currentPlan.title}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {currentPlan.profile.currentGrade} to {currentPlan.profile.targetGrade} | {currentPlan.profile.weeksDuration} weeks | {currentPlan.profile.daysPerWeek} days/week
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/plan/${currentPlan.id}`} className={buttonVariants()}>
                    Open Plan
                  </Link>
                  <Link href="/intake" className={buttonVariants({ variant: "outline" })}>
                    New AI Plan
                  </Link>
                </div>
              </div>
            </div>
          </SectionPanel>

          <SectionPanel>
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2 text-emerald-700">
                {currentPlan.today?.isRest ? <CalendarDays className="h-5 w-5" /> : <Dumbbell className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Today&apos;s Work</p>
                {currentPlan.today ? (
                  <>
                    <h2 className="mt-2 text-xl font-semibold text-slate-950">
                      {currentPlan.today.dayName}: {currentPlan.today.isRest ? "Rest day" : currentPlan.today.focus}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Week {currentPlan.today.weekNum}, day {currentPlan.today.dayNum}
                      {currentPlan.today.isRest ? "" : ` | ${currentPlan.today.sessionCount} session${currentPlan.today.sessionCount === 1 ? "" : "s"}`}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="mt-2 text-xl font-semibold text-slate-950">
                      {currentPlan.isBeforeStart ? "Plan starts soon" : currentPlan.isComplete ? "Plan complete" : "Plan is being prepared"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Start {currentPlan.startDateLabel} | {progressLabel(currentPlan)}
                    </p>
                  </>
                )}
              </div>
            </div>
          </SectionPanel>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Saved Plans</h2>
          <p className="text-sm text-slate-500">
            {otherPlans.length > 0 ? "Older and alternate plans stay here for review." : "Your current plan is the only saved plan so far."}
          </p>
        </div>
        {selectedPlanIds.length > 0 && (
          <form action={deletePlans}>
            {selectedPlanIds.map((id) => (
              <input key={id} type="hidden" name="planIds" value={id} />
            ))}
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              className="gap-2"
              onClick={(event) => {
                if (!confirm(`Delete ${selectedPlanIds.length} plan${selectedPlanIds.length > 1 ? "s" : ""}?`)) {
                  event.preventDefault();
                  return;
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete selected plans ({selectedPlanIds.length})
            </Button>
          </form>
        )}
      </div>

      {plans.map((plan) => (
        <div key={plan.id} className="flex items-center gap-3 rounded-lg border border-transparent">
          <input
            type="checkbox"
            checked={selected.has(plan.id)}
            onChange={() => toggle(plan.id)}
            className="h-4 w-4 flex-shrink-0 cursor-pointer rounded border-slate-300 accent-primary"
            aria-label={`Select plan ${plan.title}`}
          />
          <Link href={`/plan/${plan.id}`} className="min-w-0 flex-1">
            <Card className={`cursor-pointer border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50 ${plan.id === currentPlan?.id ? "ring-1 ring-sky-200" : ""}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-slate-900">{plan.title}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(plan)}`}>
                        {progressLabel(plan)}
                      </span>
                      {plan.id === currentPlan?.id && (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">
                      {plan.profile.weeksDuration} weeks | {plan.profile.daysPerWeek} days/week
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Start {plan.startDateLabel} | {plan.isBeforeStart ? "starts soon" : `Day ${plan.currentPlanDay} of ${plan.totalPlanDays}`}
                    </p>
                    {plan.isUserCompleted && plan.completedAtLabel && (
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        Marked complete {plan.completedAtLabel}
                      </p>
                    )}
                  </div>
                  <p className="whitespace-nowrap text-xs text-slate-400">Created {plan.createdAtLabel}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      ))}
    </div>
  );
}
