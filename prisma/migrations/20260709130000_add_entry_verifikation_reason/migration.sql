-- AlterTable: persist WHY an automatic photo verification did not match, so admins/keyholders
-- can see the reason for "Unverified" instead of nothing.
ALTER TABLE "Entry" ADD COLUMN "verifikationReason" TEXT;
ALTER TABLE "Entry" ADD COLUMN "verifikationReasonDetected" TEXT;
