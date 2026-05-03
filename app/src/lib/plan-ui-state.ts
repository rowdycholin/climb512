import { z } from "zod";

export const planUiStateSchema = z.object({
  planSummaryOpen: z.boolean().optional(),
  coachGuidanceOpen: z.boolean().optional(),
  weekSummaryOpen: z.boolean().optional(),
});

export const planUiStateKeySchema = planUiStateSchema.keyof();

export type PlanUiState = z.infer<typeof planUiStateSchema>;
export type PlanUiStateKey = z.infer<typeof planUiStateKeySchema>;

export function parsePlanUiState(raw: unknown): PlanUiState {
  const parsed = planUiStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}
