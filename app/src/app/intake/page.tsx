import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AppHeader from "@/components/AppHeader";
import PlanIntakeChat from "@/components/PlanIntakeChat";

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
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-50">
      <AppHeader
        eyebrow="Plan Intake"
        title="Climb512"
        subtitle={`${coachName} is your personal training coach. Tell me what you are training for, and we will shape a plan around your goals.`}
      />

      <main className="mx-auto max-w-5xl p-4 py-8">
        <div className="mb-8 overflow-hidden rounded-[1.6rem] border border-white/70 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_32%),linear-gradient(145deg,_rgba(255,255,255,0.98),_rgba(240,249,255,0.92)_48%,_rgba(255,251,235,0.9))] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700/70">Guided Setup</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Build a plan through conversation</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Answer a few focused questions, then create a plan when the chat has what it needs.
          </p>
        </div>

        <PlanIntakeChat coachName={coachName} />
      </main>
    </div>
  );
}
