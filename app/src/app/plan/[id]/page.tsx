import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { findOwnedPlanWithLogs } from "@/lib/plan-access";
import { getPlanCalendarStatus } from "@/lib/plan-calendar";
import { countGeneratedWeeks, getPlanGenerationProgress } from "@/lib/plan-generation-state";
import { parseProfileSnapshot } from "@/lib/plan-snapshot";
import AppHeader from "@/components/AppHeader";
import PlanPageShell from "@/components/PlanPageShell";

function parseAdjustmentMetadata(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as {
    affectedDays?: unknown;
  };
  if (!Array.isArray(value.affectedDays)) return null;

  return {
    affectedDays: value.affectedDays
      .map((day) => {
        if (!day || typeof day !== "object") return null;
        const item = day as {
          weekNum?: unknown;
          dayNum?: unknown;
          planDay?: unknown;
          dayName?: unknown;
          summary?: unknown;
        };
        if (
          typeof item.weekNum !== "number" ||
          typeof item.dayNum !== "number" ||
          typeof item.planDay !== "number"
        ) {
          return null;
        }
        return {
          weekNum: item.weekNum,
          dayNum: item.dayNum,
          planDay: item.planDay,
          dayName: typeof item.dayName === "string" ? item.dayName : "",
          summary: typeof item.summary === "string" ? item.summary : "Adjusted",
        };
      })
      .filter((day): day is { weekNum: number; dayNum: number; planDay: number; dayName: string; summary: string } => Boolean(day)),
  };
}

function isUserFacingVersion(changeType: string) {
  return ![
    "worker_generation_started",
    "worker_generation",
  ].includes(changeType);
}

export default async function PlanPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const plan = await findOwnedPlanWithLogs(params.id, session.userId);
  if (!plan) notFound();

  const profile = parseProfileSnapshot(plan.currentVersion.profileSnapshot);
  const weeks = plan.planView.weeks;
  const totalWeeks = Math.max(profile.weeksDuration, weeks.length);
  const generatedWeeks = countGeneratedWeeks(plan.currentVersion.planSnapshot);
  const generation = getPlanGenerationProgress({
    status: plan.generationStatus,
    generatedWeeks: plan.generatedWeeks || generatedWeeks,
    totalWeeks,
    error: plan.generationError,
  });
  const latestGenerationJob = plan.generationJobs[0] ?? null;

  if (generation.isGenerating || generation.isFailed) {
    console.log(
      `[web] plan generation status plan=${plan.id} status=${generation.status} generatedWeeks=${generation.generatedWeeks}/${generation.totalWeeks} nextWeek=${generation.nextWeekNum ?? "none"} error=${generation.error ?? "none"}`,
    );
  }

  const calendarStatus = getPlanCalendarStatus({
    startDate: plan.startDate,
    totalWeeks,
  });
  const completedAtLabel = plan.completedAt
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(plan.completedAt)
    : null;
  const versionDateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  const currentWeekIndex = Math.max(0, Math.min(calendarStatus.currentWeekIndex, Math.max(totalWeeks - 1, 0)));
  const currentDayIndex = calendarStatus.currentDayIndex;
  const visibleVersions = plan.versions.filter(
    (version) => version.id === plan.currentVersion.id || isUserFacingVersion(version.changeType),
  );
  const displayVersionById = new Map(
    [...visibleVersions]
      .sort((a, b) => a.versionNum - b.versionNum)
      .map((version, index) => [version.id, index + 1]),
  );
  const currentDisplayVersionNum = displayVersionById.get(plan.currentVersion.id) ?? visibleVersions.length;

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
          totalWeeks={totalWeeks}
          initialWeekIndex={currentWeekIndex}
          initialDayIndex={currentDayIndex}
          summary={{
            currentGrade: profile.currentGrade,
            targetGrade: profile.targetGrade,
            weeksDuration: profile.weeksDuration,
            goals: profile.goals,
            sport: profile.planRequest?.sport ?? profile.discipline,
            disciplines: profile.planRequest?.disciplines ?? [profile.discipline],
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
              id: plan.currentVersion.id,
              versionNum: currentDisplayVersionNum,
              changeType: plan.currentVersion.changeType,
              changeSummary: plan.currentVersion.changeSummary,
              effectiveFromDay: plan.currentVersion.effectiveFromDay,
              changeMetadata: parseAdjustmentMetadata(plan.currentVersion.changeMetadata),
            },
            versions: visibleVersions
              .map((version) => ({
                id: version.id,
                versionNum: displayVersionById.get(version.id) ?? version.versionNum,
                rawVersionNum: version.versionNum,
                changeType: version.changeType,
                changeSummary: version.changeSummary,
                effectiveFromWeek: version.effectiveFromWeek,
                effectiveFromDay: version.effectiveFromDay,
                createdAtLabel: versionDateFormatter.format(version.createdAt),
                isCurrent: version.id === plan.currentVersion.id,
              })),
            generation,
            generationJob: latestGenerationJob
              ? {
                  failedWeekNum: latestGenerationJob.status === "failed" ? latestGenerationJob.nextWeekNum : null,
                  lastError: latestGenerationJob.lastError,
                  repairNotes: latestGenerationJob.repairNotes,
                }
              : null,
          }}
        />
      </main>
    </div>
  );
}
