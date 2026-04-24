import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { parseProfileSnapshot } from "@/lib/plan-snapshot";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { logout } from "@/app/actions";
import DashboardClient from "@/components/DashboardClient";

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
        title: plan.title ?? `${profile.currentGrade} → ${profile.targetGrade}`,
        createdAt: plan.createdAt,
        profile: {
          currentGrade: profile.currentGrade,
          targetGrade: profile.targetGrade,
          weeksDuration: profile.weeksDuration,
          daysPerWeek: profile.daysPerWeek,
        },
      };
    });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-50 p-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🧗</span>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Climb512</h1>
              <p className="text-sm text-slate-500">Welcome, {session.username}</p>
            </div>
          </div>
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit">Logout</Button>
          </form>
        </div>

        <div className="mb-6">
          <a href="/onboarding">
            <Button size="lg" className="w-full">+ Create New Training Plan</Button>
          </a>
        </div>

        {planCards.length > 0 && <DashboardClient plans={planCards} />}

        {planCards.length === 0 && (
          <Card className="border-slate-200 bg-white text-center shadow-sm">
            <CardContent className="py-12">
              <p className="text-slate-500">No plans yet. Create your first training plan above.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
