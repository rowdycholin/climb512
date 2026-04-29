import { prisma } from "./prisma";
import { generateNextWeekFromPlanContext } from "./ai-plan-generator";
import { getNextJobStatusAfterWeek } from "./plan-generation-state";
import { parsePlanSnapshot, parseProfileSnapshot, toStoredJson, type PlanSnapshot, type ProfileSnapshot } from "./plan-snapshot";
import { buildPlanSnapshot } from "./plan-snapshot";
import type { Prisma } from "@prisma/client";
import type { WeekData } from "./plan-types";

const DEFAULT_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

interface ClaimedGenerationJob {
  id: string;
  planId: string;
  userId: string;
  status: string;
  totalWeeks: number;
  nextWeekNum: number;
  repairNotes: string | null;
}

export interface PlanGenerationWorkerOptions {
  lockTimeoutMs?: number;
  username?: string;
}

function appendGeneratedWeek(snapshot: PlanSnapshot, week: WeekData): PlanSnapshot {
  const [weekSnapshot] = buildPlanSnapshot([week]).weeks;
  const weeks = snapshot.weeks
    .filter((existing) => existing.weekNum !== week.weekNum)
    .concat(weekSnapshot)
    .sort((a, b) => a.weekNum - b.weekNum);

  return { weeks };
}

async function claimNextGenerationJob(lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS) {
  const staleBefore = new Date(Date.now() - lockTimeoutMs);

  const candidate = await prisma.planGenerationJob.findFirst({
    where: {
      status: { in: ["pending", "generating"] },
      OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      planId: true,
      userId: true,
      status: true,
      totalWeeks: true,
      nextWeekNum: true,
      repairNotes: true,
    },
  });

  if (!candidate) return null;

  console.log(
    `[plan-worker] claiming job=${candidate.id} plan=${candidate.planId} user=${candidate.userId} status=${candidate.status} nextWeek=${candidate.nextWeekNum}/${candidate.totalWeeks}`,
  );

  const claimed = await prisma.planGenerationJob.updateMany({
    where: {
      id: candidate.id,
      status: { in: ["pending", "generating"] },
      OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
    },
    data: {
      status: "generating",
      lockedAt: new Date(),
      lastError: null,
    },
  });

  if (claimed.count !== 1) {
    console.log(`[plan-worker] skipped claim job=${candidate.id} reason=already-claimed`);
    return null;
  }

  return candidate;
}

async function failGenerationJob(job: ClaimedGenerationJob, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const shortMessage = message.slice(0, 1000);

  console.error(`[plan-worker] marking failed job=${job.id} plan=${job.planId} week=${job.nextWeekNum}/${job.totalWeeks}: ${shortMessage}`);

  await prisma.$transaction([
    prisma.planGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        lastError: shortMessage,
        lockedAt: null,
      },
    }),
    prisma.plan.update({
      where: { id: job.planId },
      data: {
        generationStatus: "failed",
        generationError: shortMessage,
        updatedAt: new Date(),
      },
    }),
  ]);
}

async function saveGeneratedWeek(params: {
  job: ClaimedGenerationJob;
  profileSnapshot: ProfileSnapshot;
  currentSnapshot: PlanSnapshot;
  currentVersionId: string;
  week: WeekData;
}) {
  const { job, profileSnapshot, currentSnapshot, currentVersionId, week } = params;
  const nextSnapshot = appendGeneratedWeek(currentSnapshot, week);
  const nextWeekNum = week.weekNum + 1;
  const nextStatus = getNextJobStatusAfterWeek({ nextWeekNum: week.weekNum, totalWeeks: job.totalWeeks });
  const generatedWeeks = nextSnapshot.weeks.length;

  await prisma.$transaction(async (tx) => {
    const latest = await tx.planVersion.findFirst({
      where: { planId: job.planId },
      orderBy: { versionNum: "desc" },
      select: { versionNum: true },
    });

    const version = await tx.planVersion.create({
      data: {
        planId: job.planId,
        versionNum: (latest?.versionNum ?? 0) + 1,
        basedOnVersionId: currentVersionId,
        changeType: "worker_generation",
        changeSummary: `Generated week ${week.weekNum} of ${job.totalWeeks}`,
        effectiveFromWeek: week.weekNum,
        effectiveFromDay: (week.weekNum - 1) * 7 + 1,
        profileSnapshot: toStoredJson(profileSnapshot),
        planSnapshot: toStoredJson(nextSnapshot),
      },
    });

    await tx.plan.update({
      where: { id: job.planId },
      data: {
        currentVersionId: version.id,
        generationStatus: nextStatus,
        generationError: null,
        generatedWeeks,
        updatedAt: new Date(),
      },
    });

    await tx.planGenerationJob.update({
      where: { id: job.id },
      data: {
        status: nextStatus,
        nextWeekNum,
        lastError: null,
        lockedAt: null,
        repairNotes: nextStatus === "ready" ? null : job.repairNotes,
      },
    });
  });

  console.log(
    `[plan-worker] saved week plan=${job.planId} job=${job.id} week=${week.weekNum}/${job.totalWeeks} generatedWeeks=${generatedWeeks} nextWeek=${nextWeekNum} nextStatus=${nextStatus}`,
  );
}

