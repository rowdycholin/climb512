import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { findOwnedPlanWithLogs } from "@/lib/plan-access";
import { getPlanCalendarStatus } from "@/lib/plan-calendar";
import { parseProfileSnapshot } from "@/lib/plan-snapshot";
import AppHeader from "@/components/AppHeader";
import PlanPageShell from "@/components/PlanPageShell";

export default async function PlanPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const plan = await findOwnedPlanWithLogs(params.id, session.userId);
  if (!plan) notFound();

  const profile = parseProfileSnapshot(plan.currentVersion.profileSnapshot);
  const weeks = plan.planView.weeks;

  const calendarStatus = getPlanCalendarStatus({
    startDate: plan.startDate,
    totalWeeks: weeks.length,
  });
  const completedAtLabel = plan.completedAt
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(plan.completedAt)
    : null;
  const currentWeekIndex = Math.max(0, Math.min(calendarStatus.currentWeekIndex, weeks.length - 1));
  const currentDayIndex = calendarStatus.currentDayIndex;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-50">
      <AppHeader
        eyebrow="Plan"
        title="Climb512"
        subtitle={`${profile.currentGrade} to ${profile.targetGrade} | ${profile.weeksDuration} weeks`}
      />

      <main className="mx-auto max-w-3xl p-4 pb-12">
        <PlanPageShell
          planId={plan.id}
          weeks={weeks}
          initialWeekIndex={currentWeekIndex}
          initialDayIndex={currentDayIndex}
          summary={{
            currentGrade: profile.currentGrade,
            targetGrade: profile.targetGrade,
            weeksDuration: profile.weeksDuration,
            goals: profile.goals,
            daysPerWeek: profile.daysPerWeek,
            age: profile.age,
            equipment: profile.equipment,
            calendar: {
              ...calendarStatus,
              isComplete: Boolean(plan.completedAt) || calendarStatus.isComplete,
            },
            completion: {
              isUserCompleted: Boolean(plan.completedAt),
              completedAtLabel,
              reason: plan.completionReason,
              notes: plan.completionNotes,
            },
            version: {
              changeType: plan.currentVersion.changeType,
              changeSummary: plan.currentVersion.changeSummary,
              effectiveFromDay: plan.currentVersion.effectiveFromDay,
            },
          }}
        />
      </main>
    </div>
  );
}
