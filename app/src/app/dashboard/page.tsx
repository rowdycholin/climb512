import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getPlanCalendarStatus } from "@/lib/plan-calendar";
import { parsePlanSnapshot, parseProfileSnapshot } from "@/lib/plan-snapshot";
import AppHeader from "@/components/AppHeader";
import DashboardClient from "@/components/DashboardClient";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageShell, SectionPanel } from "@/components/ui/app-shell";

const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC" });
const completionDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export default async function DashboardPage() {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const plans = await prisma.plan.findMany({
    where: { userId: session.userId },
    include: {
      currentVersion: true,
      generationJobs: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const planCards = plans
    .filter((plan) => plan.currentVersion || plan.generationJobs[0])
    .map((plan) => {
      const profile = parseProfileSnapshot(plan.currentVersion?.profileSnapshot ?? plan.generationJobs[0]!.profileSnapshot);
      const snapshot = plan.currentVersion ? parsePlanSnapshot(plan.currentVersion.planSnapshot) : { weeks: [] };
      const calendar = getPlanCalendarStatus({
        startDate: plan.startDate,
        totalWeeks: snapshot.weeks.length || profile.weeksDuration,
      });
      return {
        id: plan.id,
        title: plan.title ?? `${profile.currentGrade} to ${profile.targetGrade}`,
        createdAt: plan.createdAt,
        createdAtLabel: dateFormatter.format(plan.createdAt),
        startDateLabel: calendar.startDateLabel,
        currentPlanDay: calendar.currentPlanDay,
        totalPlanDays: calendar.totalPlanDays,
        isComplete: Boolean(plan.completedAt) || calendar.isComplete,
        isUserCompleted: Boolean(plan.completedAt),
        completedAtLabel: plan.completedAt ? completionDateFormatter.format(plan.completedAt) : null,
        isBeforeStart: calendar.isBeforeStart,
        generationStatus: plan.generationStatus,
        today: (() => {
          if (!plan.currentVersion || calendar.isBeforeStart || calendar.isComplete || snapshot.weeks.length === 0) return null;
          const weekIndex = Math.min(snapshot.weeks.length - 1, Math.max(0, Math.floor((calendar.currentPlanDay - 1) / 7)));
          const week = snapshot.weeks[weekIndex];
          const dayIndex = Math.min(week.days.length - 1, Math.max(0, (calendar.currentPlanDay - 1) % 7));
          const day = week.days[dayIndex] ?? week.days.find((candidate) => !candidate.isRest) ?? null;
          if (!week || !day) return null;
          return {
            weekNum: week.weekNum,
            dayNum: day.dayNum,
            dayName: day.dayName,
            focus: day.focus,
            isRest: day.isRest,
            sessionCount: day.sessions.length,
          };
        })(),
        profile: {
          currentGrade: profile.currentGrade,
          targetGrade: profile.targetGrade,
          weeksDuration: profile.weeksDuration,
          daysPerWeek: profile.daysPerWeek,
        },
      };
    });
  const currentPlan =
    planCards.find((plan) => !plan.isComplete && !plan.isBeforeStart && plan.generationStatus === "ready") ??
    planCards.find((plan) => !plan.isComplete && plan.generationStatus === "ready") ??
    planCards.find((plan) => !plan.isComplete) ??
    null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader eyebrow="Dashboard" title="Climb512" subtitle={`Welcome back, ${session.displayName || session.loginId}`} />

      <PageShell maxWidth="lg">
        <section className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
          <SectionPanel className="overflow-hidden p-0" padded={false}>
            <div className="border-l-4 border-sky-600 px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">Home Base</p>
              <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold text-slate-950">Training Dashboard</h1>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    Continue your current block, check today&apos;s work, or start a new plan.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href="/intake" className={buttonVariants()}>
                    New AI Plan
                  </Link>
                  <Link href="/onboarding" className={buttonVariants({ variant: "outline" })}>
                    Manual Setup
                  </Link>
                </div>
              </div>
            </div>
          </SectionPanel>

          <SectionPanel>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Plan Library</p>
            <p className="mt-1 text-3xl font-semibold text-slate-950">{planCards.length}</p>
            <p className="text-sm text-slate-500">{planCards.length === 1 ? "saved plan" : "saved plans"}</p>
          </SectionPanel>
        </section>

        {planCards.length > 0 && <DashboardClient plans={planCards} currentPlanId={currentPlan?.id ?? null} />}

        {planCards.length === 0 && (
          <Card className="border-slate-200 bg-white text-center shadow-sm">
            <CardContent className="py-12">
              <p className="text-slate-500">No plans yet. Start with a guided AI plan or manual setup.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Link href="/intake" className={buttonVariants()}>
                  New AI Plan
                </Link>
                <Link href="/onboarding" className={buttonVariants({ variant: "outline" })}>
                  Manual Setup
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </PageShell>
    </div>
  );
}
