const FINAL_INTAKE_REVIEW_QUESTION =
  "I have the main pieces for the plan. Anything else I should account for before I build it?";
const PREFERRED_WORKOUT_DAYS_QUESTION =
  "That gives me the weekly rhythm. Are there days you prefer for training?";
const PREFERRED_REST_DAYS_QUESTION =
  "Good to know. Any days you prefer to keep easier or fully off?";
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

function countMatches(text, patterns) {
  return patterns.reduce((total, pattern) => total + (pattern.test(text) ? 1 : 0), 0);
}

function activitySignalScores(text) {
  return {
    climbing: countMatches(text, [
      /\b(?:climb(?:ing)?|boulder(?:ing)?|trad|traditional|sport\s*climb(?:ing)?|lead\s*climb(?:ing)?|top\s*rope|toprope|route|crag|send|redpoint)\b/i,
      /\b(?:V(?:[0-9]|1[0-7])|5\.(?:[0-9]|1[0-5])(?:[abcd])?|WI[2-7][+-]?)\b/i,
    ]),
    running: countMatches(text, [
      /\b(?:run(?:ning)?|runner|jog)\b/i,
      /\b(?:race|marathon|half marathon|trail race|road race|5k|10k(?!\s*steps))\b/i,
      /\b\d+(?:\.\d+)?\s*(?:mile|miles|km|kilometers?)(?!\s*(?:walk|steps))\b/i,
    ]),
    cycling: countMatches(text, [
      /\b(?:cycl(?:e|ing|ist)|bike|biking|ride|riding|road riding|mountain biking)\b/i,
      /\b(?:century|gran fondo|criterium)\b/i,
    ]),
    strength: countMatches(text, [
      /\b(?:strength(?:\s+and\s+conditioning|\/conditioning|\s+training)?|conditioning|weight training|weightlifting|weight lifting|lifting|barbell)\b/i,
      /\b(?:functional strength|workout plan|work out plan|gym|planet fitness|dumbbell)\b/i,
      /\b(?:squat|deadlift|bench|press|pull-?up|carry|carrying|holding|hypertrophy|bullet proof body)\b/i,
    ]),
  };
}

function normalizeSport(text) {
  const scores = activitySignalScores(text);
  const ranked = [
    ["climbing", scores.climbing],
    ["strength training", scores.strength],
    ["running", scores.running],
    ["cycling", scores.cycling],
  ];
  const [sport, score] = ranked.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best);
  return score > 0 ? sport : text.trim().toLowerCase();
}

function inferClimbingDisciplines(text) {
  const disciplines = [];
  if (/\bboulder(?:ing)?\b/i.test(text)) disciplines.push("bouldering");
  if (/\b(?:trad|traditional|crack|multi[-\s]?pitch|gear)\b/i.test(text)) disciplines.push("trad");
  if (/\b(?:sport\s*climb(?:ing)?|lead\s*climb(?:ing)?|redpoint|5\.(?:[0-9]|1[0-5])(?:[abcd])?)\b/i.test(text)) disciplines.push("sport");
  if (/\b(?:top\s*rope|toprope)\b/i.test(text)) disciplines.push("top rope");
  return unique(disciplines);
}

function inferActivityFamily(text) {
  const sport = normalizeSport(text);
  return ["climbing", "running", "cycling", "strength training"].includes(sport) ? sport : undefined;
}

function isSportOnlyAnswer(text) {
  return /^(?:climbing|trad(?:itional)?(?:\s+climbing)?|sport\s*climb(?:ing)?|lead\s*climb(?:ing)?|boulder(?:ing)?|top\s*rope(?:\s+climbing)?|toprope(?:\s+climbing)?|running|cycling|strength(?:\s+and\s+conditioning|\s+training)?|strength\/conditioning)[.!?]?$/i.test(text.trim());
}

function sportGoalConflictQuestion(currentSport, inferredSport) {
  return `That sounds like a ${inferredSport} goal, but we started with ${currentSport}. Should I switch the plan to ${inferredSport}, or keep ${currentSport} as support for that goal?`;
}

