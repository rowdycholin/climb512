import type { PlanSnapshot } from "./plan-snapshot";

export const PLAN_GENERATION_STATUSES = ["pending", "generating", "ready", "failed"] as const;

export type PlanGenerationStatus = (typeof PLAN_GENERATION_STATUSES)[number];

export function isPlanGenerationStatus(value: string): value is PlanGenerationStatus {
  return PLAN_GENERATION_STATUSES.includes(value as PlanGenerationStatus);
}

export function countGeneratedWeeks(snapshot: PlanSnapshot | null | undefined) {
  return snapshot?.weeks?.length ?? 0;
}

export function getPlanGenerationProgress(input: {
  status: string;
  generatedWeeks: number;
  totalWeeks: number;
  error?: string | null;
}) {
  const status = isPlanGenerationStatus(input.status) ? input.status : "ready";
  const totalWeeks = Math.max(0, input.totalWeeks);
  const generatedWeeks = Math.max(0, Math.min(input.generatedWeeks, totalWeeks));
  const nextWeekNum = totalWeeks > generatedWeeks ? generatedWeeks + 1 : null;
  const percent = totalWeeks > 0 ? Math.round((generatedWeeks / totalWeeks) * 100) : 100;

  return {
    status,
    generatedWeeks,
    totalWeeks,
    missingWeeks: Math.max(0, totalWeeks - generatedWeeks),
    nextWeekNum,
    percent,
    isGenerating: status === "pending" || status === "generating",
    isFailed: status === "failed",
    isReady: status === "ready",
    error: input.error ?? null,
  };
}

export function getNextJobStatusAfterWeek(input: { nextWeekNum: number; totalWeeks: number }) {
  return input.nextWeekNum >= input.totalWeeks ? "ready" : "generating";
}
