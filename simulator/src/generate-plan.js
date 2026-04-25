const { getTemplatesForDiscipline } = require("./templates");

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function parsePrompt(prompt) {
  const weekMatch = prompt.match(/WEEK\s+(\d+)\s+of\s+(\d+)/i);
  const disciplineMatch = prompt.match(/- Discipline:\s*([^\n]+)/i);
  const currentGradeMatch = prompt.match(/- Current grade:\s*([^|]+)\|\s*Target:\s*([^\n]+)/i);
  const ageGoalsMatch = prompt.match(/- Age:\s*(\d+)\s*\|\s*Goals:\s*([^\n]+)/i);
  const equipmentMatch = prompt.match(/- Equipment:\s*([^\n]+)/i);
  const planMatch = prompt.match(/- Plan:\s*(\d+)\s+weeks total,\s*(\d+)\s+training days\/week/i);

  return {
    weekNum: weekMatch ? parseInt(weekMatch[1], 10) : 1,
    weeksDuration: weekMatch ? parseInt(weekMatch[2], 10) : (planMatch ? parseInt(planMatch[1], 10) : 4),
    discipline: disciplineMatch ? disciplineMatch[1].trim().toLowerCase() : "bouldering",
    currentGrade: currentGradeMatch ? currentGradeMatch[1].trim() : "V4",
    targetGrade: currentGradeMatch ? currentGradeMatch[2].trim() : "V6",
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

function getPhaseTheme(weekNum, weeksDuration) {
  if (weekNum % 4 === 0) return "Deload & Movement";

  const progress = weekNum / Math.max(weeksDuration, 1);
  if (progress < 0.3) return "Foundation & Control";
  if (progress < 0.6) return "Strength Build";
  if (progress < 0.85) return "Power Focus";
  return "Peak & Specificity";
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

function addEquipmentTweaks(exercises, equipment) {
  const equipmentText = equipment.join(" ");

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
  });
}

function buildTrainingDay(template, dayNum, equipment, rng) {
  const exercises = addEquipmentTweaks(template.exercises.slice(0, 4), equipment);
  const durationJitter = Math.floor(rng() * 2) * 5;

  return {
    dayNum,
    dayName: DAY_NAMES[dayNum - 1],
    focus: template.focus,
    isRest: false,
    sessions: [
      {
        name: template.sessionName,
        description: template.description,
        duration: 45 + (exercises.length - 3) * 10 + durationJitter,
        exercises
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
    return buildTrainingDay(template, dayNum, input.equipment, rng);
  });

  return {
    weekNum: input.weekNum,
    theme: getPhaseTheme(input.weekNum, input.weeksDuration),
    days
  };
}

module.exports = {
  generateWeekFromPrompt
};