function isSportGoalConflict(draft, answer) {
  const currentSport = inferActivityFamily(draft.sport ?? "");
  const inferredSport = inferActivityFamily(answer);
  return Boolean(currentSport && inferredSport && currentSport !== inferredSport);
}

function sportGoalClarification(previousAssistant) {
  const match = previousAssistant.match(/sounds like a ([a-z ]+) goal, but we started with ([a-z ]+)\. Should I switch the plan to ([a-z ]+), or keep ([a-z ]+) as support/i);
  if (!match) return undefined;
  return {
    inferredSport: match[1].trim(),
    originalSport: match[2].trim(),
  };
}

function resolveSportGoalClarification(draft, answer, recent, previousAssistant) {
  const clarification = sportGoalClarification(previousAssistant);
  if (!clarification) return false;

  const priorUser = [...recent].reverse().find((message) => message?.role === "user")?.content?.trim();
  const wantsSwitch = /\b(?:switch|change|use|make it|yes)\b/i.test(answer) && new RegExp(`\\b${clarification.inferredSport}\\b`, "i").test(answer);
  const keepOriginal = /\b(?:keep|support|cross[-\s]?train|for support|stay with)\b/i.test(answer) || new RegExp(`\\b${clarification.originalSport}\\b`, "i").test(answer);

  if (wantsSwitch) {
    delete draft.sportGoalConflict;
    draft.sport = clarification.inferredSport;
    if (clarification.inferredSport === "climbing" && !draft.disciplines?.length) draft.disciplines = ["bouldering"];
    if (priorUser && !draft.goalDescription) draft.goalDescription = priorUser;
    if (priorUser) draft.goalType = detectGoalType(priorUser);
    return true;
  }

  if (keepOriginal) {
    delete draft.sportGoalConflict;
    draft.sport = clarification.originalSport;
    if (priorUser && !draft.goalDescription) draft.goalDescription = priorUser;
    if (priorUser) appendNote(draft, `${clarification.originalSport} should support this goal: ${priorUser}`);
    return true;
  }

  return false;
}

function detectGoalType(text) {
  if (/\b(?:race|event|deadline|date|10k|5k|marathon|half marathon|trip|route|competition)\b/i.test(text)) return "event";
  if (/\b(?:strength|stronger|weights|lifting)\b/i.test(text)) return "strength";
  return "ongoing";
}

function formatIsoDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function cleanDate(text, today) {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/);
  if (slash) {
    const month = parseInt(slash[1], 10);
    const day = parseInt(slash[2], 10);
    const rawYear = slash[3] ? parseInt(slash[3], 10) : new Date(`${today}T00:00:00Z`).getUTCFullYear();
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return formatIsoDate(year, month, day);
  }
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

function isVagueEventGoal(text) {
  return /^(?:training\s+for\s+)?(?:an?\s+)?(?:race|event|competition|deadline|trip|ride|route|objective|meet|test|testing date)\.?$/i.test(text.trim());
}

function eventDetailPromptType(message) {
  if (/\b(?:when is it|target date|when is the|what date|date for)\b/i.test(message)) return "date";
  if (/\b(?:what race distance|what running event|what ride|what route|what strength|what event|what target)\b/i.test(message)) return "objective";
  return undefined;
}

function eventDetailsQuestion(draft) {
  const family = inferActivityFamily(draft.sport ?? draft.goalDescription ?? "");
  const vague = !draft.goalDescription || isVagueEventGoal(draft.goalDescription);

  if (vague) {
    if (family === "running") return "A race gives us a real target to build around. What race distance or running event are you training for?";
    if (family === "cycling") return "A ride or race gives us a real target to build around. What ride or race are you training for?";
    if (family === "climbing") return "That objective is worth planning around carefully. What route, grade, trip, or competition are you training for?";
    if (family === "strength training") return "That target is worth programming carefully. What strength, conditioning, or testing target are you training for?";
    return "That gives us a real target to build around. What event or target are you training for?";
  }

  if (!draft.targetDate) {
    if (family === "running") return "When is the race?";
    if (family === "cycling") return "When is the ride or race?";
    if (family === "climbing") return "Do you have a target date for that objective?";
    if (family === "strength training") return "Do you have a target date or testing date?";
    return "Do you have a target date?";
  }

  return undefined;
}

