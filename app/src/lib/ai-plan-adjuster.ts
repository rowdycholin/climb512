import { z } from "zod";
import { clonePlanSnapshot } from "./plan-access";
import type { PlanSnapshot, ProfileSnapshot } from "./plan-snapshot";

const MODEL = process.env.ANTHROPIC_MODEL ?? "anthropic/claude-haiku-4-5";
const MAX_TOKENS = parseInt(process.env.ANTHROPIC_MAX_TOKENS ?? "5000", 10);
const BASE_URL = (process.env.ANTHROPIC_BASE_URL ?? "https://openrouter.ai/api").replace(/\/$/, "");
const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const adjustmentModeSchema = z.enum(["reorder", "difficulty"]);
export type AdjustmentMode = z.infer<typeof adjustmentModeSchema>;

const nullableString = z.string().nullable();

const exerciseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  sets: nullableString,
  reps: nullableString,
  duration: nullableString,
  rest: nullableString,
  notes: nullableString,
  order: z.number().int().min(0),
});

const sessionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  duration: z.number().int().min(0).max(300),
  exercises: z.array(exerciseSchema),
});

const daySchema = z.object({
  id: z.string(),
  dayNum: z.number().int().min(1).max(7),
  dayName: z.string().min(1),
  focus: z.string().min(1),
  isRest: z.boolean(),
  sessions: z.array(sessionSchema),
});

export const comparableWeekSchema = z.object({
  id: z.string(),
  theme: z.string().min(1),
  days: z.array(daySchema).length(7),
});

const reorderScheduleSchema = z.object({
  id: z.string(),
  dayNum: z.number().int().min(1).max(7),
  dayName: z.string().min(1),
  focus: z.string().min(1),
});

const reorderProposalSchema = z.object({
  mode: z.literal("reorder"),
  summary: z.string().min(1).max(400),
  changes: z.array(z.string().min(1)).min(1).max(8),
  theme: z.string().min(1).max(120),
  schedule: z.array(reorderScheduleSchema),
});

const difficultyProposalSchema = z.object({
  mode: z.literal("difficulty"),
  summary: z.string().min(1).max(400),
  changes: z.array(z.string().min(1)).min(1).max(8),
  week: comparableWeekSchema,
});

export const planAdjustmentProposalSchema = z.discriminatedUnion("mode", [
  reorderProposalSchema,
  difficultyProposalSchema,
]);

export type PlanAdjustmentProposal = z.infer<typeof planAdjustmentProposalSchema>;
export type ComparableWeek = z.infer<typeof comparableWeekSchema>;

function stripCodeFences(text: string) {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function normalizeDifficultyProposal(
  proposal: Extract<PlanAdjustmentProposal, { mode: "difficulty" }>,
): Extract<PlanAdjustmentProposal, { mode: "difficulty" }> {
  return {
    ...proposal,
    week: {
      ...proposal.week,
      days: [...proposal.week.days]
        .sort((a, b) => a.dayNum - b.dayNum)
        .map((day) => ({
          ...day,
          sessions: day.sessions.map((session) => ({
            ...session,
            exercises: [...session.exercises].sort((a, b) => a.order - b.order),
          })),
        })),
    },
  };
}

function buildAdjustmentPrompt(
  profile: ProfileSnapshot,
  week: ComparableWeek,
  mode: AdjustmentMode,
  request: string,
  previousError?: string,
) {
  const trainingDays = week.days
    .filter((day) => day.sessions.length > 0)
    .map((day) => ({
      id: day.id,
      dayNum: day.dayNum,
      dayName: day.dayName,
      focus: day.focus,
      sessions: day.sessions.map((session) => ({
        id: session.id,
        name: session.name,
        duration: session.duration,
        exercises: session.exercises.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
        })),
      })),
    }));

  return `You are an expert climbing coach revising one week of an existing training plan.

ATHLETE:
- Discipline: ${profile.discipline}
- Current grade: ${profile.currentGrade}
- Target grade: ${profile.targetGrade}
- Age: ${profile.age}
- Goals: ${profile.goals.join(", ")}
- Equipment: ${profile.equipment.join(", ") || "none"}
- Schedule: ${profile.daysPerWeek} days/week, ${profile.weeksDuration} weeks total

MODE:
- ${mode}

USER REQUEST:
- ${request}

CURRENT WEEK JSON:
${JSON.stringify(week)}

TRAINING DAYS ONLY:
${JSON.stringify(trainingDays)}

RULES:
- Return JSON only.
- Keep ids unchanged.
- Keep exactly 7 total days.
- Do not add or remove sessions.
- Do not add or remove exercises.
- Keep strings concise.
${mode === "reorder"
    ? `- Only reassign the existing training day ids to different weekday slots.
