CREATE TABLE "PlanGenerationWeek" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weekNum" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "weekSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "PlanGenerationWeek_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanGenerationWeek_jobId_weekNum_key" ON "PlanGenerationWeek"("jobId", "weekNum");
CREATE INDEX "PlanGenerationWeek_planId_idx" ON "PlanGenerationWeek"("planId");
CREATE INDEX "PlanGenerationWeek_userId_idx" ON "PlanGenerationWeek"("userId");

ALTER TABLE "PlanGenerationWeek"
  ADD CONSTRAINT "PlanGenerationWeek_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "PlanGenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanGenerationWeek"
  ADD CONSTRAINT "PlanGenerationWeek_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanGenerationWeek"
  ADD CONSTRAINT "PlanGenerationWeek_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
