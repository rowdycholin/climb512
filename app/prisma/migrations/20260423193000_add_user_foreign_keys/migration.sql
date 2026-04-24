DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "TrainingProfile" tp
        LEFT JOIN "User" u ON u."id" = tp."userId"
        WHERE u."id" IS NULL
    ) THEN
        RAISE EXCEPTION 'Cannot add TrainingProfile.userId foreign key because orphaned profiles exist';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "ExerciseLog" el
        LEFT JOIN "User" u ON u."id" = el."userId"
        WHERE u."id" IS NULL
    ) THEN
        RAISE EXCEPTION 'Cannot add ExerciseLog.userId foreign key because orphaned exercise logs exist';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TrainingProfile_userId_idx" ON "TrainingProfile"("userId");
CREATE INDEX IF NOT EXISTS "ExerciseLog_userId_idx" ON "ExerciseLog"("userId");

ALTER TABLE "TrainingProfile"
ADD CONSTRAINT "TrainingProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "ExerciseLog"
ADD CONSTRAINT "ExerciseLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
