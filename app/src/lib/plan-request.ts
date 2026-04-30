import { z } from "zod";
import type { PlanInput } from "./plan-types";

export const goalTypeSchema = z.enum(["event", "ongoing", "strength", "skill"]);

export const planRequestSchema = z.object({
  sport: z.string().trim().min(1),
  disciplines: z.array(z.string().trim().min(1)).default([]),
  goalType: goalTypeSchema.default("ongoing"),
  goalDescription: z.string().trim().min(1),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  blockLengthWeeks: z.coerce.number().int().min(1).max(52),
  daysPerWeek: z.coerce.number().int().min(1).max(7),
  currentLevel: z.string().trim().min(1).optional(),
  targetLevel: z.string().trim().min(1).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  equipment: z.array(z.string().trim().min(1)).default([]),
  trainingFocus: z.array(z.string().trim().min(1)).default([]),
  planStructureNotes: z.string().trim().min(1).max(2000).optional(),
  constraints: z
    .object({
      injuries: z.array(z.string().trim().min(1)).default([]),
      limitations: z.array(z.string().trim().min(1)).default([]),
      avoidExercises: z.array(z.string().trim().min(1)).default([]),
    })
    .default({ injuries: [], limitations: [], avoidExercises: [] }),
  strengthTraining: z
    .object({
      include: z.boolean().default(false),
      experienceLevel: z.string().trim().min(1).optional(),
      focusAreas: z.array(z.string().trim().min(1)).default([]),
    })
    .default({ include: false, focusAreas: [] }),
});

export const partialPlanRequestSchema = planRequestSchema.partial().extend({
  constraints: planRequestSchema.shape.constraints.unwrap().partial().optional(),
  strengthTraining: planRequestSchema.shape.strengthTraining.unwrap().partial().optional(),
});

export type GoalType = z.infer<typeof goalTypeSchema>;
export type PlanRequest = z.infer<typeof planRequestSchema>;
export type PartialPlanRequest = z.infer<typeof partialPlanRequestSchema>;

function firstDiscipline(request: PlanRequest) {
  return request.disciplines[0] || "bouldering";
}

function describeGoal(request: PlanRequest) {
  const parts = [
    request.goalDescription,
    request.goalType !== "ongoing" ? `Goal type: ${request.goalType}` : null,
    request.targetDate ? `Target date: ${request.targetDate}` : null,
    request.trainingFocus.length ? `Focus: ${request.trainingFocus.join(", ")}` : null,
    request.planStructureNotes ? `Plan structure: ${request.planStructureNotes}` : null,
    request.strengthTraining.include
      ? `Include strength training${request.strengthTraining.focusAreas.length ? ` for ${request.strengthTraining.focusAreas.join(", ")}` : ""}`
      : null,
    request.constraints.injuries.length ? `Injuries: ${request.constraints.injuries.join(", ")}` : null,
    request.constraints.limitations.length ? `Limitations: ${request.constraints.limitations.join(", ")}` : null,
    request.constraints.avoidExercises.length ? `Avoid: ${request.constraints.avoidExercises.join(", ")}` : null,
  ].filter(Boolean);

  return parts.join(" | ");
}

export function planRequestToLegacyPlanInput(request: PlanRequest, age: number): PlanInput {
  return {
    goals: [describeGoal(request)],
    currentGrade: request.currentLevel || "general fitness",
    targetGrade: request.targetLevel || request.targetDate || "improved fitness",
    age,
    weeksDuration: request.blockLengthWeeks,
    daysPerWeek: request.daysPerWeek,
    equipment: request.equipment,
    discipline: firstDiscipline(request),
  };
}
