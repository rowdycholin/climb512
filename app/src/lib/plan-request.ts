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
  athleteNarrative: z.string().trim().min(1).max(2000).optional(),
  trainingHistory: z.string().trim().min(1).max(1000).optional(),
  recentTrainingLoad: z.string().trim().min(1).max(1000).optional(),
  sessionLengthPreference: z.string().trim().min(1).max(500).optional(),
  recoveryCapacity: z.string().trim().min(1).max(1000).optional(),
  motivationContext: z.string().trim().min(1).max(1000).optional(),
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

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((total, pattern) => total + (pattern.test(text) ? 1 : 0), 0);
}

function hasStrengthPrimarySignal(request: PlanRequest) {
  const text = [
    request.sport,
    request.goalDescription,
    request.planStructureNotes,
    request.athleteNarrative,
    request.motivationContext,
    ...request.trainingFocus,
    ...request.equipment,
    ...request.strengthTraining.focusAreas,
  ].filter(Boolean).join(" ");

  const runningScore = countMatches(text, [
    /\b(?:run(?:ning)?|runner|jog)\b/i,
    /\b(?:race|marathon|half marathon|trail race|road race|5k|10k(?!\s*steps))\b/i,
    /\b\d+(?:\.\d+)?\s*(?:mile|miles|km|kilometers?)(?!\s*(?:walk|steps))\b/i,
  ]);
  const strengthScore = countMatches(text, [
    /\b(?:strength training|strength and conditioning|weight training|weightlifting|weight lifting|lifting|conditioning)\b/i,
    /\b(?:functional strength|workout plan|work out plan|gym|planet fitness|barbell|dumbbell)\b/i,
    /\b(?:deadlift|squat|bench|press|pull-?up|carry|carrying|holding|hypertrophy|bullet proof body)\b/i,
  ]);
  return request.strengthTraining.include && strengthScore > runningScore;
}

function isConversationFillerNote(note: string) {
  return /^(?:right|correct|yes|yep|yeah|ok(?:ay)?|looks good|no[,.\s]*(?:that )?(?:covers it|that's it|i think that's it)|no[,.\s]*i think that's it|i already told you\b|as i said\b|like i said\b|you already have\b)/i.test(note.trim());
}

export function sanitizePlanStructureNotes(value?: string) {
  if (!value) return undefined;
  const notes = value
    .split(/\s*\|\s*/)
    .map((note) => note.trim().replace(/\s+/g, " "))
    .filter((note) => note && !isConversationFillerNote(note));
  return notes.length ? notes.join(" | ") : undefined;
}

function requestText(request: PlanRequest) {
  return [
    request.sport,
    ...request.disciplines,
    request.goalDescription,
    request.currentLevel,
    request.targetLevel,
    request.planStructureNotes,
    request.athleteNarrative,
    ...request.trainingFocus,
  ].filter(Boolean).join(" ");
}

function hasRouteClimbingSignal(request: PlanRequest) {
  const text = requestText(request);
  return /\b(?:lead|top\s*rope|toprope|sport\s*climb(?:ing)?|redpoint|route|5\.(?:[0-9]|1[0-5])(?:[abcd])?)\b/i.test(text);
}

function hasBoulderingGoalSignal(request: PlanRequest) {
  const text = [
    request.goalDescription,
    request.currentLevel,
    request.targetLevel,
    request.planStructureNotes,
    ...request.trainingFocus,
  ].filter(Boolean).join(" ");
  return /\b(?:boulder(?:ing)?|boulder\s*problem|problem|V(?:[0-9]|1[0-7]))\b/i.test(text);
}

export function normalizePlanRequest(request: PlanRequest): PlanRequest {
  const cleanedNotes = sanitizePlanStructureNotes(request.planStructureNotes);
  const baseRequest = {
    ...request,
    planStructureNotes: cleanedNotes,
  };

  if (baseRequest.sport === "running" && hasStrengthPrimarySignal(baseRequest)) {
    return {
      ...baseRequest,
      sport: "strength training",
      trainingFocus: Array.from(new Set([...baseRequest.trainingFocus, "strength"])),
    };
  }

  if (!/\bclimb/i.test(baseRequest.sport)) return baseRequest;
  if (!hasRouteClimbingSignal(baseRequest)) return baseRequest;

  const existing = baseRequest.disciplines.map((discipline) => discipline.trim()).filter(Boolean);
  const shouldKeepBouldering = hasBoulderingGoalSignal(baseRequest);
  const withoutMisleadingDefault = existing.filter((discipline) =>
    shouldKeepBouldering || !/^bouldering$/i.test(discipline),
  );
  const nextDisciplines = Array.from(new Set(["sport", ...withoutMisleadingDefault]));

  return {
    ...baseRequest,
    disciplines: nextDisciplines,
  };
}

function firstDiscipline(request: PlanRequest) {
  return request.disciplines[0] || (/\bclimb/i.test(request.sport) ? "sport" : request.sport);
}

function describeGoal(request: PlanRequest) {
  const parts = [
    request.goalDescription,
    request.goalType !== "ongoing" ? `Goal type: ${request.goalType}` : null,
    request.targetDate ? `Target date: ${request.targetDate}` : null,
    request.trainingFocus.length ? `Focus: ${request.trainingFocus.join(", ")}` : null,
    request.planStructureNotes ? `Plan structure: ${request.planStructureNotes}` : null,
    request.athleteNarrative ? `Athlete context: ${request.athleteNarrative}` : null,
    request.trainingHistory ? `Training history: ${request.trainingHistory}` : null,
    request.recentTrainingLoad ? `Recent load: ${request.recentTrainingLoad}` : null,
    request.sessionLengthPreference ? `Session length: ${request.sessionLengthPreference}` : null,
    request.recoveryCapacity ? `Recovery capacity: ${request.recoveryCapacity}` : null,
    request.motivationContext ? `Motivation: ${request.motivationContext}` : null,
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
