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
