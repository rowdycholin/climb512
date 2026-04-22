-- CreateTable
CREATE TABLE "TrainingProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goals" TEXT[],
    "currentGrade" TEXT NOT NULL,
    "targetGrade" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "weeksDuration" INTEGER NOT NULL,
    "daysPerWeek" INTEGER NOT NULL,
    "equipment" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPlan" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Week" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "weekNum" INTEGER NOT NULL,
    "theme" TEXT NOT NULL,
    CONSTRAINT "Week_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Day" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "dayNum" INTEGER NOT NULL,
    "dayName" TEXT NOT NULL,
    "focus" TEXT NOT NULL,
    "isRest" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DaySession" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    CONSTRAINT "DaySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sets" TEXT,
    "reps" TEXT,
    "duration" TEXT,
    "rest" TEXT,
    "notes" TEXT,
    "order" INTEGER NOT NULL,
    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable: workout log entries (one per exercise per day logged)
CREATE TABLE "ExerciseLog" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setsCompleted" INTEGER,
    "repsCompleted" TEXT,
    "weightUsed" TEXT,
    "durationActual" TEXT,
    "notes" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ExerciseLog_pkey" PRIMARY KEY ("id")
);

-- Unique: one log per user per exercise (upsert pattern)
CREATE UNIQUE INDEX "ExerciseLog_exerciseId_userId_key" ON "ExerciseLog"("exerciseId", "userId");

-- AddForeignKey
ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "TrainingProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Week" ADD CONSTRAINT "Week_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TrainingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Day" ADD CONSTRAINT "Day_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DaySession" ADD CONSTRAINT "DaySession_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DaySession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExerciseLog" ADD CONSTRAINT "ExerciseLog_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
