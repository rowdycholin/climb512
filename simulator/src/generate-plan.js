const { getTemplatesForDiscipline } = require("./templates");

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function parsePrompt(prompt) {
  const planRequestStart = prompt.indexOf("PLAN_REQUEST_JSON:");
  const athleteContextStart = prompt.indexOf("ATHLETE_CONTEXT:");
  if (planRequestStart !== -1 && athleteContextStart !== -1 && athleteContextStart > planRequestStart) {
    try {
      const requestJson = prompt.slice(planRequestStart + "PLAN_REQUEST_JSON:".length, athleteContextStart).trim();
      const request = JSON.parse(requestJson);
      const weekMatch = prompt.match(/WEEK\s+(\d+)\s+of\s+(\d+)/i);
      const ageMatch = prompt.match(/- Age:\s*(\d+)/i);
      const sport = String(request.sport ?? "generic").toLowerCase();
      const discipline = Array.isArray(request.disciplines) && request.disciplines[0]
        ? String(request.disciplines[0]).toLowerCase()
        : sport.includes("run")
          ? "running"
          : sport.includes("strength") || sport.includes("weight") || sport.includes("lift")
            ? "strength_training"
            : sport.includes("climb")
              ? "bouldering"
              : sport;

      return {
        weekNum: weekMatch ? parseInt(weekMatch[1], 10) : 1,
        weeksDuration: request.blockLengthWeeks ?? (weekMatch ? parseInt(weekMatch[2], 10) : 4),
        sport,
        discipline,
        currentGrade: request.currentLevel ?? "general fitness",
        targetGrade: request.targetLevel ?? request.targetDate ?? "improved fitness",
        goalType: request.goalType ?? "ongoing",
        goalDescription: request.goalDescription ?? "general training",
        targetDate: request.targetDate ?? null,
        trainingFocus: Array.isArray(request.trainingFocus) ? request.trainingFocus.map((item) => String(item).toLowerCase()) : [],
        strengthTraining: request.strengthTraining ?? { include: false, focusAreas: [] },
        constraints: request.constraints ?? { injuries: [], limitations: [], avoidExercises: [] },
        age: ageMatch ? parseInt(ageMatch[1], 10) : 28,
        goals: [request.goalDescription ?? "general training"],
        equipment: Array.isArray(request.equipment) ? request.equipment.map((item) => String(item).toLowerCase()) : [],
        daysPerWeek: request.daysPerWeek ?? 3
      };
    } catch {
      // Fall back to the legacy prompt parser below.
    }
  }

  const weekMatch = prompt.match(/WEEK\s+(\d+)\s+of\s+(\d+)/i);
  const disciplineMatch = prompt.match(/- Discipline:\s*([^\n]+)/i);
  const currentGradeMatch = prompt.match(/- Current grade:\s*([^|]+)\|\s*Target:\s*([^\n]+)/i);
  const ageGoalsMatch = prompt.match(/- Age:\s*(\d+)\s*\|\s*Goals:\s*([^\n]+)/i);
  const equipmentMatch = prompt.match(/- Equipment:\s*([^\n]+)/i);
  const planMatch = prompt.match(/- Plan:\s*(\d+)\s+weeks total,\s*(\d+)\s+training days\/week/i);

  return {
    weekNum: weekMatch ? parseInt(weekMatch[1], 10) : 1,
    weeksDuration: weekMatch ? parseInt(weekMatch[2], 10) : (planMatch ? parseInt(planMatch[1], 10) : 4),
    sport: disciplineMatch ? disciplineMatch[1].trim().toLowerCase() : "climbing",
    discipline: disciplineMatch ? disciplineMatch[1].trim().toLowerCase() : "bouldering",
    currentGrade: currentGradeMatch ? currentGradeMatch[1].trim() : "V4",
    targetGrade: currentGradeMatch ? currentGradeMatch[2].trim() : "V6",
    goalType: "event",
    goalDescription: ageGoalsMatch ? ageGoalsMatch[2].trim() : "send project",
    targetDate: null,
    trainingFocus: [],
    strengthTraining: { include: false, focusAreas: [] },
    constraints: { injuries: [], limitations: [], avoidExercises: [] },
    age: ageGoalsMatch ? parseInt(ageGoalsMatch[1], 10) : 28,
    goals: ageGoalsMatch ? ageGoalsMatch[2].split(",").map((goal) => goal.trim()).filter(Boolean) : ["send-project"],
    equipment: equipmentMatch ? equipmentMatch[1].split(",").map((item) => item.trim().toLowerCase()).filter(Boolean) : [],
    daysPerWeek: planMatch ? parseInt(planMatch[2], 10) : 3
  };
}

