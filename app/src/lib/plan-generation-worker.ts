import { prisma } from "./prisma";
import { generateAdjustedWeekFromIntent, generateNextWeekFromPlanContext } from "./ai-plan-generator";
import { composePlanSnapshotFromGeneratedWeeks, getNextJobStatusAfterWeek } from "./plan-generation-state";
import { buildPlanGuidance, parseProfileSnapshot, toStoredJson, type PlanSnapshot, type ProfileSnapshot, type WeekSnapshot } from "./plan-snapshot";
import { adjustmentIntentSchema } from "./plan-adjustment-chat";
import { buildPlanSnapshot } from "./plan-snapshot";
import type { Prisma } from "@prisma/client";
import type { WeekData } from "./plan-types";

const DEFAULT_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

interface ClaimedGenerationJob {
  id: string;
  planId: string;
  userId: string;
  jobType: string;
  baseVersionId: string | null;
  status: string;
  totalWeeks: number;
  nextWeekNum: number;
  repairNotes: string | null;
  profileSnapshot: unknown;
  changeMetadata: unknown;
}

export interface PlanGenerationWorkerOptions {
  lockTimeoutMs?: number;
  username?: string;
}

function toWeekSnapshot(week: WeekData) {
  const [weekSnapshot] = buildPlanSnapshot([week]).weeks;
  return weekSnapshot;
}

function parseWeekSnapshot(raw: unknown): WeekSnapshot {
  return raw as WeekSnapshot;
}

function parsePlanSnapshot(raw: unknown): PlanSnapshot {
  return raw as PlanSnapshot;
}

function parseAdjustmentJobMetadata(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Adjustment generation job is missing change metadata");
  }

  const metadata = raw as {
    adjustmentIntent?: unknown;
    revisedPlanSnapshot?: unknown;
    proposalSummary?: unknown;
    proposalChanges?: unknown;
    effectiveFromPlanDay?: unknown;
    affectedDays?: unknown;
    richChanges?: unknown;
  };

  const adjustmentIntent = metadata.adjustmentIntent
    ? adjustmentIntentSchema.parse(metadata.adjustmentIntent)
    : null;
  if (!metadata.revisedPlanSnapshot && !adjustmentIntent) {
    throw new Error("Adjustment generation job is missing revisedPlanSnapshot or adjustmentIntent");
  }

  return {
    adjustmentIntent,
    revisedPlanSnapshot: metadata.revisedPlanSnapshot ? parsePlanSnapshot(metadata.revisedPlanSnapshot) : null,
    proposalSummary: typeof metadata.proposalSummary === "string" ? metadata.proposalSummary : "AI plan adjustment",
    proposalChanges: Array.isArray(metadata.proposalChanges)
      ? metadata.proposalChanges.filter((item): item is string => typeof item === "string")
      : [],
    effectiveFromPlanDay: typeof metadata.effectiveFromPlanDay === "number" ? metadata.effectiveFromPlanDay : null,
    affectedDays: Array.isArray(metadata.affectedDays) ? metadata.affectedDays : [],
    richChanges: metadata.richChanges ?? null,
  };
}

function mergeGeneratedWeeksIntoSnapshot(baseSnapshot: PlanSnapshot, generatedWeeks: WeekSnapshot[]): PlanSnapshot {
  const byWeek = new Map(generatedWeeks.map((week) => [week.weekNum, week]));
  return {
    ...baseSnapshot,
    weeks: baseSnapshot.weeks.map((week) => byWeek.get(week.weekNum) ?? week),
  };
}

