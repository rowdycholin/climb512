import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { parseProfileSnapshot } from "@/lib/plan-snapshot";
import AppHeader from "@/components/AppHeader";
import DashboardClient from "@/components/DashboardClient";
import { Card, CardContent } from "@/components/ui/card";

const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC" });

export default async function DashboardPage() {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const plans = await prisma.plan.findMany({
    where: { userId: session.userId },
    include: { currentVersion: true },
    orderBy: { createdAt: "desc" },
  });

  const planCards = plans
    .filter((plan) => plan.currentVersion)
    .map((plan) => {
      const profile = parseProfileSnapshot(plan.currentVersion!.profileSnapshot);
      return {
        id: plan.id,
        title: plan.title ?? `${profile.currentGrade} to ${profile.targetGrade}`,
        createdAt: plan.createdAt,
        createdAtLabel: dateFormatter.format(plan.createdAt),
        profile: {
          currentGrade: profile.currentGrade,
          targetGrade: profile.targetGrade,
          weeksDuration: profile.weeksDuration,
          daysPerWeek: profile.daysPerWeek,
        },
      };
    });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-50">
      <AppHeader eyebrow="Dashboard" title="Climb512" subtitle={`Welcome back, ${session.displayName || session.loginId}`} />

      <main className="mx-auto max-w-2xl p-4 py-8">
        <section className="mb-8 overflow-hidden rounded-[1.6rem] border border-white/70 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_32%),linear-gradient(145deg,_rgba(255,255,255,0.98),_rgba(240,249,255,0.92)_48%,_rgba(255,251,235,0.92))] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700/70">Training Plans</p>
              <h2 className="mt-1 text-3xl font-semibold text-slate-950">Your climbing workspace</h2>
              <p className="mt-2 max-w-lg text-sm text-slate-600">
                Review past cycles, open the current block, or start a fresh training plan.
              </p>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-white/80 px-4 py-3 text-right shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Library</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{planCards.length}</p>
              <p className="text-sm text-slate-500">{planCards.length === 1 ? "saved plan" : "saved plans"}</p>
            </div>
          </div>
        </section>

        {planCards.length > 0 && <DashboardClient plans={planCards} />}

        {planCards.length === 0 && (
          <Card className="border-slate-200 bg-white text-center shadow-sm">
            <CardContent className="py-12">
              <p className="text-slate-500">No plans yet. Use the menu to start a guided chat or manual setup.</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