export async function runOnePlanGenerationJob(options: PlanGenerationWorkerOptions = {}) {
  const job = await claimNextGenerationJob(options.lockTimeoutMs);
  if (!job) return { status: "idle" as const };

  try {
    const plan = await prisma.plan.findFirst({
      where: {
        id: job.planId,
        userId: job.userId,
      },
      include: {
        user: { select: { userId: true, age: true } },
        currentVersion: true,
      },
    });

    if (!plan?.currentVersion) {
      throw new Error(`Plan ${job.planId} does not have a current version`);
    }

    const profileSnapshot = parseProfileSnapshot(plan.currentVersion.profileSnapshot);
    const planRequest = profileSnapshot.planRequest;
    if (!planRequest) {
      throw new Error(`Plan ${job.planId} is missing profileSnapshot.planRequest`);
    }

    const currentSnapshot = parsePlanSnapshot(plan.currentVersion.planSnapshot);
    const existingWeeks = currentSnapshot.weeks.filter((week) => week.weekNum < job.nextWeekNum);
    console.log(
      `[plan-worker] generating plan=${job.planId} job=${job.id} week=${job.nextWeekNum}/${job.totalWeeks} priorWeeks=${existingWeeks.length} sport=${planRequest.sport} user=${plan.user.userId}`,
    );
    const week = await generateNextWeekFromPlanContext({
      request: planRequest,
      athleteAge: plan.user.age,
      weekNum: job.nextWeekNum,
      totalWeeks: job.totalWeeks,
      previousWeeks: existingWeeks,
      repairFeedback: job.repairNotes,
      username: options.username ?? plan.user.userId,
    });

    await saveGeneratedWeek({
      job,
      profileSnapshot,
      currentSnapshot,
      currentVersionId: plan.currentVersion.id,
      week,
    });

    return {
      status: "generated" as const,
      jobId: job.id,
      planId: job.planId,
      weekNum: week.weekNum,
      nextWeekNum: week.weekNum + 1,
      totalWeeks: job.totalWeeks,
    };
  } catch (error) {
    await failGenerationJob(job, error);
    return {
      status: "failed" as const,
      jobId: job.id,
      planId: job.planId,
      weekNum: job.nextWeekNum,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runPlanGenerationWorkerLoop(options: {
  pollIntervalMs?: number;
  lockTimeoutMs?: number;
  stepDelayMs?: number;
  stopAfterIdle?: boolean;
} = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? 5000;
  const stepDelayMs = options.stepDelayMs ?? 1500;

  for (;;) {
    const result = await runOnePlanGenerationJob({ lockTimeoutMs: options.lockTimeoutMs });

    if (result.status === "idle") {
      if (options.stopAfterIdle) return result;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      continue;
    }

    if (result.status === "failed") {
      console.error(`[plan-worker] failed plan=${result.planId} job=${result.jobId} week=${result.weekNum}: ${result.error}`);
    } else {
      console.log(`[plan-worker] generated plan=${result.planId} job=${result.jobId} week=${result.weekNum}/${result.totalWeeks}`);
      if (result.nextWeekNum <= result.totalWeeks && stepDelayMs > 0) {
        console.log(`[plan-worker] waiting ${stepDelayMs}ms before next week plan=${result.planId} job=${result.jobId}`);
        await new Promise((resolve) => setTimeout(resolve, stepDelayMs));
      }
    }
  }
}

export type PlanGenerationJobTransaction = Prisma.TransactionClient;
