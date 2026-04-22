import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { logout } from "@/app/actions";
import DashboardClient from "@/components/DashboardClient";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const plans = await prisma.trainingPlan.findMany({
    where: { profile: { userId: session.userId } },
    include: { profile: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-50 p-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
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

        {plans.length > 0 && <DashboardClient plans={plans} />}

        {plans.length === 0 && (
          <Card className="bg-white border-slate-200 text-center shadow-sm">
            <CardContent className="py-12">
              <p className="text-slate-500">No plans yet. Create your first training plan above.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
