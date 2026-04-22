export interface PlanInput {
  goals: string[];
  currentGrade: string;
  targetGrade: string;
  age: number;
  weeksDuration: number;
  daysPerWeek: number;
  equipment: string[];
  discipline: string;
}

export interface ExerciseData {
  name: string;
  sets?: string;
  reps?: string;
  duration?: string;
  rest?: string;
  notes?: string;
}

export interface SessionData {
  name: string;
  description: string;
  duration: number;
  exercises: ExerciseData[];
}

export interface DayData {
  dayNum: number;
  dayName: string;
  focus: string;
  isRest: boolean;
  sessions: SessionData[];
}

export interface WeekData {
  weekNum: number;
  theme: string;
  days: DayData[];
}

const GRADE_ORDER = ["V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10"];

function gradeIndex(g: string) {
  const idx = GRADE_ORDER.findIndex((x) => x.toLowerCase() === g.toLowerCase());
  return idx === -1 ? 0 : idx;
}

function hasEquipment(equipment: string[], ...items: string[]) {
  return items.some((item) =>
    equipment.some((e) => e.toLowerCase().includes(item.toLowerCase()))
  );
}

function warmup(equipment: string[]): ExerciseData[] {
  return [
    { name: "Easy traversing / footwork drills", duration: "10 min", notes: "Focus on quiet feet, precise placement" },
    { name: "Shoulder circles & wrist mobility", sets: "2", reps: "15 each direction" },
    ...(hasEquipment(equipment, "hangboard")
      ? [{ name: "Hangboard easy open-hand warm-up", sets: "3", duration: "5s on / 10s off", notes: "Use large holds only" }]
      : [{ name: "Dead hangs on large holds", sets: "3", duration: "10s", rest: "30s" }]),
  ];
}

function fingerStrengthExercises(equipment: string[], _level: number): ExerciseData[] {
  if (hasEquipment(equipment, "hangboard")) {
    return [
      { name: "Half-crimp hangs", sets: "4", duration: "7s on / 3s off × 6 reps", rest: "3 min between sets", notes: "Use edge depth appropriate to level" },
      { name: "Open-hand hangs", sets: "3", duration: "10s", rest: "2 min", notes: "Never full crimp if new to hangboarding" },
    ];
  }
  return [
    { name: "Crimp-hold problems on wall", sets: "4", reps: "3–5 attempts", rest: "3 min", notes: "Focus on crimpy routes, not slopers" },
    { name: "Pinch grip holds", sets: "3", reps: "5 attempts each hand", rest: "2 min" },
  ];
}

function enduranceExercises(equipment: string[], _level: number): ExerciseData[] {
  const base = [
    { name: "4×4s (4 routes × 4 sets)", sets: "4", reps: "4 routes", rest: "4 min between sets", notes: "Choose routes 2 grades below project" },
    { name: "Linked laps / continuous climbing", duration: "20 min", notes: "Keep moving, rest on wall only" },
  ];
  if (hasEquipment(equipment, "campus")) {
    base.push({ name: "Campus board low rungs", sets: "3", reps: "5 moves", rest: "3 min", notes: "Lat engagement, do not skip rungs yet" });
  }
  return base;
}

function projectExercises(equipment: string[], _level: number): ExerciseData[] {
  return [
    { name: "Project attempts (at/near limit)", sets: "5–8", reps: "attempts", rest: "5–7 min", notes: "Full rest between goes — quality over quantity" },
    { name: "Limit bouldering — 85–100% effort", sets: "3", reps: "4 problems", rest: "5 min", notes: "Work specific weaknesses" },
    ...(hasEquipment(equipment, "weights", "gym", "weight")
      ? [{ name: "Weighted pull-up", sets: "3", reps: "5", rest: "3 min", notes: "Add weight if bodyweight feels easy" }]
      : [{ name: "Max pull-up / lock-off", sets: "3", reps: "3–5", rest: "3 min" }]),
  ];
}

function cooldown(): ExerciseData[] {
  return [
    { name: "Forearm flexor/extensor stretch", duration: "2 min each side" },
    { name: "Shoulder cross-body stretch", duration: "2 min each side" },
    { name: "Hip flexor & hamstring stretch", duration: "3 min" },
  ];
}