function getTrainingDayPattern(daysPerWeek) {
  const patterns = {
    1: [3],
    2: [2, 5],
    3: [1, 3, 5],
    4: [1, 2, 4, 6],
    5: [1, 2, 3, 5, 6],
    6: [1, 2, 3, 4, 5, 6],
    7: [1, 2, 3, 4, 5, 6, 7]
  };

  return patterns[Math.max(1, Math.min(7, daysPerWeek))];
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createRng(seedValue) {
  let state = seedValue >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleList(items, rng) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function getPhaseTheme(input) {
  const { weekNum, weeksDuration, goalType, targetDate } = input;
  if (isDeloadWeek(input)) return "Deload & Movement";

  const progress = weekNum / Math.max(weeksDuration, 1);
  if (goalType === "event" || targetDate) {
    if (progress < 0.3) return "Event Base & Skill";
    if (progress < 0.6) return "Event Build";
    if (progress < 0.85) return "Event Specific Prep";
    return "Event Peak & Taper";
  }

  if (progress < 0.3) return "Ongoing Foundation";
  if (progress < 0.6) return "Ongoing Strength Build";
  if (progress < 0.85) return "Ongoing Capacity";
  return "Ongoing Consolidation";
}

function inferAthleteLevel(input) {
  const text = [
    input.currentGrade,
    input.targetGrade,
    input.goalDescription,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/\b(novice|beginner|new|returning|untrained)\b/.test(text)) return "novice";
  if (/\b(intermediate|recreational)\b/.test(text)) return "intermediate";
  if (/\b(advanced|expert|elite|competitive|pro)\b/.test(text)) return "advanced";

  const vGrade = text.match(/\bv\s*(\d{1,2})\b/);
  if (vGrade) {
    const grade = parseInt(vGrade[1], 10);
    if (grade <= 2) return "novice";
    if (grade <= 6) return "intermediate";
    return "advanced";
  }

  if (/\b5\.(1[2-9]|[2-9]\d)/.test(text)) return "advanced";
  return "intermediate";
}

function deloadInterval(input) {
  const level = inferAthleteLevel(input);
  if (level === "novice") return 4;
  if (level === "intermediate") return 6;
  return 8;
}

function isDeloadWeek(input) {
  const interval = deloadInterval(input);
  return input.weekNum > 0 && input.weekNum % interval === 0;
}

function rpeBand(input) {
  const level = inferAthleteLevel(input);
  if (level === "novice") return { low: "RPE 3-4", main: "RPE 5-6", hard: "RPE 6" };
  if (level === "advanced") return { low: "RPE 4-5", main: "RPE 8-9", hard: "RPE 9-10" };
  return { low: "RPE 4-5", main: "RPE 5-7", hard: "RPE 7" };
}

function applyScenarioOverrides(input, scenario) {
  switch (scenario) {
    case "hangboard_bouldering":
      return {
        ...input,
        discipline: "bouldering",
        equipment: Array.from(new Set([...input.equipment, "hangboard"])),
      };
    case "sport_endurance":
      return {
        ...input,
        discipline: "sport",
        daysPerWeek: Math.max(input.daysPerWeek, 3),
      };
    case "deload_preview":
      return {
        ...input,
        weekNum: 4,
      };
    default:
      return input;
  }
}

function constraintText(input) {
  return [
    ...(input.constraints?.injuries ?? []),
    ...(input.constraints?.limitations ?? []),
    ...(input.constraints?.avoidExercises ?? [])
  ].join(" ").toLowerCase();
}

function shouldAvoidExercise(exercise, input) {
  const text = constraintText(input);
  const name = exercise.name.toLowerCase();

  if (!text) return false;
  if (text.includes("max hang") && (name.includes("hangboard") || name.includes("crimp"))) return true;
  if (text.includes("pulley") && (name.includes("hangboard") || name.includes("crimp"))) return true;
  if (text.includes("shin") && (name.includes("stride") || name.includes("tempo") || name.includes("interval"))) return true;
  if (text.includes("knee") && (name.includes("lunge") || name.includes("split squat"))) return true;
  if (text.includes("shoulder") && (name.includes("press") || name.includes("pull-up") || name.includes("campus"))) return true;

  return (input.constraints?.avoidExercises ?? []).some((avoid) => {
    const avoidText = String(avoid).toLowerCase();
    return avoidText && name.includes(avoidText);
  });
}

function replacementExercise(input) {
  const text = constraintText(input);
  if (text.includes("shin")) {
    return { name: "Low-impact Aerobic Work", duration: "25 min", intensity: "Zone 2", rest: "none", notes: "Bike or brisk walk" };
  }
  if (text.includes("pulley") || text.includes("max hang")) {
    return { name: "Open-hand Technique Drills", sets: "3", duration: "5 min", restBetweenSets: "1 min", holdType: "open hand", notes: "Easy grips, no crimping" };
  }
  if (text.includes("shoulder")) {
    return { name: "Scapular Control Drill", sets: "3", reps: "10", restBetweenSets: "60 sec", intensity: "easy", notes: "Pain-free range only" };
  }
  if (text.includes("knee")) {
    return { name: "Hip Bridge", sets: "3", reps: "12", restBetweenSets: "60 sec", intensity: "easy", notes: "Pain-free hip drive" };
  }

  return { name: "Mobility Reset", duration: "10 min", rest: "none", notes: "Stay easy, pain-free" };
}

function addEquipmentTweaks(exercises, input) {
  const equipmentText = input.equipment.join(" ");

  return exercises.map((exercise) => {
    if (equipmentText.includes("hangboard") && exercise.name === "Wall Crimp Holds") {
      return {
        ...exercise,
        name: "Hangboard Hangs",
        duration: "7 sec",
        notes: "Half-crimp, shoulders active, strict form"
      };
    }

    if ((equipmentText.includes("weights") || equipmentText.includes("gym")) && exercise.name === "Antagonist Push-ups") {
      return {
        ...exercise,
        name: "Weighted Pull-ups",
        reps: "4",
        rest: "2 min",
        notes: "Add light load, crisp reps"
      };
    }

    if (equipmentText.includes("campus board") && exercise.name === "Limit Board Moves") {
      return {
        ...exercise,
        name: "Campus Board Ladders",
        reps: "4 ladders",
        rest: "3 min",
        notes: "Explode upward, stay controlled"
      };
    }

    return exercise;
  }).map((exercise) => shouldAvoidExercise(exercise, input) ? replacementExercise(input) : exercise);
}

function strengthAccessory(input) {
  const focusAreas = input.strengthTraining?.focusAreas ?? [];
  const focusText = focusAreas.join(" ").toLowerCase();

  if (input.discipline === "running") {
    return { name: "Runner Strength Circuit", sets: "2", reps: "8 each", rest: "60 sec", notes: "Hips, calves, trunk" };
  }

  if (focusText.includes("core")) {
    return { name: "Core Strength Circuit", sets: "3", reps: "8 each", rest: "60 sec", notes: "Brace, move with control" };
  }

  return { name: "Strength Accessory Circuit", sets: "3", reps: "8", rest: "90 sec", notes: "Moderate load, clean form" };
}

function enrichExercise(exercise, input) {
  const name = exercise.name.toLowerCase();
  const next = { ...exercise };

  if (next.rest && !next.restBetweenSets) {
    next.restBetweenSets = next.rest;
  }
  if (!next.intensity) {
    const band = rpeBand(input);
    if (name.includes("limit") || name.includes("power") || name.includes("project")) next.intensity = band.hard;
    else if (name.includes("easy") || name.includes("warm")) next.intensity = band.low;
    else next.intensity = band.main;
  }
  if (!next.work && next.duration && /sec|min/.test(String(next.duration))) {
    next.work = next.duration;
  }
  if (!next.grade && input.currentGrade && (name.includes("boulder") || name.includes("problem") || name.includes("route") || name.includes("climb"))) {
    next.grade = String(input.currentGrade);
  }
  if (!next.load && (name.includes("weighted") || name.includes("carry") || name.includes("squat") || name.includes("deadlift") || name.includes("row"))) {
    next.load = "moderate load";
  }
  if (!next.tempo && (name.includes("squat") || name.includes("press") || name.includes("row") || name.includes("push"))) {
    next.tempo = "controlled 2-1-2";
  }
  if (!next.modifications) {
    next.modifications = "Reduce volume or intensity if form breaks.";
  }

  return next;
}

function warmupExercise(input) {
  const band = rpeBand(input);
  if (input.discipline === "running") {
    return { name: "Dynamic Warm-up", duration: "8 min", work: "8 min", intensity: band.low, notes: "Leg swings, skips, easy jog" };
  }
  if (input.discipline === "strength_training") {
    return { name: "Movement Prep", duration: "8 min", work: "8 min", intensity: band.low, notes: "Easy ramp sets and mobility" };
  }
  return { name: "Easy Movement Warm-up", duration: "10 min", work: "10 min", grade: "easy", intensity: band.low, notes: "Easy climbing and mobility" };
}

function cooldownExercise(input) {
  if (input.discipline === "running") {
    return { name: "Cooldown Walk", duration: "6 min", work: "6 min", intensity: "easy", notes: "Let breathing settle" };
  }
  return { name: "Mobility Cooldown", duration: "6 min", work: "6 min", intensity: "easy", notes: "Shoulders, hips, forearms" };
}

function buildTrainingDay(template, dayNum, input, rng) {
  const band = rpeBand(input);
  let exercises = addEquipmentTweaks(template.exercises.slice(0, 4), input).map((exercise) => enrichExercise(exercise, input));
  if (input.strengthTraining?.include && input.discipline !== "strength_training") {
    exercises = [...exercises.slice(0, 3), enrichExercise(strengthAccessory(input), input)];
  }
  const durationJitter = Math.floor(rng() * 2) * 5;
  const mainDuration = 45 + (exercises.length - 3) * 10 + durationJitter;

  return {
    dayNum,
    dayName: DAY_NAMES[dayNum - 1],
    focus: template.focus,
    isRest: false,
    coachNotes: `${template.focus} supports ${input.goalDescription}; keep quality higher than fatigue.`,
    sessions: [
      {
        name: "Warm-up",
        description: "Prepare joints, breathing, and movement quality.",
        duration: 10,
        objective: "Start warm without creating fatigue.",
        intensity: band.low,
        exercises: [warmupExercise(input)]
      },
      {
        name: "Main Session",
        description: template.description,
        duration: mainDuration,
        objective: template.description,
        intensity: exercises.some((exercise) => /8|9|10/.test(String(exercise.intensity))) ? band.hard : band.main,
        exercises
      },
      {
        name: "Cooldown",
        description: "Downshift and leave the session recovered.",
        duration: 8,
        cooldown: "Easy mobility and breathing before leaving the gym.",
        exercises: [cooldownExercise(input)]
      }
    ]
  };
}

function buildRestDay(dayNum) {
  return {
    dayNum,
    dayName: DAY_NAMES[dayNum - 1],
    focus: "Rest",
    isRest: true,
    sessions: []
  };
}

function generateWeekFromPrompt(prompt, options = {}) {
  const scenario = options.scenario ?? "baseline";
  const seed = options.seed ?? "demo-seed";
  const parsedInput = parsePrompt(prompt);
  const input = applyScenarioOverrides(parsedInput, scenario);
  const rng = createRng(hashString(`${seed}:${scenario}:${prompt}`));
  const templates = shuffleList(getTemplatesForDiscipline(input.discipline).focuses, rng);
  const trainingDays = new Set(getTrainingDayPattern(input.daysPerWeek));
  const weekOffset = Math.max(0, input.weekNum - 1) + Math.floor(rng() * templates.length);

  const days = DAY_NAMES.map((_, index) => {
    const dayNum = index + 1;
    if (!trainingDays.has(dayNum)) {
      return buildRestDay(dayNum);
    }

    const trainingIndex = Array.from(trainingDays).indexOf(dayNum);
    const template = templates[(trainingIndex + weekOffset) % templates.length];
    return buildTrainingDay(template, dayNum, input, rng);
  });

  return {
    weekNum: input.weekNum,
    theme: getPhaseTheme(input),
    summary: `${getPhaseTheme(input)} week for ${input.goalDescription}.`,
    progressionNote: input.weekNum === 1
      ? "Establish a repeatable baseline before progressing volume or intensity."
      : "Progress from prior weeks while preserving recovery and movement quality.",
    days
  };
}

module.exports = {
  generateWeekFromPrompt
};
