import { z } from "zod";
import {
  partialPlanRequestSchema,
  planRequestSchema,
  planRequestToLegacyPlanInput,
  type PartialPlanRequest,
  type PlanRequest,
} from "./plan-request";
import type { PlanInput } from "./plan-types";
import { getIntakeTemplate, selectIntakeTemplate } from "./intake-templates";

const intakeStepSchema = z.enum([
  "sport",
  "goal",
  "timeline",
  "blockLength",
  "equipment",
  "strength",
  "start",
  "level",
  "schedule",
  "injuries",
  "review",
]);

export const intakeDraftSchema = partialPlanRequestSchema.extend({
  intakeStep: intakeStepSchema.optional(),
  intakeTemplateId: z.string().optional(),
});

export const partialIntakeDraftSchema = intakeDraftSchema.partial();

export type IntakeStep = z.infer<typeof intakeStepSchema>;
export type IntakeDraft = z.infer<typeof intakeDraftSchema>;
export type PartialIntakeDraft = z.infer<typeof partialIntakeDraftSchema>;

export interface IntakeMessage {
  role: "assistant" | "user";
  content: string;
}

export interface IntakeResponse {
  draft: PartialIntakeDraft;
  ready: boolean;
  assistantMessage: string;
}

const DEFAULT_START_DATE = () => new Date().toISOString().slice(0, 10);
const CLIMBING_DISCIPLINES = ["bouldering", "sport", "trad", "ice", "alpine"] as const;
const STRENGTH_TERMS = ["strength", "weights", "weight training", "lifting", "stronger", "gym"];

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseUserDate(text: string) {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/);
  if (!slash) return null;

  const month = parseInt(slash[1], 10);
  const day = parseInt(slash[2], 10);
  const rawYear = slash[3] ? parseInt(slash[3], 10) : new Date().getFullYear();
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function weeksUntil(dateInput: string) {
  const today = new Date();
  const target = new Date(`${dateInput}T00:00:00`);
  const milliseconds = target.getTime() - today.getTime();
  if (milliseconds <= 0) return 4;
  return clampNumber(Math.max(1, Math.round(milliseconds / (7 * 24 * 60 * 60 * 1000))), 1, 52);
}