function buildDay(
  dayNum: number,
  dayName: string,
  focus: string,
  type: "finger" | "endurance" | "project" | "rest" | "mobility",
  equipment: string[],
  level: number
): DayData {
  if (type === "rest") {
    return {
      dayNum,
      dayName,
      focus: "Rest & Recovery",
      isRest: true,
      sessions: [
        {
          name: "Active Recovery",
          description: "Light activity to aid recovery — no climbing",
          duration: 30,
          exercises: [
            { name: "Light walk or easy cycling", duration: "20–30 min" },
            { name: "Full-body stretch", duration: "15 min" },
            { name: "Foam rolling — forearms & shoulders", duration: "10 min" },
          ],
        },
      ],
    };
  }

  if (type === "mobility") {
    return {
      dayNum,
      dayName,
      focus: "Mobility & Antagonist Training",
      isRest: false,
      sessions: [
        {
          name: "Mobility & Strength",
          description: "Injury prevention and antagonist muscle work",
          duration: 60,
          exercises: [
            { name: "Push-ups", sets: "3", reps: "15–20", rest: "90s" },
            { name: "Dumbbell shoulder press", sets: "3", reps: "12", rest: "90s" },
            { name: "Wrist curls & reverse wrist curls", sets: "3", reps: "15 each", rest: "60s" },
            { name: "Core plank", sets: "3", duration: "45–60s", rest: "60s" },
            { name: "Hip 90/90 stretch", duration: "3 min each side" },
          ],
        },
      ],
    };
  }

  const sessions: SessionData[] = [
    {
      name: "Warm-Up",
      description: "Prepare joints and tendons for climbing",
      duration: 20,
      exercises: warmup(equipment),
    },
  ];

  if (type === "finger") {
    sessions.push({
      name: "Finger Strength",
      description: "Max-recruitment hangboard / crimp work",
      duration: 45,
      exercises: fingerStrengthExercises(equipment, level),
    });
  } else if (type === "endurance") {
    sessions.push({
      name: "Climbing Endurance",
      description: "Volume and pump tolerance",
      duration: 60,
      exercises: enduranceExercises(equipment, level),
    });
  } else if (type === "project") {
    sessions.push({
      name: "Project Climbing",
      description: "Work at your limit to build power and technique",
      duration: 75,
      exercises: projectExercises(equipment, level),
    });
  }

  sessions.push({
    name: "Cool-Down",
    description: "Reduce soreness and maintain flexibility",
    duration: 15,
    exercises: cooldown(),
  });

  return { dayNum, dayName, focus, isRest: false, sessions };
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function buildWeekSchedule(
  daysPerWeek: number,
  weekPhase: "foundation" | "strength" | "power" | "peak" | "rest"
): Array<{ day: number; type: "finger" | "endurance" | "project" | "rest" | "mobility" }> {
  const patterns: Record<number, string[]> = {
    2: ["project", "rest", "rest", "endurance", "rest", "rest", "rest"],
    3: ["finger", "rest", "endurance", "rest", "project", "rest", "rest"],
    4: ["finger", "endurance", "rest", "project", "rest", "mobility", "rest"],
    5: ["finger", "endurance", "rest", "project", "mobility", "rest", "endurance"],
    6: ["finger", "endurance", "project", "rest", "finger", "endurance", "rest"],
  };

  const clampedDays = Math.min(6, Math.max(2, daysPerWeek));
  const pattern = patterns[clampedDays] || patterns[3];

  if (weekPhase === "rest") {
    return pattern.map((_, i) => ({ day: i + 1, type: "rest" as const }));
  }

  return pattern.map((type, i) => ({
    day: i + 1,
    type: type as "finger" | "endurance" | "project" | "rest" | "mobility",
  }));
}

function weekTheme(weekNum: number, total: number): { theme: string; phase: "foundation" | "strength" | "power" | "peak" | "rest" } {
  const progress = weekNum / total;
  if (weekNum % 4 === 0) return { theme: "Deload & Recovery", phase: "rest" };
  if (progress < 0.3) return { theme: "Foundation & Technique", phase: "foundation" };
  if (progress < 0.6) return { theme: "Strength Building", phase: "strength" };
  if (progress < 0.85) return { theme: "Power & Limit Climbing", phase: "power" };
  return { theme: "Peak Performance", phase: "peak" };
}

export function generatePlan(input: PlanInput): WeekData[] {
  const level = gradeIndex(input.currentGrade);
  const weeks: WeekData[] = [];

  for (let w = 1; w <= input.weeksDuration; w++) {
    const { theme, phase } = weekTheme(w, input.weeksDuration);
    const schedule = buildWeekSchedule(input.daysPerWeek, phase);

    const days: DayData[] = schedule.map((s, idx) => {
      const focus =
        s.type === "finger"
          ? "Finger Strength"
          : s.type === "endurance"
          ? "Endurance"
          : s.type === "project"
          ? "Project Climbing"
          : s.type === "mobility"
          ? "Mobility & Antagonist"
          : "Rest";

      return buildDay(s.day, DAY_NAMES[idx], focus, s.type, input.equipment, level);
    });

    weeks.push({ weekNum: w, theme, days });
  }

  return weeks;
}
