ALTER TABLE "Plan"
  ADD COLUMN "generationStatus" TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN "generationError" TEXT,
  ADD COLUMN "generatedWeeks" INTEGER NOT NULL DEFAULT 0;

UPDATE "Plan"
SET "generatedWeeks" = COALESCE((
  SELECT jsonb_array_length(pv."planSnapshot"::jsonb -> 'weeks')
  FROM "PlanVersion" pv
  WHERE pv.id = "Plan"."currentVersionId"
), 0);

CREATE INDEX "Plan_generationStatus_idx" ON "Plan"("generationStatus");

CREATE TABLE "PlanGenerationJob" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "totalWeeks" INTEGER NOT NULL,
  "nextWeekNum" INTEGER NOT NULL DEFAULT 1,
  "lastError" TEXT,
  "repairNotes" TEXT,
  "lockedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlanGenerationJob_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlanGenerationJob"
  ADD CONSTRAINT "PlanGenerationJob_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "Plan"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanGenerationJob"
  ADD CONSTRAINT "PlanGenerationJob_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "PlanGenerationJob_status_lockedAt_idx" ON "PlanGenerationJob"("status", "lockedAt");
CREATE INDEX "PlanGenerationJob_planId_idx" ON "PlanGenerationJob"("planId");
CREATE INDEX "PlanGenerationJob_userId_idx" ON "PlanGenerationJob"("userId");