- Keep the sessions and exercises attached to those same training day ids.
- Each training day id must appear exactly once.
- Use unique dayNum values for the reordered training days.
- Rest days will be rebuilt automatically for the unused weekday slots.`
    : `- Keep the same week id, day ids, session ids, and exercise ids.
- Keep the same number of sessions per day and exercises per session.
- You may adjust theme, focus, duration, sets, reps, duration text, rest, and notes.`}
${previousError ? `- Your previous attempt was rejected for this reason: ${previousError}` : ""}

RESPONSE SHAPE:
${mode === "reorder"
    ? `{
  "mode": "reorder",
  "summary": "short explanation",
  "changes": ["change 1", "change 2"],
  "theme": "short theme",
  "schedule": [
    { "id": "${trainingDays[0]?.id ?? "day-id"}", "dayNum": 6, "dayName": "Saturday", "focus": "Project Climbing" }
  ]
}`
    : `{
  "mode": "difficulty",
  "summary": "short explanation",
  "changes": ["change 1", "change 2"],
  "week": { ...updated full week json... }
}`}`;
}

async function callAdjustmentApi(prompt: string) {
  const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a JSON API for revising a climbing workout week. Return only valid JSON that exactly matches the requested structure.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`AI API error: ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("No adjustment response received from AI");
  }

  return stripCodeFences(content);
}

export function validateAdjustmentProposal(
  currentWeek: ComparableWeek,
  mode: AdjustmentMode,
  proposal: PlanAdjustmentProposal,
) {
  if (proposal.mode !== mode) {
    throw new Error("Adjusted proposal did not match the requested mode");
  }

  if (proposal.mode === "reorder") {
    const trainingDays = currentWeek.days.filter((day) => day.sessions.length > 0);
    const currentTrainingIds = new Set(trainingDays.map((day) => day.id));
    const proposalTrainingIds = new Set(proposal.schedule.map((day) => day.id));

    if (
      currentTrainingIds.size !== proposalTrainingIds.size ||
      Array.from(currentTrainingIds).some((id) => !proposalTrainingIds.has(id))
    ) {
      throw new Error("Adjusted week changed the training day structure");
    }

    const seenDayNums = new Set<number>();
    for (const day of proposal.schedule) {
      if (seenDayNums.has(day.dayNum)) {
        throw new Error("Adjusted week contains duplicate training day numbers");
      }
      seenDayNums.add(day.dayNum);
    }

    return;
  }

  if (proposal.week.id !== currentWeek.id) {
    throw new Error("Adjusted week does not match the requested week");
  }

  const currentDayIds = new Set(currentWeek.days.map((day) => day.id));
  const proposalDayIds = new Set(proposal.week.days.map((day) => day.id));
  if (
    currentDayIds.size !== proposalDayIds.size ||
    Array.from(currentDayIds).some((id) => !proposalDayIds.has(id))
  ) {
    throw new Error("Adjusted week changed the day structure");
  }

  const seenDayNums = new Set<number>();
  for (const day of proposal.week.days) {
    if (seenDayNums.has(day.dayNum)) {
      throw new Error("Adjusted week contains duplicate day numbers");
    }
    seenDayNums.add(day.dayNum);

    const existingDay = currentWeek.days.find((item) => item.id === day.id);
    if (!existingDay) throw new Error("Adjusted week referenced an unknown day");
    if (existingDay.sessions.length !== day.sessions.length) {
      throw new Error("Adjusted week changed the session count for a day");
    }

    const currentSessionIds = new Set(existingDay.sessions.map((session) => session.id));
    const proposalSessionIds = new Set(day.sessions.map((session) => session.id));
    if (
      currentSessionIds.size !== proposalSessionIds.size ||
      Array.from(currentSessionIds).some((id) => !proposalSessionIds.has(id))
    ) {
      throw new Error("Adjusted week changed the session structure");
    }

    for (const session of day.sessions) {
      const existingSession = existingDay.sessions.find((item) => item.id === session.id);
      if (!existingSession) throw new Error("Adjusted week referenced an unknown session");
      if (existingSession.exercises.length !== session.exercises.length) {
        throw new Error("Adjusted week changed the exercise count for a session");
      }

      const currentExerciseIds = new Set(existingSession.exercises.map((exercise) => exercise.id));
      const proposalExerciseIds = new Set(session.exercises.map((exercise) => exercise.id));
      if (
        currentExerciseIds.size !== proposalExerciseIds.size ||
        Array.from(currentExerciseIds).some((id) => !proposalExerciseIds.has(id))
      ) {
        throw new Error("Adjusted week changed the exercise structure");
      }
    }
  }
}

export async function generatePlanAdjustment(
  profile: ProfileSnapshot,
  week: ComparableWeek,
  mode: AdjustmentMode,
  request: string,
) {
  let lastError = "Unknown adjustment error";

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const prompt = buildAdjustmentPrompt(profile, week, mode, request, attempt === 1 ? undefined : lastError);
      const raw = await callAdjustmentApi(prompt);
      const parsed = planAdjustmentProposalSchema.parse(JSON.parse(raw));
      const normalized = parsed.mode === "difficulty" ? normalizeDifficultyProposal(parsed) : parsed;
      validateAdjustmentProposal(week, mode, normalized);
      return normalized;
    } catch (error) {
      lastError = (error as Error).message;
    }
  }

  throw new Error(lastError);
}

export function buildReorderedSnapshot(
  currentSnapshot: PlanSnapshot,
  weekKey: string,
  proposal: Extract<PlanAdjustmentProposal, { mode: "reorder" }>,
) {
  const nextSnapshot = clonePlanSnapshot(currentSnapshot);
  const week = nextSnapshot.weeks.find((item) => item.key === weekKey);
  if (!week) {
    throw new Error("Week not found");
  }

  const proposedById = new Map(proposal.schedule.map((day) => [day.id, day]));
  const usedDayNums = new Set(proposal.schedule.map((day) => day.dayNum));
  const remainingDayNums = DAY_NAMES.map((_, index) => index + 1).filter((dayNum) => !usedDayNums.has(dayNum));
  const restDays = week.days
    .filter((day) => day.sessions.length === 0)
    .sort((a, b) => a.dayNum - b.dayNum);

  if (restDays.length !== remainingDayNums.length) {
    throw new Error("Could not rebuild rest day schedule");
  }

  const restAssignments = new Map(
    restDays.map((day, index) => [
      day.key,
      {
        dayNum: remainingDayNums[index],
        dayName: DAY_NAMES[remainingDayNums[index] - 1],
        focus: "Rest",
        isRest: true,
      },
    ]),
  );

  week.theme = proposal.theme;
  week.days = week.days
    .map((day) => {
      const trainingAssignment = proposedById.get(day.key);
      if (trainingAssignment) {
        return {
          ...day,
          dayNum: trainingAssignment.dayNum,
          dayName: trainingAssignment.dayName,
          focus: trainingAssignment.focus,
          isRest: false,
        };
      }

      const restAssignment = restAssignments.get(day.key);
      if (!restAssignment) {
        throw new Error("Could not rebuild rest day schedule");
      }

      return {
        ...day,
        dayNum: restAssignment.dayNum,
        dayName: restAssignment.dayName,
        focus: restAssignment.focus,
        isRest: restAssignment.isRest,
        sessions: [],
      };
    })
    .sort((a, b) => a.dayNum - b.dayNum);

  return nextSnapshot;
}

export function buildDifficultySnapshot(
  currentSnapshot: PlanSnapshot,
  weekKey: string,
  proposal: Extract<PlanAdjustmentProposal, { mode: "difficulty" }>,
) {
  const nextSnapshot = clonePlanSnapshot(currentSnapshot);
  const week = nextSnapshot.weeks.find((item) => item.key === weekKey);
  if (!week) {
    throw new Error("Week not found");
  }

  week.theme = proposal.week.theme;
  week.days = proposal.week.days
    .map((day) => ({
      key: day.id,
      dayNum: day.dayNum,
      dayName: day.dayName,
      focus: day.focus,
      isRest: day.isRest,
      sessions: day.sessions.map((session) => ({
        key: session.id,
        name: session.name,
        description: session.description,
        duration: session.duration,
        exercises: session.exercises.map((exercise) => ({
          key: exercise.id,
          name: exercise.name,
          sets: exercise.sets ?? null,
          reps: exercise.reps ?? null,
          duration: exercise.duration ?? null,
          rest: exercise.rest ?? null,
          notes: exercise.notes ?? null,
        })),
      })),
    }))
    .sort((a, b) => a.dayNum - b.dayNum);

  return nextSnapshot;
}
