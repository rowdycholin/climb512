import { prisma } from "./prisma";
import { getPlanCalendarStatus } from "./plan-calendar";
import { parsePlanSnapshot, parseProfileSnapshot } from "./plan-snapshot";

export interface PostLoginPlanState {
  hasPlans: boolean;
  activePlanId: string | null;
}

export function resolvePostLoginPath(state: PostLoginPlanState) {
  if (state.activePlanId) return `/plan/${state.activePlanId}`;
  if (state.hasPlans) return "/dashboard";
  return "/intake";
}

export function selectActivePlanId(plans: Array<{
  id: string;
  startDate: Date;
  completedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
  currentVersion: {
    profileSnapshot: unknown;
    planSnapshot: unknown;
  } | null;
}>, now = new Date()) {
  const activePlans = plans.filter((plan) => {
    if (!plan.currentVersion || plan.completedAt) return false;

    const profile = parseProfileSnapshot(plan.currentVersion.profileSnapshot);
    const snapshot = parsePlanSnapshot(plan.currentVersion.planSnapshot);
    const totalWeeks = snapshot.weeks.length || profile.weeksDuration;
    const calendar = getPlanCalendarStatus({
      startDate: plan.startDate,
      totalWeeks,
      now,
    });

    return !calendar.isBeforeStart && !calendar.isComplete;
  });

  activePlans.sort((a, b) => {
    const updatedDiff = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (updatedDiff !== 0) return updatedDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return activePlans[0]?.id ?? null;
}

export async function getPostLoginPath(userId: string) {
  const plans = await prisma.plan.findMany({
    where: { userId },
    include: { currentVersion: true },
  });

  return resolvePostLoginPath({
    hasPlans: plans.length > 0,
    activePlanId: selectActivePlanId(plans),
  });
}
