ALTER TABLE "PlanGenerationJob"
  ADD COLUMN "jobType" TEXT NOT NULL DEFAULT 'initial_plan',
  ADD COLUMN "baseVersionId" TEXT,
  ADD COLUMN "changeMetadata" JSONB;

CREATE INDEX "PlanGenerationJob_jobType_idx" ON "PlanGenerationJob"("jobType");
