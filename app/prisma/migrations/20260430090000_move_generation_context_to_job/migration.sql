ALTER TABLE "PlanGenerationJob"
  ADD COLUMN "profileSnapshot" JSONB;

UPDATE "PlanGenerationJob" job
SET "profileSnapshot" = pv."profileSnapshot"
FROM "Plan" p
JOIN "PlanVersion" pv ON pv.id = p."currentVersionId"
WHERE job."planId" = p.id
  AND job."profileSnapshot" IS NULL;

UPDATE "PlanGenerationJob" job
SET "profileSnapshot" = '{}'::jsonb
WHERE job."profileSnapshot" IS NULL;

ALTER TABLE "PlanGenerationJob"
  ALTER COLUMN "profileSnapshot" SET NOT NULL;

DELETE FROM "PlanVersion" pv
WHERE pv."changeType" = 'worker_generation_started'
  AND NOT EXISTS (
    SELECT 1
    FROM "WorkoutLog" wl
    WHERE wl."planVersionId" = pv.id
  );