function protectWeekAgainstIntent(params: {
  originalWeek: WeekSnapshot;
  adjustedWeek: WeekSnapshot;
  metadata: ReturnType<typeof parseAdjustmentJobMetadata>;
}) {
  if (!params.metadata.adjustmentIntent) return params.adjustedWeek;

  const changedDays = new Set(
    params.metadata.adjustmentIntent.changedDays
      .filter((day) => day.weekNum === params.originalWeek.weekNum)
      .map((day) => day.dayNum),
  );
  const effectiveFrom = params.metadata.adjustmentIntent.effectiveFromPlanDay;

  return {
    ...params.adjustedWeek,
    key: params.originalWeek.key,
    weekNum: params.originalWeek.weekNum,
    days: params.originalWeek.days.map((originalDay) => {
      const planDay = (params.originalWeek.weekNum - 1) * 7 + originalDay.dayNum;
      if (planDay < effectiveFrom || !changedDays.has(originalDay.dayNum)) return originalDay;
      const adjustedDay = params.adjustedWeek.days.find((day) => day.dayNum === originalDay.dayNum);
      return adjustedDay ? { ...adjustedDay, key: originalDay.key, dayName: originalDay.dayName, dayNum: originalDay.dayNum } : originalDay;
    }),
  };
}

function withIntentWeekSummary(params: {
  week: WeekSnapshot;
  metadata: ReturnType<typeof parseAdjustmentJobMetadata>;
}) {
  const intent = params.metadata.adjustmentIntent;
  if (!intent) return params.week;

  const weekChanged = intent.changedDays.some((day) => day.weekNum === params.week.weekNum);
  if (!weekChanged) return params.week;

  const prescriptionText = intent.prescriptionChanges.slice(0, 2).join("; ");
  const coachingText = intent.coachingChanges.slice(0, 1).join("; ");
  const adjustmentText = [prescriptionText, coachingText].filter(Boolean).join("; ");
  if (!adjustmentText) return params.week;

  const summary = params.week.summary?.trim()
    ? `${params.week.summary.trim()} Adjusted: ${adjustmentText}.`
    : `Adjusted: ${adjustmentText}.`;

  return {
    ...params.week,
    summary: summary.slice(0, 220),
    progressionNote: params.week.progressionNote?.trim()
      ? params.week.progressionNote
      : `This week reflects the approved adjustment: ${adjustmentText}.`.slice(0, 220),
  };
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
      jobType: true,
      baseVersionId: true,
      status: true,
      totalWeeks: true,
      nextWeekNum: true,
      repairNotes: true,
      profileSnapshot: true,
      changeMetadata: true,
    },
  });

  if (!candidate) return null;

  console.log(
    `[plan-worker] claiming job=${candidate.id} type=${candidate.jobType} plan=${candidate.planId} user=${candidate.userId} status=${candidate.status} nextWeek=${candidate.nextWeekNum}/${candidate.totalWeeks}`,
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
  baseVersionId?: string | null;
  week: WeekData;
}) {
  const { job, profileSnapshot, baseVersionId, week } = params;
  const weekSnapshot = toWeekSnapshot(week);
  const nextWeekNum = week.weekNum + 1;
  const nextStatus = getNextJobStatusAfterWeek({ nextWeekNum: week.weekNum, totalWeeks: job.totalWeeks });

  let savedGeneratedWeeks = 0;

  await prisma.$transaction(async (tx) => {
    await tx.planGenerationWeek.upsert({
      where: {
        jobId_weekNum: {
          jobId: job.id,
          weekNum: week.weekNum,
        },
      },
      create: {
        jobId: job.id,
        planId: job.planId,
        userId: job.userId,
        weekNum: week.weekNum,
        status: "ready",
        weekSnapshot: toStoredJson(weekSnapshot),
      },
      update: {
        status: "ready",
        weekSnapshot: toStoredJson(weekSnapshot),
      },
    });

    const generatedRows = await tx.planGenerationWeek.findMany({
      where: { jobId: job.id },
      orderBy: { weekNum: "asc" },
    });
    const generatedWeeks = generatedRows.length;
    savedGeneratedWeeks = generatedWeeks;
    let generatedSnapshot = composePlanSnapshotFromGeneratedWeeks(
      generatedRows.map((row) => parseWeekSnapshot(row.weekSnapshot)),
    );

    let finalVersionId: string | undefined;
    if (nextStatus === "ready") {
      generatedSnapshot = {
        ...generatedSnapshot,
        planGuidance: buildPlanGuidance(profileSnapshot, generatedSnapshot.weeks),
      };
      const latest = await tx.planVersion.findFirst({
        where: { planId: job.planId },
        orderBy: { versionNum: "desc" },
        select: { versionNum: true },
      });

      const version = await tx.planVersion.create({
        data: {
          planId: job.planId,
          versionNum: (latest?.versionNum ?? 0) + 1,
          basedOnVersionId: baseVersionId ?? null,
          changeType: "generated",
          changeSummary: "Initial AI-generated plan",
          profileSnapshot: toStoredJson(profileSnapshot),
          planSnapshot: toStoredJson(generatedSnapshot),
        },
      });
      finalVersionId = version.id;
    }

    await tx.plan.update({
      where: { id: job.planId },
      data: {
        ...(finalVersionId ? { currentVersionId: finalVersionId } : {}),
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
    `[plan-worker] saved week plan=${job.planId} job=${job.id} week=${week.weekNum}/${job.totalWeeks} generatedWeeks=${savedGeneratedWeeks} nextWeek=${nextWeekNum} nextStatus=${nextStatus}`,
  );
}

async function saveAdjustedWeek(params: {
  job: ClaimedGenerationJob;
  profileSnapshot: ProfileSnapshot;
  baseSnapshot: PlanSnapshot;
  week: WeekSnapshot;
  metadata: ReturnType<typeof parseAdjustmentJobMetadata>;
}) {
  const { job, profileSnapshot, baseSnapshot, week, metadata } = params;
  const nextWeekNum = week.weekNum + 1;
  const nextStatus = getNextJobStatusAfterWeek({ nextWeekNum: week.weekNum, totalWeeks: job.totalWeeks });

  let savedGeneratedWeeks = 0;

  await prisma.$transaction(async (tx) => {
    await tx.planGenerationWeek.upsert({
      where: {
        jobId_weekNum: {
          jobId: job.id,
          weekNum: week.weekNum,
        },
      },
      create: {
        jobId: job.id,
        planId: job.planId,
        userId: job.userId,
        weekNum: week.weekNum,
        status: "ready",
        weekSnapshot: toStoredJson(week),
      },
      update: {
        status: "ready",
        weekSnapshot: toStoredJson(week),
      },
    });

    const generatedRows = await tx.planGenerationWeek.findMany({
      where: { jobId: job.id },
      orderBy: { weekNum: "asc" },
    });
    const adjustedWeeks = generatedRows.map((row) => parseWeekSnapshot(row.weekSnapshot));
    savedGeneratedWeeks = adjustedWeeks.length;

    let finalVersionId: string | undefined;
    if (nextStatus === "ready") {
      const adjustedSnapshot = mergeGeneratedWeeksIntoSnapshot(baseSnapshot, adjustedWeeks);
      adjustedSnapshot.planGuidance = metadata.revisedPlanSnapshot?.planGuidance
        ?? buildPlanGuidance(profileSnapshot, adjustedSnapshot.weeks);
      const latest = await tx.planVersion.findFirst({
        where: { planId: job.planId },
        orderBy: { versionNum: "desc" },
        select: { versionNum: true },
      });

      const version = await tx.planVersion.create({
        data: {
          planId: job.planId,
          versionNum: (latest?.versionNum ?? 0) + 1,
          basedOnVersionId: job.baseVersionId,
          changeType: "ai_chat_adjustment",
          changeSummary: metadata.proposalSummary,
          effectiveFromWeek: metadata.effectiveFromPlanDay ? Math.ceil(metadata.effectiveFromPlanDay / 7) : null,
          effectiveFromDay: metadata.effectiveFromPlanDay,
          changeMetadata: toStoredJson({
            type: "ai_chat_adjustment",
            summary: metadata.proposalSummary,
            changes: metadata.proposalChanges,
            affectedDays: metadata.affectedDays,
            richChanges: metadata.richChanges,
            generatedSerially: true,
          }),
          profileSnapshot: toStoredJson(profileSnapshot),
          planSnapshot: toStoredJson(adjustedSnapshot),
        },
      });
      finalVersionId = version.id;
    }

    await tx.plan.update({
      where: { id: job.planId },
      data: {
        ...(finalVersionId ? { currentVersionId: finalVersionId } : {}),
        generationStatus: nextStatus,
        generationError: null,
        generatedWeeks: finalVersionId ? baseSnapshot.weeks.length : savedGeneratedWeeks,
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
    `[plan-worker] saved adjusted week plan=${job.planId} job=${job.id} week=${week.weekNum}/${job.totalWeeks} generatedWeeks=${savedGeneratedWeeks} nextWeek=${nextWeekNum} nextStatus=${nextStatus}`,
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
        generationJobs: {
          where: { id: job.id },
          include: {
            weeks: {
              orderBy: { weekNum: "asc" },
            },
          },
          take: 1,
        },
      },
    });

    if (!plan) {
      throw new Error(`Plan ${job.planId} was not found`);
    }

    const profileSnapshot = parseProfileSnapshot(job.profileSnapshot);

    if (job.jobType === "adjustment") {
      const metadata = parseAdjustmentJobMetadata(job.changeMetadata);
      const baseVersion = job.baseVersionId
        ? await prisma.planVersion.findFirst({
            where: {
              id: job.baseVersionId,
              planId: job.planId,
            },
          })
        : plan.currentVersion;
      if (!baseVersion) {
        throw new Error(`Adjustment job ${job.id} is missing base version ${job.baseVersionId ?? "current"}`);
      }

      const baseSnapshot = parsePlanSnapshot(baseVersion.planSnapshot);
      const previousAdjustedWeeks = (plan.generationJobs[0]?.weeks ?? [])
        .map((row) => parseWeekSnapshot(row.weekSnapshot))
        .filter((week) => week.weekNum < job.nextWeekNum);
      const originalWeek = baseSnapshot.weeks.find((week) => week.weekNum === job.nextWeekNum);
      if (!originalWeek) {
        throw new Error(`Adjustment job ${job.id} is missing original week ${job.nextWeekNum}`);
      }
      const generatedAdjustedWeek = metadata.adjustmentIntent
        ? toWeekSnapshot(await generateAdjustedWeekFromIntent({
            originalWeek,
            previousAdjustedWeeks,
            planGuidance: baseSnapshot.planGuidance,
            adjustmentIntent: metadata.adjustmentIntent,
            athleteAge: plan.user.age,
            repairFeedback: job.repairNotes,
            username: options.username ?? plan.user.userId,
          }))
        : metadata.revisedPlanSnapshot?.weeks.find((week) => week.weekNum === job.nextWeekNum);
      if (!generatedAdjustedWeek) {
        throw new Error(`Adjustment job ${job.id} is missing adjusted week ${job.nextWeekNum}`);
      }
      const adjustedWeek = withIntentWeekSummary({
        week: protectWeekAgainstIntent({
          originalWeek,
          adjustedWeek: generatedAdjustedWeek,
          metadata,
        }),
        metadata,
      });

      console.log(
        `[plan-worker] applying adjusted week plan=${job.planId} job=${job.id} week=${job.nextWeekNum}/${job.totalWeeks} mode=${metadata.adjustmentIntent ? "intent" : "snapshot"} user=${plan.user.userId}`,
      );

      await saveAdjustedWeek({
        job,
        profileSnapshot,
        baseSnapshot,
        week: adjustedWeek,
        metadata,
      });

      return {
        status: "generated" as const,
        jobId: job.id,
        planId: job.planId,
        weekNum: adjustedWeek.weekNum,
        nextWeekNum: adjustedWeek.weekNum + 1,
        totalWeeks: job.totalWeeks,
      };
    }

    const planRequest = profileSnapshot.planRequest;
    if (!planRequest) {
      throw new Error(`Plan ${job.planId} is missing profileSnapshot.planRequest`);
    }

    const existingWeeks = (plan.generationJobs[0]?.weeks ?? [])
      .map((row) => parseWeekSnapshot(row.weekSnapshot))
      .filter((week) => week.weekNum < job.nextWeekNum);
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
      baseVersionId: plan.currentVersion?.id ?? null,
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
