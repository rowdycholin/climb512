CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "currentVersionId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanVersion" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "versionNum" INTEGER NOT NULL,
    "basedOnVersionId" TEXT,
    "changeType" TEXT NOT NULL,
    "changeSummary" TEXT,
    "effectiveFromWeek" INTEGER,
    "profileSnapshot" JSONB NOT NULL,
    "planSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkoutLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "weekNum" INTEGER NOT NULL,
    "dayNum" INTEGER NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "exerciseKey" TEXT NOT NULL,
    "exerciseName" TEXT NOT NULL,
    "prescribedSnapshot" JSONB NOT NULL,
    "setsCompleted" INTEGER,
    "repsCompleted" TEXT,
    "weightUsed" TEXT,
    "durationActual" TEXT,
    "notes" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkoutLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_userId_key" ON "User"("userId");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Plan_currentVersionId_key" ON "Plan"("currentVersionId");
CREATE UNIQUE INDEX "PlanVersion_planId_versionNum_key" ON "PlanVersion"("planId", "versionNum");
CREATE UNIQUE INDEX "WorkoutLog_userId_planId_exerciseKey_key" ON "WorkoutLog"("userId", "planId", "exerciseKey");

CREATE INDEX "Plan_userId_idx" ON "Plan"("userId");
CREATE INDEX "PlanVersion_planId_idx" ON "PlanVersion"("planId");
CREATE INDEX "PlanVersion_basedOnVersionId_idx" ON "PlanVersion"("basedOnVersionId");
CREATE INDEX "WorkoutLog_userId_planId_idx" ON "WorkoutLog"("userId", "planId");
CREATE INDEX "WorkoutLog_planVersionId_idx" ON "WorkoutLog"("planVersionId");

ALTER TABLE "Plan" ADD CONSTRAINT "Plan_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Plan" ADD CONSTRAINT "Plan_currentVersionId_fkey"
FOREIGN KEY ("currentVersionId") REFERENCES "PlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_basedOnVersionId_fkey"
FOREIGN KEY ("basedOnVersionId") REFERENCES "PlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_planVersionId_fkey"
FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