function applyLatestAnswer(draft, latest, previousAssistant, today, recent) {
  const answer = latest.trim();
  if (!answer) return;

  if (resolveSportGoalClarification(draft, answer, recent, previousAssistant)) return;

  const answeringEquipmentPrompt = /\b(?:equipment|tools|setup|available|access to)\b/i.test(previousAssistant);
  if (draft.sport && !answeringEquipmentPrompt && isSportGoalConflict(draft, answer)) {
    return;
  }

  if (!draft.sport && !/\?$/.test(answer)) {
    const sport = normalizeSport(answer);
    if (sport) {
      draft.sport = sport;
      if (sport === "climbing" && !draft.disciplines?.length) {
        const disciplines = inferClimbingDisciplines(answer);
        draft.disciplines = disciplines.length ? disciplines : [];
      }
      if (isSportOnlyAnswer(answer)) return;
    }
  }

  if (!draft.goalDescription && /\b(?:goal|want|train|run|climb|race|10k|5k|marathon|stronger|fitness|endurance)\b/i.test(answer)) {
    draft.goalDescription = answer;
    draft.goalType = detectGoalType(answer);
    if (/\b10k\b/i.test(answer) && !draft.targetLevel) draft.targetLevel = "10K";
  }

  if (!draft.goalType && /\b(?:ongoing|general|fitness|maintain|get better)\b/i.test(answer)) {
    draft.goalType = "ongoing";
  }

  const eventPromptType = eventDetailPromptType(previousAssistant);
  if (eventPromptType === "objective") {
    draft.goalDescription = answer;
    draft.goalType = detectGoalType(answer);
    if (/\b(?:10k|5k|marathon|half marathon|\d+\s*(?:mile|miles|km|kilometers))\b/i.test(answer)) {
      draft.targetLevel = answer;
    }
  }

  if (!draft.targetDate && (eventPromptType === "date" || /\b(?:race|event|deadline|date|trip|competition|send)\b/i.test(answer))) {
    const targetDate = cleanDate(answer, today);
    if (targetDate) {
      draft.goalType = "event";
      draft.targetDate = targetDate;
      if (!draft.blockLengthWeeks) draft.blockLengthWeeks = weeksUntil(today, targetDate);
    }
  }

  if (!draft.targetLevel && eventPromptType === "date") {
    const distance = answer.match(/\b(\d+(?:\.\d+)?)\s*(miles?|km|kilometers?)\b/i);
    if (distance) draft.targetLevel = `${distance[1]} ${distance[2]}`;
  }

  if (!draft.blockLengthWeeks) {
    const weeks = answer.match(/\b(\d{1,2})\s*(?:week|weeks)\b/i);
    if (weeks) draft.blockLengthWeeks = Math.max(1, Math.min(52, parseInt(weeks[1], 10)));
    if (!draft.blockLengthWeeks && /\b(\d{1,2})\s*(?:year|years)\b/i.test(answer) && /\bhow many weeks|block|runway|training block\b/i.test(previousAssistant)) {
      draft.blockLengthClarification = "That sounds like the long-term horizon. For this first training block, how many weeks should we build: 8, 12, or 16?";
    }
    if (!draft.blockLengthWeeks && /\bhow many weeks|block|runway|training block\b/i.test(previousAssistant)) {
      const bareWeeks = answer.match(/^\s*(\d{1,2})\s*\.?$/);
      if (bareWeeks) {
        draft.blockLengthWeeks = Math.max(1, Math.min(52, parseInt(bareWeeks[1], 10)));
        delete draft.blockLengthClarification;
      }
    }
    if (!draft.blockLengthWeeks && /\b10k\b/i.test(draft.goalDescription ?? "")) draft.blockLengthWeeks = 4;
  }

  if (!draft.daysPerWeek) {
    const days = answer.match(/\b([1-7])\b/);
    if (days && /\b(?:day|days|times?|x|sessions?|run|train|week)\b/i.test(answer)) {
      draft.daysPerWeek = Math.max(1, Math.min(7, parseInt(days[1], 10)));
    }
  }

  if (!draft.startDate && /\b(?:when would you like to start|start|first week)\b/i.test(previousAssistant)) {
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
    const primaryStrengthPlan = inferActivityFamily(draft.sport) === "strength training" || inferActivityFamily(draft.goalDescription) === "strength training";
    const explicitStrengthChoice = /\b(?:include|add|want|yes|no|none|skip|avoid).*\bstrength\b|\bstrength\b.*\b(?:include|add|yes|no|none|skip|avoid)\b/i.test(answer);
    if (primaryStrengthPlan || /\bstrength\b/i.test(previousAssistant) || explicitStrengthChoice) {
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
  if (draft.sportGoalConflict) return draft.sportGoalConflict;
  if (draft.blockLengthClarification) return draft.blockLengthClarification;
  const missing = missingFields(draft);
  const next = missing[0];
  if (next === "sport") return "Let's point the plan at the right thing first. What sport or training focus should this plan support?";
  if (next === "goalDescription") {
    const family = inferActivityFamily(draft.sport);
    if (family === "climbing") return "Climbing it is. Is there a specific goal, project, trip, grade, skill, or area you want this plan to train?";
    if (family === "running") return "Running it is. Is there a specific race, distance, pace, volume target, or area you want this plan to train?";
    if (family === "cycling") return "Cycling it is. Is there a specific ride, race, power target, distance, or area you want this plan to train?";
    if (family === "strength training") return "Strength training it is. Is there a specific goal, lift, movement pattern, muscle group, or area you want this plan to train?";
    return "Good, let's give the plan a clear direction. Is there a specific goal, event, skill, or area you want this plan to train?";
  }
  if (next === "goalType") return "That gives me the target. Is it tied to a specific event or date, or is this an ongoing training goal?";
  if (next === "blockLengthWeeks") return eventDetailsQuestion(draft) ?? "That gives me the training direction. How many weeks should this block run?";
  if (next === "daysPerWeek") return "That target is clear enough to start shaping the week. How many days per week can you train and still recover well?";
  if (next === "startDate") return "Good, I can anchor the block around that. When would you like to start?";
  if (next === "currentLevel") {
    const family = inferActivityFamily(draft.sport ?? draft.goalDescription ?? "");
    if (family === "climbing") return "That gives me a useful climbing target. What is your current climbing level?";
    if (family === "running") return "That gives me a useful running target. What is your current running level or weekly mileage?";
    if (family === "cycling") return "That gives me a useful cycling target. What is your current cycling level or weekly riding time?";
    if (family === "strength training") return "That gives me a useful strength target. What is your current strength training experience?";
    return "That gives me a useful target. What is your current training level for this sport or activity?";
  }
  if (next === "equipment") return "Good, I can match the work to your setup. What equipment do you have available?";
  if (next === "constraints") return "That gives me the training picture. Any injuries, pain, or movements I should account for?";
  if (next === "strengthTraining") return "Got it, I can keep the main sport central. Do you want strength and conditioning included, or should this stay focused on the main sport?";
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

  const answeringEquipmentPrompt = /\b(?:equipment|tools|setup|available|access to)\b/i.test(previousAssistant);
  if (draft.sport && !answeringEquipmentPrompt && isSportGoalConflict(draft, latest)) {
    draft.sportGoalConflict = sportGoalConflictQuestion(inferActivityFamily(draft.sport), inferActivityFamily(latest));
  }

  applyLatestAnswer(draft, latest, previousAssistant, today, recent);

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
