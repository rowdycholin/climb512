import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { findOwnedPlanWithUserLogs } from "@/lib/plan-access";
import PlanViewer from "@/components/PlanViewer";
import { logout } from "@/app/actions";
import { Button } from "@/components/ui/button";

export default async function PlanPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const plan = await findOwnedPlanWithUserLogs(params.id, session.userId);

  if (!plan) notFound();

  // Calculate which week/day we're currently on based on plan start date
  const daysSinceStart = Math.floor(
    (Date.now() - plan.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  const currentWeekIndex = Math.min(
    Math.floor(daysSinceStart / 7),
    plan.weeks.length - 1
  );
  const currentDayIndex = daysSinceStart % 7;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-50">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧗</span>
          <div>
            <h1 className="font-bold text-slate-800 leading-tight">Climb512</h1>
            <p className="text-xs text-slate-500">
              {plan.profile.currentGrade} → {plan.profile.targetGrade} · {plan.profile.weeksDuration} weeks
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

      <main className="max-w-3xl mx-auto p-4 pb-12">
        <div className="mb-6 mt-4 p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
          <h2 className="text-slate-800 font-semibold mb-2">Your Plan Summary</h2>
          <div className="flex flex-wrap gap-3 text-sm text-slate-600">
            <span>Goals: {plan.profile.goals.join(", ")}</span>
            <span>·</span>
            <span>{plan.profile.daysPerWeek} days/week</span>
            <span>·</span>
            <span>Age {plan.profile.age}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {plan.profile.equipment.map((e) => (
              <span key={e} className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-full text-xs text-slate-600">{e}</span>
            ))}
          </div>
        </div>

        <PlanViewer
          weeks={plan.weeks as Parameters<typeof PlanViewer>[0]["weeks"]}
          initialWeekIndex={currentWeekIndex}
          initialDayIndex={currentDayIndex}
        />
      </main>
    </div>
  );
}
