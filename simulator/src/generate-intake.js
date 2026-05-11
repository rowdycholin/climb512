const FINAL_INTAKE_REVIEW_QUESTION =
  "Great, I have the main pieces. Is there anything else I should know about you or your goals before I am ready to generate the plan?";
const PREFERRED_WORKOUT_DAYS_QUESTION =
  "Good, that gives me the weekly shape. Are there specific days you like to work out?";
const PREFERRED_REST_DAYS_QUESTION =
  "Got it. Are there specific days you would prefer as rest days?";
const READY_MESSAGE =
  "I have enough information to build your plan. Click the magic wand button to generate it.";

function unique(values) {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
}

function extractSection(prompt, label) {
  const marker = `${label}:`;
  const start = prompt.indexOf(marker);
  if (start < 0) return "";
  const rest = prompt.slice(start + marker.length);
  const next = rest.search(/\n[A-Z][A-Z0-9_ ]+:\n/);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

function extractLatestUserMessage(prompt) {
  return extractSection(prompt, "LATEST_USER_MESSAGE")
    .replace(/\n+Return a PlanIntakeAiResponse JSON object\.[\s\S]*$/i, "")
    .trim();
}

function parseJsonSection(prompt, label, fallback) {
  const raw = extractSection(prompt, label);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function parseYesNoSection(prompt, label) {
  return extractSection(prompt, label).trim().toLowerCase() === "yes";
}

function isNoPreference(text) {
  return /^(?:no|nope|none|nothing|no constraints?|no preferences?|that's all|that is all|done)[.!]?\s*$/i.test(text.trim());
}

function parseList(text) {
  return unique(text.split(/,|;|\band\b/i));
}

function appendNote(draft, note) {
  const cleaned = note.trim();
  if (!cleaned || isNoPreference(cleaned)) return;
  const existing = draft.planStructureNotes ?? "";
  if (existing.toLowerCase().includes(cleaned.toLowerCase())) return;
  draft.planStructureNotes = [existing, cleaned].filter(Boolean).join(" | ");
}

function normalizeSport(text) {
  if (/\b(?:climb(?:ing)?|boulder(?:ing)?)\b/i.test(text)) return "climbing";
  if (/\b(?:run(?:ning)?|runner|5k|10k|marathon|half marathon)\b/i.test(text)) return "running";
  if (/\b(?:cycl(?:e|ing|ist)|bike|biking|road riding|mountain biking)\b/i.test(text)) return "cycling";
  if (/\b(?:strength(?:\/conditioning)?|conditioning|weight training|weightlifting|weight lifting|lifting|barbell)\b/i.test(text)) return "strength training";
  return text.trim().toLowerCase();
}

function detectGoalType(text) {
  if (/\b(?:race|event|deadline|date|10k|5k|marathon|half marathon|trip|route|competition)\b/i.test(text)) return "event";
  if (/\b(?:strength|stronger|weights|lifting)\b/i.test(text)) return "strength";
  return "ongoing";
}

function cleanDate(text, today) {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  if (/\b(?:today|now|asap|as soon as possible)\b/i.test(text)) return today;
  return undefined;
}

function weeksUntil(today, targetDate) {
  const start = new Date(`${today}T00:00:00Z`);
  const end = new Date(`${targetDate}T00:00:00Z`);
  const delta = end.getTime() - start.getTime();
  if (!Number.isFinite(delta) || delta <= 0) return 4;
  return Math.max(1, Math.min(52, Math.round(delta / (7 * 24 * 60 * 60 * 1000))));
}

function detectEquipment(text) {
  if (isNoPreference(text)) return ["bodyweight"];
  return parseList(text);
}

function detectCurrentLevel(text) {
  const grade = text.match(/\b(V(?:[0-9]|1[0-7])|5\.(?:[0-9]|1[0-5])(?:[abcd])?|WI[2-7][+-]?)\b/i);
  if (grade) return grade[1].toUpperCase().replace(/^5\./, "5.");
  if (/^\s*(?:beginner|intermediate|advanced|novice|new|experienced)\b/i.test(text)) return text.trim();
  if (/\b(?:mile|miles|km|kilometers|minutes?|hours?|per week|weekly|run|running|comfortable)\b/i.test(text)) return text.trim();
  return undefined;
}

function applyLatestAnswer(draft, latest, previousAssistant, today) {
  const answer = latest.trim();
  if (!answer) return;

  if (!draft.sport && !/\?$/.test(answer)) {
    const sport = normalizeSport(answer);
    if (sport) draft.sport = sport;
    if (sport === "climbing" && !draft.disciplines?.length) draft.disciplines = ["bouldering"];
  }

  if (!draft.goalDescription && /\b(?:goal|want|train|run|climb|race|10k|5k|marathon|stronger|fitness|endurance)\b/i.test(answer)) {
    draft.goalDescription = answer;
    draft.goalType = detectGoalType(answer);
    if (/\b10k\b/i.test(answer) && !draft.targetLevel) draft.targetLevel = "10K";
  }

  if (!draft.goalType && /\b(?:ongoing|general|fitness|maintain|get better)\b/i.test(answer)) {
    draft.goalType = "ongoing";
  }

  if (!draft.targetDate && /\b(?:race|event|deadline|date|trip|competition|send)\b/i.test(answer)) {
    const targetDate = cleanDate(answer, today);
    if (targetDate) {
      draft.goalType = "event";
      draft.targetDate = targetDate;
      if (!draft.blockLengthWeeks) draft.blockLengthWeeks = weeksUntil(today, targetDate);
    }
  }

  if (!draft.blockLengthWeeks) {
    const weeks = answer.match(/\b(\d{1,2})\s*(?:week|weeks)\b/i);
    if (weeks) draft.blockLengthWeeks = Math.max(1, Math.min(52, parseInt(weeks[1], 10)));
    if (!draft.blockLengthWeeks && /\b10k\b/i.test(draft.goalDescription ?? "")) draft.blockLengthWeeks = 4;
  }

  if (!draft.daysPerWeek) {
    const days = answer.match(/\b([1-7])\b/);
    if (days && /\b(?:day|days|times?|x|sessions?|run|train|week)\b/i.test(answer)) {
      draft.daysPerWeek = Math.max(1, Math.min(7, parseInt(days[1], 10)));
    }
  }

  if (!draft.startDate) {
    const startDate = cleanDate(answer, today);
    if (startDate) draft.startDate = startDate;
  }

  if (!draft.currentLevel) {
    const level = detectCurrentLevel(answer);
    if (level) draft.currentLevel = level;
  }

  if ((!draft.equipment || draft.equipment.length === 0) && /\b(?:shoes?|watch|gym|weights?|barbell|dumbbells?|bands?|bike|trainer|bodyweight|none|no)\b/i.test(answer)) {
    draft.equipment = detectEquipment(answer);
  }

  if (!draft.strengthTraining || draft.strengthTraining.include === undefined) {
    if (/\bstrength\b/i.test(previousAssistant) || /\b(?:yes|no|none|skip|weights?|lifting|gym|strength)\b/i.test(answer)) {
      const include = !/\b(?:no|none|nope|skip)\b/i.test(answer);
      draft.strengthTraining = {
        include,
        focusAreas: include ? unique([...(draft.strengthTraining?.focusAreas ?? []), answer]) : [],
      };
    }
  }

  if (!draft.constraints && /\b(?:injur|pain|limitations?|avoid|account for)\b/i.test(previousAssistant)) {
    draft.constraints = /\b(?:no|none|nope|nothing|no injuries|no pain)\b/i.test(answer)
      ? { injuries: [], limitations: [], avoidExercises: [] }
      : { injuries: parseList(answer), limitations: [], avoidExercises: [] };
  }

  if (previousAssistant === PREFERRED_WORKOUT_DAYS_QUESTION) {
    draft.preferredWorkoutDaysAsked = true;
    appendNote(draft, `Preferred workout days: ${answer}`);
  }

  if (previousAssistant === PREFERRED_REST_DAYS_QUESTION) {
    draft.preferredRestDaysAsked = true;
    appendNote(draft, `Preferred rest days: ${answer}`);
  }

  if (previousAssistant === FINAL_INTAKE_REVIEW_QUESTION || /\banything else\b/i.test(previousAssistant)) {
    draft.finalIntakeReviewAsked = true;
    appendNote(draft, answer);
  }
}

function missingFields(draft) {
  const missing = [];
  if (!draft.sport) missing.push("sport");
  if (!draft.goalDescription) missing.push("goalDescription");
  if (!draft.goalType) missing.push("goalType");
  if (!draft.blockLengthWeeks) missing.push("blockLengthWeeks");
  if (!draft.daysPerWeek) missing.push("daysPerWeek");
  if (!draft.startDate) missing.push("startDate");
  if (!draft.currentLevel) missing.push("currentLevel");
  if (!draft.equipment?.length) missing.push("equipment");
  if (!draft.constraints) missing.push("constraints");
  if (!draft.strengthTraining || draft.strengthTraining.include === undefined) missing.push("strengthTraining");
  return missing;
}

function nextQuestion(draft) {
  const missing = missingFields(draft);
  const next = missing[0];
  if (next === "sport") return "Let's build this around the right target. What sport or discipline would you like to train for?";
  if (next === "goalDescription") return "Got it. What goal do you want this training plan to support?";
  if (next === "goalType") return "That helps. Is this for a specific event or an ongoing training goal?";
  if (next === "blockLengthWeeks") return "Good, now we need the size of the block. How many weeks should this training block be?";
  if (next === "daysPerWeek") return "Nice, that gives me the direction. How many days per week can you train?";
  if (next === "startDate") return "Perfect, let's anchor this on the calendar. When would you like to start?";
  if (next === "currentLevel") return "Good context. What is your current training level?";
  if (next === "equipment") return "Great, now I can match the work to what you actually have. What equipment do you have available?";
  if (next === "constraints") return "Before I load this up, I want to keep it sane. Do you have any injuries or pain I should account for?";
  if (next === "strengthTraining") return "One more programming choice. Do you want strength training included in this plan?";
  if (!draft.preferredWorkoutDaysAsked) return PREFERRED_WORKOUT_DAYS_QUESTION;
  if (!draft.preferredRestDaysAsked) return PREFERRED_REST_DAYS_QUESTION;
  if (!draft.finalIntakeReviewAsked) return FINAL_INTAKE_REVIEW_QUESTION;
  return READY_MESSAGE;
}

function generateIntakeResponseFromPrompt(prompt) {
  const startedAt = Date.now();
  const today = extractSection(prompt, "TODAY") || new Date().toISOString().slice(0, 10);
  const draft = {
    disciplines: [],
    equipment: [],
    trainingFocus: [],
    ...parseJsonSection(prompt, "CURRENT_PLAN_REQUEST_DRAFT_JSON", {}),
  };
  const recent = parseJsonSection(prompt, "RECENT_CONVERSATION_JSON", []);
  const latest = extractLatestUserMessage(prompt);
  const previousAssistant = [...recent].reverse().find((message) => message?.role === "assistant")?.content ?? "";

  draft.preferredWorkoutDaysAsked = draft.preferredWorkoutDaysAsked ?? parseYesNoSection(prompt, "PREFERRED_WORKOUT_DAYS_ASKED");
  draft.preferredRestDaysAsked = draft.preferredRestDaysAsked ?? parseYesNoSection(prompt, "PREFERRED_REST_DAYS_ASKED");
  draft.finalIntakeReviewAsked = draft.finalIntakeReviewAsked ?? parseYesNoSection(prompt, "FINAL_INTAKE_REVIEW_ASKED");

  applyLatestAnswer(draft, latest, previousAssistant, today);

  const missing = missingFields(draft);
  const ready = missing.length === 0 &&
    draft.preferredWorkoutDaysAsked &&
    draft.preferredRestDaysAsked &&
    draft.finalIntakeReviewAsked;

  return {
    status: ready ? "ready" : "needs_more_info",
    message: ready ? READY_MESSAGE : nextQuestion(draft),
    planRequestDraft: draft,
    durationMs: Date.now() - startedAt,
  };
}

module.exports = {
  FINAL_INTAKE_REVIEW_QUESTION,
  PREFERRED_REST_DAYS_QUESTION,
  PREFERRED_WORKOUT_DAYS_QUESTION,
  READY_MESSAGE,
  generateIntakeResponseFromPrompt,
};