function parseList(text: string) {
  return text
    .split(/,|;|\band\b/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function detectDiscipline(text: string) {
  if (/\b(?:nose|el cap|big wall|big-wall|multi pitch|multipitch)\b/i.test(text)) return "trad";
  if (/\bboulder/i.test(text)) return "bouldering";
  return CLIMBING_DISCIPLINES.find((discipline) => new RegExp(`\\b${discipline}\\b`, "i").test(text));
}

function detectTrainingFocus(text: string) {
  const focus: string[] = [];
  if (/\bendurance|long days|aerobic|volume\b/i.test(text)) focus.push("endurance");
  if (/\bpower endurance|pump|sustained\b/i.test(text)) focus.push("power endurance");
  if (/\bfinger|hangboard|grip\b/i.test(text)) focus.push("finger strength");
  if (/\bstrength|stronger|weights|lifting|gym\b/i.test(text)) focus.push("strength");
  if (/\btechnique|movement|skill\b/i.test(text)) focus.push("skill");
  return focus;
}

function detectLevels(text: string) {
  return [
    ...Array.from(text.matchAll(/\b(V(?:[0-9]|1[0-7]))\b/gi)),
    ...Array.from(text.matchAll(/\b(5\.(?:[0-9]|1[0-5])(?:[abcd])?)\b/gi)),
    ...Array.from(text.matchAll(/\b(WI[2-7][+-]?)\b/gi)),
  ].map((match) => match[1].toUpperCase().replace(/^5\./, "5."));
}

function isNoAnswer(text: string) {
  return /\b(no|none|nope|nothing|not currently|no injuries)\b/i.test(text);
}

function normalizeSport(text: string) {
  if (/\bclimb(?:ing)?\b/i.test(text)) return "climbing";
  if (/\bweight|strength|lifting|gym\b/i.test(text)) return "strength training";
  return text.trim().toLowerCase();
}

function activeTemplate(draft: PartialIntakeDraft) {
  return draft.intakeTemplateId ? getIntakeTemplate(draft.intakeTemplateId) : selectIntakeTemplate(draft.sport);
}

function activeQuestion(draft: PartialIntakeDraft) {
  const template = activeTemplate(draft);
  return template.questions.find((question) => !question.isComplete(draft)) ?? template.questions.at(-1)!;
}

function nextStep(draft: PartialIntakeDraft) {
  return activeQuestion(draft).step;
}

function nextPrompt(draft: PartialIntakeDraft) {
  return activeQuestion(draft).prompt;
}

function mergeBaseDraft(draft: PartialIntakeDraft): PartialIntakeDraft {
  return {
    ...draft,
    disciplines: draft.disciplines ?? [],
    equipment: draft.equipment ?? [],
    trainingFocus: draft.trainingFocus ?? [],
  };
}

function applyGenericExtraction(draft: PartialIntakeDraft, text: string) {
  const discipline = detectDiscipline(text);
  if (discipline) draft.disciplines = unique([discipline, ...(draft.disciplines ?? [])]);

  const focus = detectTrainingFocus(text);
  if (focus.length) draft.trainingFocus = unique([...(draft.trainingFocus ?? []), ...focus]);

  const levels = detectLevels(text);
  if (levels[0]) draft.currentLevel = levels[0];
  if (levels[1]) draft.targetLevel = levels[1];
  if (!draft.targetLevel && /\b(?:nose|el cap)\b/i.test(text)) draft.targetLevel = "5.9 C2";

  const days = text.match(/\b(\d)\s*(?:day|days)(?:\s*(?:per|\/)\s*week)?\b/i);
  if (days) draft.daysPerWeek = clampNumber(parseInt(days[1], 10), 1, 7);

  const weeks = text.match(/\b(\d{1,2})\s*(?:week|weeks)\b/i);
  if (weeks) draft.blockLengthWeeks = clampNumber(parseInt(weeks[1], 10), 1, 52);

  if (STRENGTH_TERMS.some((term) => new RegExp(`\\b${term}\\b`, "i").test(text))) {
    draft.trainingFocus = unique([...(draft.trainingFocus ?? []), "strength"]);
  }
}

function applyStepAnswer(draft: PartialIntakeDraft, step: IntakeStep, text: string) {
  if (step === "sport") {
    draft.sport = normalizeSport(text);
    if (draft.sport === "climbing" && !draft.disciplines?.length) draft.disciplines = ["bouldering"];
    return;
  }

  if (step === "goal") {
    draft.goalDescription = text;
    if (/\b(?:trip|route|race|event|deadline|goal route|nose|el cap)\b/i.test(text)) draft.goalType = "event";
    if (/\b(?:ongoing|stay in shape|maintain|get better|general)\b/i.test(text)) draft.goalType = "ongoing";
    if (/\b(?:strength|stronger|weights|lifting)\b/i.test(text)) draft.goalType = "strength";
    return;
  }

  if (step === "timeline") {
    const date = parseUserDate(text);
    if (date) {
      draft.goalType = "event";
      draft.targetDate = date;
      draft.blockLengthWeeks = weeksUntil(date);
      return;
    }
    draft.goalType = /\b(?:event|deadline|trip|date)\b/i.test(text) ? "event" : "ongoing";
    return;
  }

  if (step === "blockLength") {
    const weeks = text.match(/\b(\d{1,2})\b/);
    if (weeks) draft.blockLengthWeeks = clampNumber(parseInt(weeks[1], 10), 1, 52);
    return;
  }

  if (step === "equipment") {
    draft.equipment = unique([...(draft.equipment ?? []), ...parseList(text)]);
    return;
  }

  if (step === "strength") {
    draft.strengthTraining = {
      include: !isNoAnswer(text),
      focusAreas: isNoAnswer(text) ? [] : unique([...(draft.strengthTraining?.focusAreas ?? []), ...detectTrainingFocus(text)]),
      experienceLevel: draft.strengthTraining?.experienceLevel,
    };
    return;
  }

  if (step === "start") {
    const date = parseUserDate(text);
    draft.startDate = date ?? (/\b(?:asap|as soon as possible|now|today)\b/i.test(text) ? DEFAULT_START_DATE() : undefined);
    return;
  }

  if (step === "level") {
    const levels = detectLevels(text);
    if (levels[0]) draft.currentLevel = levels[0];
    if (levels[1]) draft.targetLevel = levels[1];
    if (!levels[0]) draft.currentLevel = text;
    return;
  }

  if (step === "schedule") {
    const days = text.match(/\b(\d)\b/);
    if (days) draft.daysPerWeek = clampNumber(parseInt(days[1], 10), 1, 7);
    return;
  }

  if (step === "injuries") {
    draft.constraints = isNoAnswer(text)
      ? { injuries: [], limitations: [], avoidExercises: [] }
      : { injuries: parseList(text), limitations: [], avoidExercises: [] };
  }
}

function isReady(draft: PartialIntakeDraft) {
  return planRequestSchema.safeParse(draft).success;
}

export function createInitialIntakeDraft(): PartialIntakeDraft {
  return {
    disciplines: [],
    equipment: [],
    trainingFocus: [],
    intakeStep: "sport",
    intakeTemplateId: selectIntakeTemplate().id,
  };
}

export function continueIntakeDraft(params: {
  draft: PartialIntakeDraft;
  userMessage: string;
}): IntakeResponse {
  const text = params.userMessage.trim();
  const next = mergeBaseDraft({ ...createInitialIntakeDraft(), ...params.draft });
  const currentStep = next.intakeStep ?? nextStep(next);

  applyGenericExtraction(next, text);
  applyStepAnswer(next, currentStep, text);

  next.intakeTemplateId = selectIntakeTemplate(next.sport).id;
  next.intakeStep = nextStep(next);
  const parsed = partialIntakeDraftSchema.parse(next);

  return {
    draft: parsed,
    ready: isReady(parsed),
    assistantMessage: nextPrompt(parsed),
  };
}

export function intakeDraftToPlanRequest(draft: IntakeDraft | PlanRequest): PlanRequest {
  return planRequestSchema.parse(draft);
}

export function intakeDraftToPlanInput(draft: IntakeDraft | PlanRequest, age: number): PlanInput {
  return planRequestToLegacyPlanInput(intakeDraftToPlanRequest(draft), age);
}

export function parseIntakeDraftJson(raw: string) {
  return planRequestSchema.parse(JSON.parse(raw));
}
