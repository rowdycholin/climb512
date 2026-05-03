import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AppHeader from "@/components/AppHeader";
import PlanIntakeChat from "@/components/PlanIntakeChat";
import { PageIntro, PageShell } from "@/components/ui/app-shell";

export default async function IntakePage() {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { gender: true },
  });
  if (!user) redirect("/login");

  const coachName = user.gender === "female" ? "Alix" : "Alex";

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        eyebrow="Plan Intake"
        title="Climb512"
        subtitle={`${coachName} is your personal training coach. Tell me what you are training for, and we will shape a plan around your goals.`}
      />

      <PageShell maxWidth="lg">
        <PageIntro
          eyebrow="Guided Setup"
          title="Build a plan through conversation"
          description="Answer a few focused questions, then create a plan when the chat has what it needs."
        />

        <PlanIntakeChat coachName={coachName} />
      </PageShell>
    </div>
  );
}
