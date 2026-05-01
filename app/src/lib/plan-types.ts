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
  rounds?: string;
  work?: string;
  restBetweenReps?: string;
  restBetweenSets?: string;
  load?: string;
  intensity?: string;
  tempo?: string;
  distance?: string;
  grade?: string;
  sides?: string;
  holdType?: string;
  prescriptionDetails?: string;
  modifications?: string;
}

export interface SessionData {
  name: string;
  description: string;
  duration: number;
  objective?: string;
  intensity?: string;
  warmup?: string;
  cooldown?: string;
  exercises: ExerciseData[];
}

export interface DayData {
  dayNum: number;
  dayName: string;
  focus: string;
  isRest: boolean;
  coachNotes?: string;
  sessions: SessionData[];
}

export interface WeekData {
  weekNum: number;
  theme: string;
  summary?: string;
  progressionNote?: string;
  days: DayData[];
}
