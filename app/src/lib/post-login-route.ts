import { prisma } from "./prisma";

export interface PostLoginPlanState {
  hasPlans: boolean;
  activePlanId: string | null;
}

export function resolvePostLoginPath(state: PostLoginPlanState) {
  if (state.activePlanId) return `/plan/${state.activePlanId}`;
  if (state.hasPlans) return "/dashboard";
  return "/intake";
}

export async function getPostLoginPath(userId: string) {
  const [activePlan, planCount] = await Promise.all([
    prisma.plan.findFirst({
      where: {
        userId,
        currentVersionId: { not: null },
      },
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" },
      ],
      select: { id: true },
    }),
    prisma.plan.count({ where: { userId } }),
  ]);

  return resolvePostLoginPath({
    hasPlans: planCount > 0,
    activePlanId: activePlan?.id ?? null,
  });
}
