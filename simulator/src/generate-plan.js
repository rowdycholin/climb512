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

function getPhaseTheme(weekNum, weeksDuration) {
  if (weekNum % 4 === 0) return "Deload & Movement";

  const progress = weekNum / Math.max(weeksDuration, 1);
  if (progress < 0.3) return "Foundation & Control";
  if (progress < 0.6) return "Strength Build";
  if (progress < 0.85) return "Power Focus";
  return "Peak & Specificity";
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

function buildTrainingDay(template, dayNum, equipment) {
  const exercises = addEquipmentTweaks(template.exercises.slice(0, 4), equipment);

  return {
    dayNum,
    dayName: DAY_NAMES[dayNum - 1],
    focus: template.focus,
    isRest: false,
    sessions: [
      {
        name: template.sessionName,
        description: template.description,
        duration: 45 + (exercises.length - 3) * 10,
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

function generateWeekFromPrompt(prompt) {
  const input = parsePrompt(prompt);
  const templates = getTemplatesForDiscipline(input.discipline).focuses;
  const trainingDays = new Set(getTrainingDayPattern(input.daysPerWeek));
  const weekOffset = Math.max(0, input.weekNum - 1);

  const days = DAY_NAMES.map((_, index) => {
    const dayNum = index + 1;
    if (!trainingDays.has(dayNum)) {
      return buildRestDay(dayNum);
    }

    const trainingIndex = Array.from(trainingDays).indexOf(dayNum);
    const template = templates[(trainingIndex + weekOffset) % templates.length];
    return buildTrainingDay(template, dayNum, input.equipment);
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
