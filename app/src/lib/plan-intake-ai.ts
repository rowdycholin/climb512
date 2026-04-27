import { z } from "zod";
import {
  continueIntakeDraft,
  partialIntakeDraftSchema,
  type IntakeMessage,
  type IntakeResponse,
  type PartialIntakeDraft,
} from "./intake";
import { planRequestSchema } from "./plan-request";

const basePlanIntakeAiResponseSchema = z.object({
  status: z.enum(["needs_more_info", "ready"]),
  message: z.string().trim().min(1).max(1200),
  planRequestDraft: partialIntakeDraftSchema,
});

export const planIntakeAiResponseSchema = basePlanIntakeAiResponseSchema.superRefine((value, context) => {
  if (value.status !== "ready") return;

  const parsedDraft = planRequestSchema.safeParse(value.planRequestDraft);
  if (!parsedDraft.success) {
    context.addIssue({
      code: "custom",
      message: "A ready intake response must include a complete valid PlanRequest draft.",
      path: ["planRequestDraft"],
    });
  }
});

export type PlanIntakeAiResponse = z.infer<typeof planIntakeAiResponseSchema>;

export interface PlanIntakeAiInput {
  draft: PartialIntakeDraft;
  userMessage: string;
  messages: IntakeMessage[];
}

function toIntakeResponse(response: PlanIntakeAiResponse): IntakeResponse {
  return {
    draft: response.planRequestDraft,
    ready: response.status === "ready",
    assistantMessage: response.message,
  };
}

function validatePlanIntakeAiResponse(response: unknown) {
  return planIntakeAiResponseSchema.parse(response);
}

export function simulatePlanIntakeAiResponse(input: PlanIntakeAiInput): PlanIntakeAiResponse {
  const response = continueIntakeDraft({
    draft: input.draft,
    userMessage: input.userMessage,
  });

  return validatePlanIntakeAiResponse({
    status: response.ready ? "ready" : "needs_more_info",
    message: response.assistantMessage,
    planRequestDraft: response.draft,
  });
}

export function continuePlanIntakeWithAiContract(input: PlanIntakeAiInput): IntakeResponse {
  const response = simulatePlanIntakeAiResponse(input);
  return toIntakeResponse(response);
}

