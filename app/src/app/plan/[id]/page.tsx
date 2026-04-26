import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { findOwnedPlanWithLogs } from "@/lib/plan-access";
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

  const daysSinceStart = Math.floor((Date.now() - plan.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const currentWeekIndex = Math.max(0, Math.min(Math.floor(daysSinceStart / 7), weeks.length - 1));
  const currentDayIndex = ((daysSinceStart % 7) + 7) % 7;

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
          }}
        />
      </main>
    </div>
  );
}
