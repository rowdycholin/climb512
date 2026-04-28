ALTER TABLE "Plan" ADD COLUMN "completedAt" TIMESTAMPTZ(3);
ALTER TABLE "Plan" ADD COLUMN "completionReason" TEXT;
ALTER TABLE "Plan" ADD COLUMN "completionNotes" TEXT;
