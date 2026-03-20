-- AlterTable Entry: add aiVerified column
ALTER TABLE "Entry" ADD COLUMN "aiVerified" BOOLEAN;

-- AlterTable KontrollAnforderung: add withdrawnAt and manuallyVerifiedAt columns
ALTER TABLE "KontrollAnforderung" ADD COLUMN "withdrawnAt" DATETIME;
ALTER TABLE "KontrollAnforderung" ADD COLUMN "manuallyVerifiedAt" DATETIME;
