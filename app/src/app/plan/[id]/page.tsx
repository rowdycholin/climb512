import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { findOwnedPlanWithLogs } from "@/lib/plan-access";
import { parseProfileSnapshot } from "@/lib/plan-snapshot";
import PlanWorkspace from "@/components/PlanWorkspace";
import { logout } from "@/app/actions";
import { Button } from "@/components/ui/button";

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
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧗</span>
          <div>
            <h1 className="leading-tight font-bold text-slate-800">Climb512</h1>
            <p className="text-xs text-slate-500">
              {profile.currentGrade} → {profile.targetGrade} · {profile.weeksDuration} weeks
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href="/onboarding">
            <Button variant="outline" size="sm">New Plan</Button>
          </a>
          <form action={logout}>
            <Button variant="ghost" size="sm" type="submit">Logout</Button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-4 pb-12">
        <div className="mt-4 mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-slate-800">Your Plan Summary</h2>
          <div className="flex flex-wrap gap-3 text-sm text-slate-600">
            <span>Goals: {profile.goals.join(", ")}</span>
            <span>·</span>
            <span>{profile.daysPerWeek} days/week</span>
            <span>·</span>
            <span>Age {profile.age}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {profile.equipment.map((item) => (
              <span
                key={item}
                className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <PlanWorkspace
          planId={plan.id}
          weeks={weeks}
          initialWeekIndex={currentWeekIndex}
          initialDayIndex={currentDayIndex}
        />
      </main>
    </div>
  );
}
